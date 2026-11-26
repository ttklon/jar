import { describe, expect, it } from "vitest";
import { always, fileName, hasPaths, manifest, neverInside, type Part } from "./supportArchive";

/**
 * Шаг 440: экспорт для поддержки — архив с манифестом, без путей.
 */

const part = (over: Partial<Part> = {}): Part => ({ name: "journal.jsonl", about: "журнал за сутки", size: 120, ...over });

describe("манифест читается человеком", () => {
  it("что внутри, чем собран, чего нет", () => {
    const got = manifest([part()], "0.9.3").manifest;
    expect(got.text).toContain("программа: 0.9.3");
    expect(got.text).toContain("— journal.jsonl: журнал за сутки (120)");
    expect(got.text).toContain("чего в архиве нет: памяти, профилей, содержимого файлов");
  });

  it("память и профили внутрь не пускаются — и это названо", () => {
    const got = manifest([part(), part({ name: "memory.json", about: "факты" }), part({ name: "people", about: "профили" })], "0.9.3");
    expect(got.refused).toEqual(["memory.json", "people"]);
    expect(got.manifest.parts).toHaveLength(1);
  });
});

describe("имя файла без имени пользователя", () => {
  it("версия и дата", () => {
    expect(fileName(new Date(2026, 10, 20), "0.9.3")).toBe("zshelper-support-0.9.3-2026-11-20.zip");
  });

  it("версии нет — dev, а не пусто", () => {
    expect(fileName(new Date(2026, 10, 20), "сборка")).toContain("dev");
  });
});

describe("пути проверяются до сохранения", () => {
  it("Windows-путь найден", () => {
    expect(hasPaths("C:\\Users\\anna\\logs")).toBe(true);
  });

  it("путь в домашней папке найден", () => {
    expect(hasPaths("/home/anna/.zshelper")).toBe(true);
  });

  it("чистый манифест — путей нет", () => {
    expect(hasPaths(manifest([part()], "0.9.3").manifest.text)).toBe(false);
  });
});

describe("что внутри и чего нет", () => {
  it("всегда три вещи", () => {
    expect(always()).toHaveLength(3);
  });

  it("никогда — память, профили, содержимое файлов", () => {
    const got = neverInside();
    expect(got).toHaveLength(3);
    expect(got[0]).toContain("это личное");
  });
});
