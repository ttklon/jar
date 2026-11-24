import { describe, expect, it } from "vitest";
import { compared, kindOf, line, split, stored, word, worthOfWarming, type Timed } from "./startKinds";

/**
 * Шаг 136: холодный старт и тёплый замеряются отдельно, оба — в журнале.
 *
 * «Первый ответ 3,4 с, второй 0,4» читалось как нестабильность, хотя это два разных
 * явления с разными причинами.
 */
const timings: Timed[] = [
  { what: "переименуй фото", ms: 3400, kind: "cold" },
  { what: "переименуй фото", ms: 400, kind: "warm" },
  { what: "проверь диск", ms: 600, kind: "warm" },
];

describe("род определяется фактом", () => {
  it("ядро поднималось — холодный", () => {
    expect(kindOf(true)).toBe("cold");
  });

  it("не поднималось — тёплый", () => {
    expect(kindOf(false)).toBe("warm");
  });

  it("в журнале род назван словами, а не угадывается", () => {
    expect(line(timings[0]!)).toBe("«переименуй фото» · 3400 мс · холодный старт");
    expect(word("warm")).toBe("тёплый");
  });
});

describe("роды не смешиваются", () => {
  it("оба рода видны отдельными числами", () => {
    const got = split(timings);
    expect(got.cold.said).toBe("холодный старт: 1, всего 3400 мс");
    expect(got.warm.said).toBe("тёплый: 2, всего 1000 мс");
  });

  it("средняя по смеси не даётся: она скрывает обе причины", () => {
    expect(split(timings).mixed).toBeNull();
  });

  it("нет холодных — так и сказано, а не «0»", () => {
    expect(split([timings[1]!]).cold.said).toBe("холодных стартов не было");
  });
});

describe("сравнение — внутри рода", () => {
  it("тёплый с тёплым", () => {
    const before: Timed[] = [{ what: "старое", ms: 800, kind: "warm" }];
    expect(compared("warm", timings, before)).toContain("быстрее на 300 мс");
  });

  it("сравнивать не с чем — так и сказано", () => {
    expect(compared("cold", timings, [timings[1]!])).toContain("сравнивать не с чем");
  });
});

describe("сколько стоит прогрев — факт, а не оправдание", () => {
  it("первый раз дороже — на сколько", () => {
    expect(worthOfWarming(split(timings))).toBe("первый раз дороже на 2900 мс: 3400 против 500");
  });

  it("без холодного прогона сравнить нельзя", () => {
    expect(worthOfWarming(split([timings[1]!]))).toContain("не с чем сравнить");
  });
});

describe("род переживает сохранение", () => {
  it("род лежит у замера", () => {
    expect(stored(timings).every((timed) => timed.kind === "cold" || timed.kind === "warm")).toBe(true);
  });
});
