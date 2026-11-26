import { describe, expect, it } from "vitest";
import { inEveryModule, layout, mistakes, steps, type Task } from "./devGuide";

/**
 * Шаг 468: документация для разработчика — как добавить экран / руку / тест.
 */

describe("шаги по порядку и с последствием пропуска", () => {
  it("первый шаг общий: проверить, нет ли уже такого", () => {
    for (const task of ["экран", "рука", "тест"] as Task[]) {
      expect(steps(task)[0]!.do).toContain("ls src/lib");
    }
  });

  it("экран: правило, тест, подключение", () => {
    const got = steps("экран");
    expect(got).toHaveLength(4);
    expect(got[3]!.do).toContain("не повторяет");
  });

  it("рука: опасность — до выполнения", () => {
    const got = steps("рука");
    expect(got[1]!.do).toContain("до написания выполнения");
    expect(got[1]!.skip).toContain("замечают после");
  });

  it("тест: мутация и типизация", () => {
    const got = steps("тест");
    expect(got.join !== undefined).toBe(true);
    expect(got[2]!.do).toContain("сломать код нарочно");
    expect(got[3]!.skip).toContain("упадёт в CI");
  });

  it("у каждого шага есть последствие пропуска", () => {
    for (const task of ["экран", "рука", "тест"] as Task[]) {
      for (const step of steps(task)) expect(step.skip.length).toBeGreaterThan(10);
    }
  });
});

describe("где что лежит", () => {
  it("правило отдельно от экрана", () => {
    const got = layout();
    expect(got).toHaveLength(3);
    expect(got[0]).toContain("без React");
    expect(got[1]).toContain("рядом с правилом");
  });
});

describe("ошибки новичка — с последствием", () => {
  it("четыре ошибки", () => {
    const got = mistakes();
    expect(got).toHaveLength(4);
    expect(got[1]).toContain("git checkout");
  });

  it("что должно быть в каждом правиле", () => {
    const got = inEveryModule();
    expect(got).toHaveLength(4);
    expect(got.join()).toContain("почему так, а не иначе");
  });
});
