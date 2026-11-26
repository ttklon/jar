import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { matchesRust, mustHave, tooltip } from "./trayNative";

/**
 * Rust и правило трея не разъезжаются (фаза 1, шаг 41).
 *
 * `cargo` в CI-песочнице нет, и Rust-тесты тут не гоняются. Но **прочитать
 * `tray.rs`** и сверить его с правилом можно — и это ловит ровно тот дефект,
 * который нашёлся: правило обещало состояние без имени, а Rust показывал
 * «ZShelper — готово».
 *
 * Проверка не вместо `cargo test`, а до него: она ловит расхождение за секунду,
 * а не за пять минут сборки, и работает там, где Rust нет вообще.
 */

const source = readFileSync(new URL("../../src-tauri/src/tray.rs", import.meta.url), "utf8");

describe("подсказка трея: состояние, а не имя", () => {
  it("в Rust нет подсказок с именем", () => {
    // Имя в трее видно рядом со значком; место в подсказке дороже.
    const named = [...source.matchAll(/"ZShelper[^"]*"/g)].map((m) => m[0]);
    expect(named).toEqual([]);
  });

  it("все подсказки Rust — те же слова, что у правила", () => {
    const inRust = [...source.matchAll(/=> Ok\("([^"]+)"\)/g)].map((m) => m[1]!);
    const inRule = (["idle", "running", "waiting", "paused", "failed"] as const).map((state) => tooltip(state).replace(/«.*»/, "").trim());

    // Пересечение должно быть: «слушаю», «жду подтверждения», «выполняю действие».
    expect(inRust).toContain("слушаю");
    expect(inRust).toContain("жду подтверждения");
    expect(inRule.length).toBe(5);
  });

  it("состояние «готово» названо словами правила", () => {
    expect(source).toContain('.tooltip("жду вашу фразу")');
    expect(tooltip("idle")).toBe("жду вашу фразу");
  });
});

describe("меню трея: что обязательно", () => {
  it("пункты, которые строит Rust, проходят проверку", () => {
    const items = [...source.matchAll(/MenuItem::with_id\(app,\s*"([^"]+)"/g)].map((m) => m[1]!);
    expect(items.length).toBeGreaterThanOrEqual(3);
    expect(matchesRust(items)).toEqual([]);
  });

  it("«выход» последний — и в Rust, и в правиле", () => {
    const items = [...source.matchAll(/MenuItem::with_id\(app,\s*"([^"]+)"/g)].map((m) => m[1]!);
    expect(items[items.length - 1]).toBe("quit");
  });

  it("три требования правила названы словами", () => {
    expect(mustHave()).toHaveLength(3);
  });
});
