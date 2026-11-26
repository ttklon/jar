import { describe, expect, it } from "vitest";
import { checks, explain, needs, refused, withoutAdmin, type Action } from "./noAdmin";

/**
 * Шаг 449: никаких прав администратора без явной причины и объяснения.
 */

describe("администратор нужен только там, где нельзя иначе", () => {
  it("установка, общее обновление, изменение системы", () => {
    expect(needs("install").needed).toBe(true);
    expect(needs("updateAll").needed).toBe(true);
    expect(needs("systemChange").needed).toBe(true);
  });

  it("память, модель, автозапуск, файлы, своё обновление — нет", () => {
    for (const action of ["memory", "model", "autostart", "files", "updateMe"] as Action[]) {
      expect(needs(action).needed).toBe(false);
    }
  });

  it("три из восьми — проверка", () => {
    const all: Action[] = ["install", "updateAll", "updateMe", "memory", "model", "autostart", "files", "systemChange"];
    expect(all.filter((action) => needs(action).needed)).toHaveLength(3);
  });
});

describe("перед запросом сказано, что будет сделано", () => {
  it("установка — с альтернативой без UAC", () => {
    const got = explain("install");
    expect(got).toContain("понадобится разрешение Windows");
    expect(got).toContain("%LOCALAPPDATA%");
  });

  it("где администратор не нужен — так и говорим", () => {
    expect(explain("memory")).toBe("администратор не нужен");
  });
});

describe("человек отказал — не «всё сломалось»", () => {
  it("есть альтернатива — продолжим без прав", () => {
    expect(refused("install")).toContain("продолжу без администратора");
  });

  it("есть альтернатива — предлагается сделать самому", () => {
    const got = refused("systemChange");
    expect(got).toContain("продолжу без администратора");
    expect(got).toContain("как сделать самому");
  });
});

describe("без администратора — пять вещей", () => {
  it("включая автозапуск в HKCU", () => {
    const got = withoutAdmin();
    expect(got).toHaveLength(5);
    expect(got.join()).toContain("HKCU");
  });

  it("три проверки", () => {
    expect(checks()).toHaveLength(3);
  });
});
