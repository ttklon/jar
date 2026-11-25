import { describe, expect, it } from "vitest";
import { confirm, neverTouches, options, ready, type Tied } from "./deleteKeepsShared";

/**
 * Шаг 417: удаление профиля не удаляет общие данные без подтверждения.
 */

const tied = (over: Partial<Tied> = {}): Tied => ({
  personal: ["имя «Анна»", "2 факта", "1 разрешение"],
  depended: [{ what: "расписание «резервная копия»", by: 3 }],
  common: ["модель", "настройки программы"],
  ...over,
});

describe("три группы данных, и все три названы", () => {
  it("подтверждение перечисляет их до нажатия", () => {
    const got = confirm("Анна", tied()).join(" ");
    expect(got).toContain("Уйдёт с ним: имя «Анна»");
    expect(got).toContain("нужно другим: расписание «резервная копия» (3)");
    expect(got).toContain("Не тронем: модель, настройки программы");
  });

  it("нет зависимого — нет и разговора о нём", () => {
    const got = confirm("Анна", tied({ depended: [] })).join(" ");
    expect(got).not.toContain("нужно другим");
  });
});

describe("зависимое — выбор человека, а не программы", () => {
  it("три варианта на пункт", () => {
    const got = options(tied());
    expect(got[0]!.choices).toHaveLength(3);
    expect(got[0]!.said).toContain("нужно ещё 3 людям");
  });

  it("склонение одного человека", () => {
    expect(options(tied({ depended: [{ what: "x", by: 1 }] }))[0]!.said).toContain("1 человеку");
  });

  it("не решено — не удаляем", () => {
    const got = ready(tied(), []);
    expect(got.ok).toBe(false);
    expect(got.said).toContain("пока не решите, профиль не удаляю");
  });

  it("решено — удаляем, общее остаётся", () => {
    expect(ready(tied(), ["расписание «резервная копия»"]).said).toContain("общее остаётся");
  });
});

describe("что не трогается никогда", () => {
  it("три общих вещи, включая чужие дела", () => {
    const got = neverTouches().join();
    expect(got).toContain("идут они не для него одного");
    expect(got).toContain("дела других людей");
  });
});
