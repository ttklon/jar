import { describe, expect, it } from "vitest";
import { afterTask, badTimes, idle, mayStart, urgent, whatGoingOn, type Busy } from "./notMidTask";

/**
 * Шаг 317: обновление не запускается во время дела — иначе дело рвётся.
 *
 * Человек теряет не прогресс загрузки, а свою работу.
 */

const busy = (over: Partial<Busy> = {}): Busy => ({
  talking: false,
  running: false,
  inDialog: false,
  downloading: false,
  ...over,
});

describe("дело — состояние программы, а не догадка по времени", () => {
  it("ничего не идёт — можно", () => {
    expect(idle(busy())).toBe(true);
    expect(mayStart(busy()).ok).toBe(true);
  });

  it("каждый признак дела останавливает обновление", () => {
    for (const key of ["talking", "running", "inDialog", "downloading"] as const) {
      expect(idle(busy({ [key]: true }))).toBe(false);
    }
  });

  it("отказ называет, что ждём, а не «занято»", () => {
    const got = mayStart(busy({ talking: true, running: true }));
    expect(got.ok).toBe(false);
    expect(got.said).toContain("разговор");
    expect(got.said).toContain("выполняется действие");
    expect(got.said).not.toBe("занято");
  });

  it("несколько дел — все названы", () => {
    expect(whatGoingOn(busy({ inDialog: true, downloading: true }))).toEqual(["вы заполняете окно", "идёт загрузка"]);
  });
});

describe("сразу после дела — тоже не момент", () => {
  it("предлагается в первое окно без дела", () => {
    const got = afterTask();
    expect(got).toContain("первое окно без дела");
    expect(got).toContain("сразу человек начинает следующее");
  });
});

describe("срочное — спрашивает, но не рвёт", () => {
  it("обычное ждёт", () => {
    expect(urgent(false).ask).toBe(false);
  });

  it("изъян безопасности — спросим сразу", () => {
    const got = urgent(true);
    expect(got.ask).toBe(true);
    expect(got.said).toContain("не прервём");
  });
});

describe("список плохих моментов не расплывается", () => {
  it("пять моментов, включая показ экрана и игру", () => {
    const got = badTimes();
    expect(got.length).toBe(5);
    expect(got.join()).toContain("демонстрация экрана");
  });
});
