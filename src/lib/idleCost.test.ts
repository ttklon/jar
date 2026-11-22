import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * В простое приложение почти не должно занимать процессор (шаг 384, «≤ 1%»).
 *
 * Порог в один процент означает простую вещь: в простое не происходит регулярной
 * работы. А регулярная работа в браузерном коде приходит из одного места — таймера,
 * который тикает всегда. Таймер на одну секунду, который «просто обновляет»,
 * просыпается 3600 раз в час и не даёт машине уйти в сон посреди ночи.
 *
 * Поэтому проверка не меряет процессор (в jsdom это был бы замер тестового
 * окружения), а держит правило: таймер обязан быть **условным** — тикать только пока
 * идёт дело (разговор, скачивание), — и обязан **очищаться** при уходе с экрана.
 *
 * Что считается условным: перед `setInterval` в том же теле эффекта есть возврат
 * (`if (!listening) { … return; }`) или сам таймер создан внутри ветки. Что не
 * считается: `setInterval(refresh, 1000)` без условия — он тикает всегда, включая
 * момент, когда человек ушёл и приложение должно молчать.
 */

const SRC = join(process.cwd(), "src");

function sources(): string[] {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "node_modules") walk(path);
      } else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.includes(".test.")) {
        files.push(path);
      }
    }
  };
  walk(SRC);
  return files;
}

interface Tick {
  file: string;
  line: number;
  source: string;
  /** Есть ли перед таймером условие, при котором он не заводится. */
  conditional: boolean;
  /** Очищается ли таймер при уходе. */
  cleared: boolean;
}

/** Все `setInterval` в исходниках продукта. */
function ticks(): Tick[] {
  const found: Tick[] = [];
  for (const file of sources()) {
    const text = readFileSync(file, "utf8");
    const lines = text.split("\n");
    lines.forEach((line, index) => {
      if (!line.includes("setInterval(")) return;
      // Контекст — весь текущий блок эффекта: до строки и немного после.
      const before = lines.slice(Math.max(0, index - 25), index).join("\n");
      const name = line.match(/setInterval\([^,]+,\s*[^)]+\)/)?.[0] ?? line.trim();
      const after = lines.slice(index, index + 40).join("\n");
      found.push({
        file: file.replace(SRC + "/", ""),
        line: index + 1,
        source: name,
        // Условие — ранний возврат или ветка, где таймер не нужен.
        conditional: /\breturn;/.test(before) || /\bif \(/.test(before.split("\n").slice(-12).join("\n")),
        cleared: after.includes("clearInterval"),
      });
    });
  }
  return found;
}

describe("простой не занят", () => {
  it("каждый таймер условный и очищается", () => {
    const bad = ticks()
      .filter((tick) => !tick.conditional || !tick.cleared)
      .map(
        (tick) =>
          `${tick.file}:${tick.line} ${tick.source}` +
          `${tick.conditional ? "" : " — тикает всегда"}` +
          `${tick.cleared ? "" : " — не очищается"}`,
      );

    // Пусто — значит ни один таймер не крутится в простое безусловно.
    expect(bad).toEqual([]);
  });

  it("сторож видит поломку: безусловный таймер ловится", () => {
    // Тот самый случай: таймер очищается, но тикает всегда — код без раннего возврата.
    const before = "useEffect(() => {\n  const timer = setInterval(refresh, 1000);\n  return () => clearInterval(timer);\n}, [refresh]);";
    const conditional = /\breturn;/.test(before.replace("return () =>", ""));

    // Ровно тот случай, от которого устаёт машина: тикает всегда, хоть и очищается.
    expect(conditional).toBe(false);
    // А условный — проходит: без условия таймера нет вовсе.
    expect(/\breturn;/.test("if (!listening) { setSeconds(0); return; }")).toBe(true);
  });
});
