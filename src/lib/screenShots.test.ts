import { describe, expect, it } from "vitest";
import { caption, check, checks, onStale, themes, type Shot } from "./screenShots";

/**
 * Шаг 463: скриншот каждого экрана в актуальном состоянии.
 */

const shot = (over: Partial<Shot> = {}): Shot => ({ screen: "главный", at: 1, fingerprint: "abc", exists: true, ...over });

describe("скриншот привязан к экрану, а не к дате", () => {
  it("всё совпадает — ок", () => {
    expect(check([shot()], { "главный": "abc" }).ok).toBe(true);
  });

  it("разметка изменилась — устарел, даже если файл есть", () => {
    const got = check([shot()], { "главный": "xyz" });
    expect(got.ok).toBe(false);
    expect(got.stale).toEqual(["главный"]);
  });

  it("дата старая, но разметка та же — не устарел", () => {
    expect(check([shot({ at: 0 })], { "главный": "abc" }).ok).toBe(true);
  });

  it("файла нет — назван, а не пропущен", () => {
    const got = check([shot({ exists: false })], { "главный": "abc" });
    expect(got.missing).toEqual(["главный"]);
    expect(got.said).toContain("снимок экрана здесь");
  });

  it("экран без скриншота — тоже назван", () => {
    expect(check([shot()], { "главный": "abc", настройки: "q" }).missing).toContain("настройки");
  });
});

describe("что делать с устаревшим", () => {
  it("убирается или помечается, но не «похож»", () => {
    const got = onStale("главный");
    expect(got).toContain("а не остаётся как «похожий»");
  });

  it("подпись называет версию и тему", () => {
    expect(caption("главный", "0.9.3", "тёмная")).toBe("главный — 0.9.3, тема «тёмная»");
  });

  it("тем две: каждая следующая тоже устареет", () => {
    expect(themes()).toHaveLength(2);
  });
});

describe("три проверки", () => {
  it("отпечаток, устаревание, отсутствие", () => {
    expect(checks()).toHaveLength(3);
  });
});
