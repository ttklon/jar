import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Шаги 388/397: диск не читается на потоке окна.
 *
 * Почему это проверка на исходнике, а не замер. Замер показал бы «сегодня
 * быстро» — и промолчал бы на медленном диске у человека, где окно
 * замирает на секунды. А правило простое и проверяемое: синхронная команда
 * Tauri (`pub fn`, не `pub async fn`) не должна ходить на диск — обход
 * каталогов, `read_to_string`, `fs::read`, `metadata`.
 *
 * Регулярка не идеальна, и это осознанно: она ловит **появление** чтения в
 * синхронной команде, а не доказывает его отсутствие везде. Ложное
 * срабатывание лечится `spawn_blocking` или `async fn`, а не отключением
 * проверки — отключённая проверка не ловит ничего.
 */

const SRC = join(process.cwd(), "src-tauri", "src");

/** Файлы ядра, кроме тестов: тесты читают диск законно. */
function rustFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return rustFiles(path);
    return name.endsWith(".rs") ? [path] : [];
  });
}

/** Тело синхронной команды и первая строка, где она трогает диск. */
export function diskInSyncCommand(source: string): { line: number; command: string }[] {
  const lines = source.split("\n");
  const found: { line: number; command: string }[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    // Команда объявлена синхронно — значит её тело исполняется на потоке окна.
    if (!/^pub fn \w+\(/.test(line)) continue;
    // Ищем объявление команды выше: без `#[tauri::command]` это обычная
    // функция, и её зовут откуда угодно.
    let above = index - 1;
    let isCommand = false;
    while (above >= 0 && (lines[above] ?? "").trim().startsWith("#[")) {
      if ((lines[above] ?? "").includes("tauri::command")) isCommand = true;
      above -= 1;
    }
    if (!isCommand) continue;

    // Тело: до строки, начинающейся с `}` в нулевой колонке.
    let end = index + 1;
    while (end < lines.length && !/^\}/.test(lines[end] ?? "")) end += 1;
    const body = lines.slice(index, end + 1).join("\n");
    if (/fs::read|read_to_string|read_dir|fs::metadata|symlink_metadata/.test(body)) {
      found.push({ line: index + 1, command: line.trim().slice(0, 60) });
    }
  }
  return found;
}

describe("диск и поток окна", () => {
  it("синхронная команда не читает диск", () => {
    const offenders: string[] = [];
    for (const path of rustFiles(SRC)) {
      const source = readFileSync(path, "utf8");
      // Тестовые модули читают диск законно: это не команда.
      const production = source.split("#[cfg(test)]")[0] ?? "";
      for (const hit of diskInSyncCommand(production)) {
        offenders.push(`${path.replace(SRC + "/", "")}:${hit.line} ${hit.command}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("сторож видит поломку", () => {
    // Без этого теста сторож мог бы молча ничего не находить — и «зелёный»
    // CI ничего бы не значил.
    const broken = [
      "/// Что-то читаем.",
      "#[tauri::command]",
      "pub fn read_places(state: State<'_, AppState>) -> Vec<String> {",
      "    std::fs::read_dir(&state.inner.base_dir).ok();",
      "    Vec::new()",
      "}",
    ].join("\n");
    expect(diskInSyncCommand(broken)).toHaveLength(1);

    // А синхронная команда без диска, обычная функция с диском и
    // асинхронная команда с диском — не нарушения.
    const fine = [
      "#[tauri::command]",
      "pub fn version() -> String {",
      '    env!("CARGO_PKG_VERSION").to_string()',
      "}",
      "fn helper(path: &Path) -> String {",
      "    std::fs::read_to_string(path).unwrap_or_default()",
      "}",
      "#[tauri::command]",
      "pub async fn places() -> Vec<String> {",
      "    let text = std::fs::read_to_string(\"/x\").unwrap_or_default();",
      "    vec![text]",
      "}",
    ].join("\n");
    expect(diskInSyncCommand(fine)).toEqual([]);
  });
});
