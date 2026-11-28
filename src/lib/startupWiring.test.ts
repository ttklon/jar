import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { start } from "./trayStart";

/**
 * Шаг 77: правило тихого старта живёт в двух местах — в правиле `trayStart`
 * (для экрана) и в ядре (`startup.rs`, для настоящего запуска). Разъехаться
 * они могут молча: экран скажет одно, окно откроется по-другому, и заметить
 * это можно только глазами на живом запуске.
 *
 * Компилятора Rust здесь нет, поэтому тест читает исходник ядра и держит
 * решения вместе с правилом — тем же способом, что и для горячих клавиш
 * (`hotkeyRust.test.ts`).
 */

const root = new URL("../../", import.meta.url);
const source = (path: string) => readFileSync(new URL(path, root), "utf8");

describe("тихий старт: правило и ядро говорят одно и то же (шаг 77)", () => {
  const rust = source("src-tauri/src/startup.rs");
  const autostartRust = source("src-tauri/src/autostart.rs");

  it("флаг автозапуска — часть команды запуска, а не отдельная настройка", () => {
    // Если флага нет в команде, Windows поднимет приложение без него, и ядро
    // не отличит вход в Windows от двойного клика.
    expect(autostartRust).toContain('pub const QUIET_FLAG: &str = "--quiet"');
    expect(autostartRust).toMatch(/format!\("\{\} \{\}", quoted\(target\), QUIET_FLAG\)/);
    // Свой же запуск с флагом не должен выглядеть чужим: иначе настройка
    // скажет «в автозапуске другая программа» про наш собственный путь.
    expect(autostartRust).toMatch(/pub fn same_target[\s\S]*strip_prefix\('"'\)/);
  });

  it("ядро решает по способу запуска, а не по настройке", () => {
    // Четыре исхода правила — и все четыре названы в ядре.
    for (const how of ["firstRun", "autostart", "shortcut"]) {
      expect(autostartRust).toContain(`"${how}"`);
    }
    // Ярлык — окно. В исходнике это отдельная ветка, а не `!quiet`: тихий
    // старт к ярлыку не относится вовсе.
    expect(rust).toContain("вы запустили сами: окно показываю");
  });

  it("правило и ядро совпадают по каждому способу запуска", () => {
    // Правило: тихо — только автозапуск и только по выбору.
    expect(start("autostart", true).window).toBe(false);
    expect(rust).toMatch(/"autostart" if quiet_ok => Start \{\s*window: false/);

    // Ярлык и первый запуск — окно всегда, независимо от настройки.
    expect(start("shortcut", true).window).toBe(true);
    expect(start("shortcut", false).window).toBe(true);
    expect(start("autostart", false).window).toBe(true);
    expect(rust).toMatch(/"firstRun" => Start \{\s*window: true/);
  });

  it("тихий старт говорит, где искать программу", () => {
    // Без подсказки «я в трее» тихий старт выглядит как «не запустилось».
    expect(rust).toContain("hint: true");
    expect(start("autostart", true).hint).toBe(true);
    expect(start("shortcut", true).hint).toBe(false);
  });
});
