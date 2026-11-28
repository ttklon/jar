import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

/**
 * Маркер конфликта — не «грязное дерево», а сломанная сборка.
 *
 * Как это случилось в первый раз (шаг 219): при rebase конфликт в
 * `Settings.tsx` разобрали `checkout --ours`, а маркеры остались; `tsc -b` с
 * кешем типов их **не перечитал**, и проверка типов прошла на устаревшем
 * кеше. Ошибка вылезла только при `--force`.
 *
 * Как это случилось во второй раз (D-016, шаг 87). Сторож смотрел на `src`,
 * `tools`, `src-tauri/src` и только на `.ts|.tsx|.rs|.py` — то есть ровно на
 * те файлы, которые ломают сборку. А маркеры попали в **`docs/PLAN-UI-WIRING.md`**:
 * шаг 64 разбирал слияние и закоммитил файл с `<<<<<<< HEAD` внутри. Сборка
 * этого не почувствует, типы — тоже, поэтому двадцать прогонов CI были
 * зелёными, пока план подключения показывал человеку служебный мусор и
 * противоречил сам себе: «64–95 остальные 32» и рядом «✅ 64».
 *
 * Правило: сторож смотрит на **весь репозиторий**, а не на то, что компилируется.
 * Документ — тоже файл репозитория, и человек читает именно его.
 *
 * Почему не «любая строка из семи `=`»: в `research/sources` лежат скачанные
 * страницы, где `=======` — это подчёркивание заголовка в Markdown. Такие
 * строки законны. Конфликт — это **блок**: `<<<<<<<`, затем `=======`, затем
 * `>>>>>>>`. Ищем только блок.
 */

/** Куда не ходим: чужой код и вывод сборки. */
const SKIP = new Set([
  ".git",
  "node_modules",
  "dist",
  "target",
  "coverage",
  ".arena",
  ".cache",
  ".local",
  ".vite",
  "build",
  "out",
  "playwright-report",
  "test-results",
]);

/** Что читаем как текст. Всё остальное — бинарное, там маркеров не бывает. */
const TEXT = /\.(md|ts|tsx|rs|py|json|jsonl|toml|yml|yaml|html|css|psv|txt|js|cjs|mjs)$/;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return SKIP.has(name) ? [] : walk(path);
    return TEXT.test(name) ? [path] : [];
  });
}

/**
 * Блок конфликта в файле: строка `<<<<<<<`, `=======` после неё, `>>>>>>>` после.
 * Возвращает номера строк начала блока — по ним человек найдёт место.
 *
 * Одиночный `=======` не считается: это законное подчёркивание заголовка.
 * Незакрытый блок (`<<<<<<<` без `>>>>>>>`) считается тоже — он означает, что
 * разбор конфликта не довели до конца.
 */
export function markers(file: string): number[] {
  const lines = readFileSync(file, "utf8").split("\n");
  const found: number[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    if (!line.startsWith("<<<<<<< ")) continue;
    let middle = -1;
    let end = -1;
    for (let j = i + 1; j < lines.length; j += 1) {
      const next = lines[j] ?? "";
      if (middle === -1 && next.trimEnd() === "=======") middle = j;
      else if (middle !== -1 && next.startsWith(">>>>>>> ")) {
        end = j;
        break;
      }
    }
    found.push(i + 1);
    i = end === -1 ? i : end;
  }
  return found;
}

describe("D-016: маркеры конфликта — в репозитории, а не только в коде", () => {
  it("ни одного блока <<<<<<< … ======= … >>>>>>> — ни в коде, ни в документах", () => {
    const dirty = walk(process.cwd())
      .map((file) => ({ file, at: markers(file) }))
      .filter((found) => found.at.length > 0)
      .map((found) => `${found.file.replace(process.cwd(), ".")}:${found.at.join(",")}`);

    expect(dirty).toEqual([]);
  });

  it("незакрытый блок тоже назван — разбор, брошенный на середине", () => {
    // Незакрытый блок невидим для поиска пары «=» и «>»: искать их отдельно
    // значит пропустить ровно тот случай, когда человек бросил разбор.
    const probe = join(tmpdir(), "conflict-probe.md");
    writeFileSync(probe, "текст\n<<<<<<< HEAD\nстрока без конца\n", "utf8");
    try {
      expect(markers(probe)).toEqual([2]);
    } finally {
      rmSync(probe, { force: true });
    }
  });
});
