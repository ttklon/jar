import { describe, expect, it } from "vitest";
import { cancel, pause, row, screen, whenText, where, type Item } from "./scheduleScreen";

/**
 * Шаг 327: просмотр и отмена расписания одной кнопкой — и всё в одном месте.
 *
 * Расписание, которое нельзя увидеть списком, перестаёт существовать для человека.
 */

const NOW = Date.UTC(2026, 10, 20, 12, 0);
const DAY = 86_400_000;

const item = (over: Partial<Item> = {}): Item => ({
  id: "disk",
  when: "каждый день в 09:00",
  what: "отчёт о месте на диске",
  lastAt: NOW - 3 * 3600 * 1000,
  lastOutcome: "done",
  paused: false,
  ...over,
});

describe("одна строка — когда, что и как прошло", () => {
  it("всё в строке, без «подробнее»", () => {
    const got = row(item(), NOW);
    expect(got).toBe("каждый день в 09:00 — отчёт о месте на диске [включено]; последний раз сегодня: сделано");
  });

  it("ни разу не запускалось — так и говорим", () => {
    expect(row(item({ lastAt: 0, lastOutcome: "never" }), NOW)).toContain("ещё не запускалось");
  });

  it("на паузе видно в строке", () => {
    expect(row(item({ paused: true }), NOW)).toContain("[на паузе]");
  });

  it("пропуск называется пропуском, а не «сделано»", () => {
    expect(row(item({ lastOutcome: "skipped" }), NOW)).toContain("пропущено");
  });

  it("дата — словами: сегодня, вчера, число", () => {
    expect(whenText(NOW - 1000, NOW)).toBe("сегодня");
    expect(whenText(NOW - DAY, NOW)).toBe("вчера");
    expect(whenText(Date.UTC(2026, 10, 12), NOW)).toBe("2026-11-12");
  });
});

describe("экран видит масштаб", () => {
  it("двадцать на паузе — не «я выключил одно»", () => {
    const got = screen([item(), item({ id: "b", paused: true })], NOW);
    expect(got[got.length - 1]).toBe("всего 2, на паузе 1");
  });

  it("пусто — подсказка фразой, а не пустое окно", () => {
    expect(screen([], NOW)[0]).toContain("скажите «каждый день в 9");
  });
});

describe("отмена — одной кнопкой и с ответом", () => {
  it("не спрашивает «уверены» — но говорит, что отменено", () => {
    const got = cancel(item());
    expect(got.ok).toBe(true);
    expect(got.said).toContain("отменено");
    expect(got.said).toContain("вернуть можно");
  });

  it("пауза сохраняет доверие, удаление — нет", () => {
    expect(pause(item({ paused: true }))).toContain("снова включено");
    expect(pause(item())).toContain("доверие сохранятся");
  });

  it("«одно место» — обещание, а не пожелание", () => {
    expect(where()).toContain("в одном списке");
  });
});
