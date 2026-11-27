/**
 * Заглушка e2e отвечает на всё, что зовёт экран голоса.
 *
 * Дефект. Джоб «voice simulation» падал на тесте голоса с сообщением
 * «expected [] but got ["memory_runs", "engine_status", "registry_snapshot"]».
 * Голос был исправен: экран с какого-то шага стал спрашивать у ядра дела,
 * движок и реестр, а заглушка про них не знала. Неизвестная команда
 * складывалась в `state.unknown`, и красным становился тот тест, который
 * случайно бежал рядом. Три прогона ушли на то, чтобы это увидеть: в
 * аннотациях было только имя теста, без причины.
 *
 * Правило: заглушка знает **все** команды, которые может вызвать экран. Не
 * «те, что нужны сейчас» — следующий шаг добавит вызов, и упадёт снова, но уже
 * молча и не там.
 *
 * Проверка читает оба файла текстом, без запуска браузера: у песочницы нет
 * Chromium, а CI — есть. Это ровно тот случай, когда тест обязан быть дешевле
 * проверяемого.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

/** Команды, которые экран голоса вызывает через `../ipc`. */
function commandsCalledByVoice(): Set<string> {
  const screen = read("../../src/screens/Voice.tsx");
  const ipc = read("../../src/ipc/tauri.ts");
  const imported = /import \{([^}]*)\} from "\.\.\/ipc"/s.exec(screen)?.[1] ?? "";
  const names = imported
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
  const commands = new Set<string>();
  for (const name of names) {
    // `export function name(...)` → `invoke<T>("command")` в том же файле.
    const pattern = new RegExp(
      `export function ${name}\\([^)]*\\)[^{]*\\{\\s*return invoke(?:<[^>]*>)?\\(\\s*"([a-z0-9_]+)"`,
      "s",
    );
    const command = pattern.exec(ipc)?.[1];
    if (command) commands.add(command);
  }
  return commands;
}

/** Команды, на которые заглушка отвечает `case "…"`. */
function commandsAnsweredByHarness(): Set<string> {
  const harness = read("../../e2e/voice-harness.tsx");
  return new Set([...harness.matchAll(/case "([a-z0-9_]+)":/g)].map((match) => match[1] ?? ""));
}

describe("заглушка голоса (e2e)", () => {
  it("экран голоса вообще вызывает команды — иначе проверка ниже пустая", () => {
    expect(commandsCalledByVoice().size).toBeGreaterThan(20);
  });

  it("на каждую команду экрана есть ответ, а не «unknown»", () => {
    const answered = commandsAnsweredByHarness();
    const missing = [...commandsCalledByVoice()].filter((command) => !answered.has(command)).sort();
    // Список печатается целиком: имя пропущенной команды — это и есть диагноз.
    expect(missing).toEqual([]);
  });
});
