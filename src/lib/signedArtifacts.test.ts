import { describe, expect, it } from "vitest";
import { check, checks, HASH_LENGTH, notDo, publish, verify, type Artifact } from "./signedArtifacts";

/**
 * Шаг 489: артефакт сборки с хешами и подписью.
 */

const hash = "a".repeat(64);
const artifact = (over: Partial<Artifact> = {}): Artifact => ({ name: "setup.exe", sha256: hash, signature: "sig:", ...over });

describe("хеш и подпись — разные вещи", () => {
  it("правильный артефакт проходит", () => {
    expect(check(artifact())).toEqual([]);
  });

  it("хеш не посчитан — не с чем сверять", () => {
    expect(check(artifact({ sha256: null, signature: "sig:" })).join()).toContain("хеш не посчитан");
  });

  it("хеш не той длины — названо, сколько знаков", () => {
    const got = check(artifact({ sha256: "abc" })).join();
    expect(got).toContain("не SHA-256");
    expect(got).toContain("3 знаков вместо 64");
  });

  it("не подписан — чужой файл", () => {
    expect(check(artifact({ signature: null })).join()).toContain("никто не скажет, наш это файл");
  });

  it("пустая подпись — то же, что нет", () => {
    expect(check(artifact({ signature: "  " })).join()).toContain("не подписан");
  });

  it("установщик без хеша — худший случай", () => {
    expect(check(artifact({ sha256: null, signature: "s" })).join()).toContain("худший случай для человека");
  });
});

describe("рядом с артефактом — два файла", () => {
  it("хеш и подпись", () => {
    const got = publish(artifact());
    expect(got).toHaveLength(2);
    expect(got[0]).toContain(".sha256");
    expect(got[1]).toContain(".sig");
  });

  it("человек проверяет сам", () => {
    const got = verify();
    expect(got).toHaveLength(3);
    expect(got[2]).toContain("даже если хеш совпал");
  });
});

describe("чего подпись не делает", () => {
  it("ключ не из репозитория", () => {
    expect(notDo()[0]).toContain("который лежит в репозитории");
    expect(checks()).toHaveLength(3);
    expect(HASH_LENGTH).toBe(64);
  });
});
