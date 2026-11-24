import { describe, expect, it } from "vitest";
import { checkFor, done, plan, say, strong } from "./stepProof";

/**
 * Шаг 111: каждый шаг плана называет свою проверку до запуска.
 *
 * «Готово» было верой: проверка появлялась после, у рук была разной силы, а у
 * некоторых не было вовсе.
 */
describe("проверка названа до запуска", () => {
  it("у шага своя проверка, словами", () => {
    expect(checkFor("создать папку", "path", "D:\\Отчёты").said).toContain("путь существует");
    expect(checkFor("переименовать 12 файлов", "count", "12 файлов").said).toContain("число");
  });

  it("проверки разные у разных шагов, а не одна на план", () => {
    const forPath = checkFor("создать папку", "path").said;
    const forCount = checkFor("посчитать", "count").said;
    expect(forPath).not.toBe(forCount);
  });

  it("без проверки — сказано «готово не скажу», и это до запуска", () => {
    const got = checkFor("открыть программу", "none");
    expect(got.said).toContain("проверки нет");
    expect(got.said).toContain("не скажу");
  });
});

describe("слабая проверка названа слабой, а не спрятана", () => {
  it("сильные — те, что про предмет", () => {
    expect(strong("count")).toBe(true);
    expect(strong("content")).toBe(true);
    expect(strong("path")).toBe(false);
    expect(strong("none")).toBe(false);
  });

  it("в плане слабая проверка помечена", () => {
    const got = plan([
      checkFor("создать папку", "path"),
      checkFor("переименовать", "count", "12"),
    ]);
    expect(got.said[0]).toContain("слабая");
    expect(got.said[1]).not.toContain("слабая");
  });

  it("«проверок N из M» — отчёт, а не «всё проверено»", () => {
    const got = plan([checkFor("a", "path"), checkFor("b", "count"), checkFor("c", "none")]);
    expect(say(got)).toContain("проверок по предмету: 1 из 3");
    expect(say(got)).toContain("без проверки: 1");
  });

  it("пустой план — «проверять нечего», а не тишина", () => {
    expect(say(plan([]))).toBe("шагов нет — проверять нечего");
  });
});

describe("«готово» говорит проверка, а не удобство", () => {
  it("шаг без проверки не может быть «готово»", () => {
    expect(done("none", true).ok).toBe(false);
    expect(done("none", true).said).toContain("не скажу");
  });

  it("проверка не подтвердилась — не «готово»", () => {
    expect(done("count", false).ok).toBe(false);
    expect(done("count", false).said).toContain("не подтвердилась");
  });

  it("подтвердилась слабая — «сделано», но с оговоркой", () => {
    const got = done("path", true);
    expect(got.ok).toBe(true);
    expect(got.said).toContain("слабая");
  });

  it("подтвердилась сильная — «сделано и проверено»", () => {
    expect(done("count", true).said).toBe("сделано и проверено");
  });
});
