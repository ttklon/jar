import { describe, expect, it } from "vitest";
import { ask, fragile, FRAGILE, note, plan, type System } from "./contrast";

/**
 * Шаг 186: высокий контраст и системная тема, а не только тёмная по умолчанию.
 *
 * Контраст — это другой вопрос, чем «светлая или тёмная»: человеку с плохим
 * зрением нужны границы, а не другой оттенок.
 */

const sys = (over: Partial<System> = {}): System => ({ dark: true, contrast: false, reduceMotion: false, ...over });
const answers = (map: Record<string, boolean>) => (q: string) => map[q] ?? false;

describe("систему спрашивают, а не угадывают", () => {
  it("три отдельных вопроса: тема, контраст, движение", () => {
    const got = ask(
      answers({ "(prefers-color-scheme: dark)": true, "(forced-colors: active)": true, "(prefers-reduced-motion: reduce)": true }),
    );
    expect(got).toEqual({ dark: true, contrast: true, reduceMotion: true });
  });

  it("старое имя высокого контраста тоже спрашивается", () => {
    // `-ms-high-contrast` остался в старых движках: спросить только стандартное
    // имя значит не заметить настройку.
    expect(ask(answers({ "(-ms-high-contrast: active)": true })).contrast).toBe(true);
  });

  it("движок не умеет рассказать — это не «выключено», и тёмная тема остаётся", () => {
    const got = ask(() => {
      throw new Error("нет matchMedia");
    });
    expect(got.dark).toBe(true);
    expect(got.contrast).toBe(false);
  });
});

describe("в режиме контраста цвета не свои", () => {
  it("системная палитра, а не наша", () => {
    const got = plan(sys({ contrast: true }));
    expect(got.systemColors).toBe(true);
    expect(got.said).toContain("цвета и рамки берутся у системы");
  });

  it("тема при этом следует за системой", () => {
    expect(plan(sys({ contrast: true, dark: false })).theme).toBe("light");
    expect(plan(sys({ contrast: true, dark: true })).theme).toBe("dark");
  });

  it("обычный режим — свои цвета", () => {
    expect(plan(sys()).systemColors).toBe(false);
  });
});

describe("меньше движения — выключаем, а не замедляем", () => {
  it("анимаций нет вовсе", () => {
    const got = plan(sys({ reduceMotion: true }));
    expect(got.still).toBe(true);
    expect(got.said).toContain("выключены полностью, а не замедлены");
  });

  it("без настройки — как обычно", () => {
    expect(plan(sys()).still).toBe(false);
  });
});

describe("что ломается в контрасте", () => {
  it("тень вместо рамки и полупрозрачность — названы, а не подразумеваются", () => {
    const got = fragile(["тень вместо рамки", "полупрозрачность"]);
    expect(got).toHaveLength(2);
    expect(got[0]).toContain("граница пропадает");
    expect(got[1]).toContain("система не отменяет");
  });

  it("чистый список — пусто", () => {
    expect(fragile([])).toEqual([]);
  });

  it("перечень не пустой: проверка, которая ничего не знает, бесполезна", () => {
    expect(FRAGILE.length).toBeGreaterThanOrEqual(4);
  });
});

describe("человеку видно, что его настройку заметили", () => {
  it("все три состояния — словами", () => {
    expect(note(sys({ dark: false, contrast: true, reduceMotion: true }))).toBe(
      "тема системы: светлая · высокая контрастность: включена — цвета берутся у системы · уменьшение движения: включено — анимаций нет",
    );
  });

  it("выключено — тоже сказано, а не пропущено", () => {
    expect(note(sys())).toContain("высокая контрастность: выключена");
  });
});
