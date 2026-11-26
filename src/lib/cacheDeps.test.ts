import { describe, expect, it } from "vitest";
import { buildComplete, checks, keyOk, mustKey, notDo, type Cache } from "./cacheDeps";

/**
 * Шаг 482: кэш зависимостей и артефактов.
 */

const cache = (over: Partial<Cache> = {}): Cache => ({ kind: "deps", key: "lock-123", from: ["package-lock.json"], ...over });

describe("ключ кэша полный и точный", () => {
  it("правка .ts не портит кэш зависимостей", () => {
    const got = keyOk(cache(), ["src/lib/x.ts"]);
    expect(got.ok).toBe(true);
    expect(got.said).toContain("годится");
  });

  it("сменился лок — кэш не тот", () => {
    const got = keyOk(cache(), ["package-lock.json"]);
    expect(got.ok).toBe(false);
    expect(got.said).toContain("пересобрать");
  });

  it("правка внутри каталога из ключа — тоже не тот", () => {
    expect(keyOk(cache({ from: ["src"] }), ["src/lib/x.ts"]).ok).toBe(false);
  });

  it("изменилось и то, и то — названы оба", () => {
    expect(keyOk(cache(), ["package-lock.json", "src/lib/x.ts"]).said).toContain("package-lock.json");
  });
});

describe("ключ сборки обязан быть полным", () => {
  it("лок, tsconfig и исходники — полный", () => {
    const got = buildComplete(cache({ kind: "build", from: ["package-lock.json", "tsconfig.json", "src"] }));
    expect(got).toEqual([]);
  });

  it("без исходников — кэш может врать", () => {
    const got = buildComplete(cache({ kind: "build", from: ["package-lock.json", "tsconfig.json"] }));
    expect(got.join()).toContain("нет исходников");
  });

  it("без locка — названо", () => {
    expect(buildComplete(cache({ kind: "build", from: ["tsconfig.json", "src"] })).join()).toContain("лок-файла");
  });

  it("проверка полного ключа только для сборки", () => {
    expect(buildComplete(cache({ from: [] }))).toEqual([]);
  });
});

describe("три зависимости и три запрета", () => {
  it("в ключе — лок, конфиг, исходники", () => {
    expect(mustKey()).toHaveLength(3);
  });

  it("неверный кэш хуже отсутствующего", () => {
    expect(notDo()[0]).toContain("лучше пересобрать");
    expect(checks()).toHaveLength(3);
  });
});
