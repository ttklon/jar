import { describe, expect, it } from "vitest";
import { clockText, confirm, nightNotice, parse, type Wanted } from "./plainSchedule";

/**
 * Шаг 321: «Каждый день в 9 — отчёт о месте на диске» — без кода.
 *
 * Человек говорит привычную фразу, а не «создайте задачу, выберите триггер».
 */

const wanted = (over: Partial<Wanted> = {}): Wanted => ({ at: 540, what: "отчёт о месте на диске", ...over });

describe("человек говорит, а не настраивает", () => {
  it("«каждый день в 9 — отчёт о месте на диске»", () => {
    const got = parse("каждый день в 9 — отчёт о месте на диске");
    expect(got.ok).toBe(true);
    if (got.ok) {
      expect(got.wanted).toEqual({ at: 540, what: "отчёт о месте на диске" });
      expect(got.said).toBe("каждый день в 09:00: отчёт о месте на диске");
    }
  });

  it("«в 21:30» понимается с минутами", () => {
    const got = parse("каждый день в 21:30 — проверить обновления");
    expect(got.ok && got.wanted.at).toBe(21 * 60 + 30);
  });

  it("«утром» — девять", () => {
    const got = parse("по утрам — отчёт о месте на диске");
    expect(got.ok && got.wanted.at).toBe(540);
  });

  it("«каждый час» — без времени", () => {
    const got = parse("каждый час — проверить загрузки");
    expect(got.ok && got.wanted.at).toBe("hourly");
  });
});

describe("чего не понял — спрашивает, а не угадывает", () => {
  it("неверно созданное расписание хуже отсутствующего", () => {
    expect(parse("сделай что-нибудь полезное")).toEqual({
      ok: false,
      why: "не понял, когда: нужно «каждый день в 9» или «каждый час»",
    });
  });

  it("сказано когда, но не сказано что", () => {
    expect(parse("каждый день в 9").ok).toBe(false);
  });

  it("часов 25 не бывает", () => {
    const got = parse("каждый день в 25 — отчёт");
    expect(got.ok).toBe(false);
    if (!got.ok) expect(got.why).toContain("0–23");
  });

  it("пустая фраза не создаёт ничего", () => {
    expect(parse("   ").ok).toBe(false);
  });
});

describe("ответ — три факта и способ отмены", () => {
  it("когда, что и что будет с пропуском", () => {
    const lines = confirm(wanted()).split("\n");
    expect(lines[0]).toBe("каждый день в 09:00: отчёт о месте на диске");
    expect(lines[1]).toContain("если компьютер спал");
    expect(lines.length).toBe(3);
  });

  it("отмена — фразой или кнопкой, а не «напишите нам»", () => {
    expect(confirm(wanted())).toContain("Пауза");
  });

  it("«каждый час» тоже подтверждается словами", () => {
    expect(confirm(wanted({ at: "hourly" })).split("\n")[0]).toBe("каждый час: отчёт о месте на диске");
  });

  it("время пишется с ведущим нулём", () => {
    expect(clockText(540)).toBe("09:00");
    expect(clockText(2 * 60 + 5)).toBe("02:05");
  });
});

describe("ночью — предупреждение, не запрет", () => {
  it("дело меняет мир в 3 ночи — сказано", () => {
    const got = nightNotice(wanted({ at: 180, what: "почистить папку загрузок" }), true);
    expect(got).toContain("вы, скорее всего, спите");
  });

  it("безопасное дело ночью — тишина", () => {
    expect(nightNotice(wanted({ at: 180, what: "проверить место на диске" }), false)).toBeNull();
  });

  it("днём предупреждения нет", () => {
    expect(nightNotice(wanted(), true)).toBeNull();
  });
});
