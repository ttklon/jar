import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { byDefault, format } from "./hotkeyFree";

/**
 * Шаг 97: горячие клавиши — правило и Rust держатся вместе.
 *
 * Проверка без компилятора: `cargo` в этой среде нет, поэтому расхождение ловится
 * чтением `.rs`, как это уже сделано для трея (`trayRust.test.ts`).
 *
 * Настоящий дефект, который здесь закрыт: правило `hotkeyFree.byDefault()`
 * говорило «по умолчанию Ctrl+Alt+Space», а Rust ставил `Ctrl+Alt+Z`. Человек,
 * прочитавший настройку, нажимал одно, а работало другое — и это выяснялось
 * молча.
 */

const rust = readFileSync(new URL("../../src-tauri/src/hotkey.rs", import.meta.url), "utf8");

/** Акселератор из Rust — в форму правила: `Ctrl+Alt+KeyZ` → `ctrl+alt+z`. */
export function fromRust(accelerator: string): string {
  const parts = accelerator.split("+").map((part) => part.trim().toLowerCase());
  const mods = parts.filter((part) => ["ctrl", "alt", "shift", "win", "super", "meta"].includes(part)).map((part) => (part === "super" || part === "meta" ? "win" : part));
  const key = parts.find((part) => !["ctrl", "alt", "shift", "win", "super", "meta"].includes(part)) ?? "";
  const order = ["ctrl", "alt", "shift", "win"];
  return [...order.filter((mod) => mods.includes(mod)), key.replace(/^key/, "")].join("+");
}

describe("горячая клавиша: правило и Rust", () => {
  it("акселератор показа окна совпадает с сочетанием по умолчанию", () => {
    const found = rust.match(/pub const ACCELERATOR: &str = "([^"]+)"/);
    expect(found).not.toBeNull();
    expect(fromRust(found?.[1] ?? "")).toBe(format(byDefault()).toLowerCase());
  });

  it("то, что видит человек, совпадает с тем, что нажимает", () => {
    // LABEL — подпись для человека; она обязана быть тем же сочетанием, что
    // разбирает Windows, иначе подсказка в настройках врёт.
    const label = rust.match(/pub const LABEL: &str = "([^"]+)"/)?.[1] ?? "";
    const accelerator = rust.match(/pub const ACCELERATOR: &str = "([^"]+)"/)?.[1] ?? "";
    expect(fromRust(accelerator)).toBe(label.toLowerCase().replace(/key/g, ""));
  });

  it("обработчик сравнивает нажатие с действующей клавишей, а не с константой", () => {
    // Настоящий дефект: `with_handler` сравнивал нажатие с `shortcut()`, то есть с
    // умолчанием. Человек назначал свою клавишу, экран говорил «назначено», а окно
    // не показывалось — потому что обработчик про неё не знал.
    const handler = rust.match(/\.with_handler\([\s\S]*?\)\s*\n\s*\.build\(\)/)?.[0] ?? "";
    expect(handler).not.toBe("");
    expect(handler).toContain("active_spec()");
    expect(handler).not.toMatch(/pressed == &shortcut\(\)/);
  });

  it("сохранённая клавиша ставится при старте, и подпись берётся из неё", () => {
    // Иначе назначение живёт до перезапуска: сохранили, а после запуска снова
    // умолчание — тот же «сохранили, а не работает», только отложенный.
    expect(rust).toMatch(/pub fn active_spec\(\)/);
    expect(rust).toMatch(/pub fn saved\(\)/);
    expect(rust).toMatch(/pub fn save\(/);
    // Файл лежит в данных человека, а не в папке программы: её переустанавливают.
    expect(rust).toContain('join("ZShelper")');
  });

  it("новая клавиша проверяется до снятия прежней", () => {
    // Порядок — не стиль: сними прежнюю раньше — и человек на мгновение остаётся
    // без клавиши, а при отказе и вовсе без неё.
    const apply = rust.match(/pub fn apply\([\s\S]*?\n\}/)?.[0] ?? "";
    expect(apply).not.toBe("");
    const registerAt = apply.indexOf("shortcuts.register(next_shortcut)");
    const unregisterAt = apply.indexOf("shortcuts.unregister(old)");
    expect(registerAt).toBeGreaterThan(-1);
    expect(unregisterAt).toBeGreaterThan(registerAt);
  });

  it("удержание для разговора не занимает системное сочетание", () => {
    const talk = rust.match(/pub const TALK_ACCELERATOR: &str = "([^"]+)"/)?.[1] ?? "";
    // `ctrl+space` не входит в список системных: раскладку Windows переключает
    // `alt+shift`/`win+space`, а `ctrl+space` свободно.
    expect(fromRust(talk)).toBe("ctrl+space");
  });
});
