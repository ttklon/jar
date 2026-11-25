import { describe, expect, it } from "vitest";
import { STRENGTHS, audit, boundaries, pitch, shortLine, type Strength } from "./ownStrengths";

/**
 * Шаг 295: свои сильные стороны назвать явно — русский, локальность, руки на Windows.
 *
 * Таблица заимствований без этого превращается в копию без души.
 */

const strength = (over: Partial<Strength> = {}): Strength => ({
  id: "ru",
  name: "русский язык",
  edge: "понимаем команду так, как её говорят: «включи свет на кухне»",
  limit: "смешанная речь «включи Docker desktop» — не всегда",
  ...over,
});

describe("три силы, и каждая с границей", () => {
  it("ровно три — столько удержится в голове", () => {
    expect(STRENGTHS.length).toBe(3);
    expect(STRENGTHS.map((item) => item.id)).toEqual(["ru", "local", "hands"]);
  });

  it("у каждой названа граница — иначе это лозунг", () => {
    expect(audit().ok).toBe(true);
    expect(audit().problems).toEqual([]);
  });

  it("граница про сейчас, а не «починим в будущем»", () => {
    const got = audit([strength({ limit: "скоро починим это в будущем релизе" })]);
    expect(got.ok).toBe(false);
    expect(got.problems.join()).toContain("обещает будущее");
  });

  it("короткая граница — тоже лозунг", () => {
    expect(audit([strength({ limit: "бывает" })]).problems.join()).toContain("граница не названа");
  });

  it("сила дважды — это уже список фич", () => {
    const got = audit([strength(), strength()]);
    expect(got.problems.join()).toContain("заявлена дважды");
  });

  it("больше трёх сил — теряется смысл", () => {
    const got = audit([strength(), strength({ id: "local", name: "локальность" }), strength({ id: "hands", name: "руки" }), strength({ id: "x" as Strength["id"], name: "ещё" })]);
    expect(got.problems.join()).toContain("сил больше трёх");
  });
});

describe("руки на Windows — сила с названным риском", () => {
  it("захват клавиатуры ломается на играх и защищённых окнах", () => {
    const hands = STRENGTHS.find((item) => item.id === "hands")!;
    expect(hands.limit).toContain("защищённые окна");
    expect(hands.edge).toContain("нажимаем");
  });

  it("локальность — без сети и без аккаунта", () => {
    const local = STRENGTHS.find((item) => item.id === "local")!;
    expect(local.edge).toContain("без аккаунта");
  });

  it("для «О программе» — одна строка на силу", () => {
    expect(shortLine(STRENGTHS[0]!)).toBe(
      "русский язык: понимаем команду так, как её говорят: «включи свет на кухне», «сделай потише»",
    );
  });
});

describe("чего у нас нет — тоже названо", () => {
  it("три области, а не молчание", () => {
    expect(boundaries().length).toBe(3);
  });

  it("чужой экран не читаем без запроса", () => {
    expect(boundaries().join()).toContain("только своё окно");
  });

  it("обещание без будущего времени", () => {
    const got = pitch();
    expect(got).toContain("по-русски");
    expect(got).toContain("без сети");
    expect(got).toContain("руками на Windows");
    expect(got).not.toMatch(/скоро|в будущем/i);
  });
});
