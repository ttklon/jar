import { describe, expect, it } from "vitest";
import { DAYS, consistent, confirm, decide, say, substitute, type Nature } from "./lifetime";

/**
 * Шаг 264: срок жизни — временное забывается, постоянное подтверждается.
 *
 * Дефект: свежесть считалась **в двух местах и по-разному** — `STALE_MS = 30
 * дней` в предпочтениях, `AGES_MS = 7 дней` в способах. Оба числа верны для
 * своего вида, но правила «почему 30, а не 7» не было ни в одном, и третий вид
 * появился бы с третьим случайным числом.
 *
 * Суть: у фактов разная **природа**, и она задаёт срок. Временное забывается
 * само. Постоянное не забывается — оно перестаёт считаться текущим и спрашивает
 * подтверждение. Стереть голос человека через год — потеря; перестать
 * подставлять его молча — вежливость.
 */

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_800_000_000_000;
const daysAgo = (days: number): number => NOW - days * DAY;

describe("срок задаётся природой факта, а не модулем (шаг 264)", () => {
  it("у каждой природы своё основание, и числа названы", () => {
    expect(DAYS.temporary).toBe(7);
    // Полгода: дольше любой сезонной смены.
    expect(DAYS.lasting).toBe(180);
    expect(DAYS.once).toBeNull();
  });

  it("временное истекает раньше постоянного — и это проверяется", () => {
    // Если однажды перепутать числа, «временное» станет жить дольше привычки,
    // и весь смысл деления пропадёт. Сроки правили руками уже дважды.
    expect(consistent()).toBe(true);
    expect(DAYS.temporary!).toBeLessThan(DAYS.lasting!);
  });
});

describe("временное забывается само", () => {
  it("свежее временное держится и говорит, сколько осталось", () => {
    const got = decide("temporary", daysAgo(2), NOW);
    expect(got.fate).toBe("forget");
    expect(got.why).toContain("свежо");
    expect(got.why).toContain("забудется через 5");
    expect(say(got)).toBe("забудется через 5 дн.");
  });

  it("просроченное — уже история, а не текущая работа", () => {
    const got = decide("temporary", daysAgo(10), NOW);
    expect(got.days).toBe(10);
    expect(got.why).toContain("это уже история, а не текущая работа");
    expect(say(got)).toBe("забыто");
  });

  it("и подставить его нельзя: история не текущее", () => {
    expect(substitute(decide("temporary", daysAgo(10), NOW)).ok).toBe(false);
  });
});

describe("постоянное не забывается — оно требует подтверждения", () => {
  it("свежее постоянное действует без вопросов", () => {
    const got = decide("lasting", daysAgo(10), NOW);
    expect(got.fate).toBe("confirm");
    expect(say(got)).toBe("действует");
    expect(substitute(got).ask).toBe(false);
  });

  it("полгода без подтверждения — не стёрто, а спросит", () => {
    // Разница принципиальная: стереть голос через год — потеря; перестать
    // подставлять его молча — вежливость.
    const got = decide("lasting", daysAgo(200), NOW);
    expect(got.fate).toBe("confirm");
    expect(got.why).toContain("держим, но молча не подставляем");
    expect(say(got)).toBe("спросим перед подстановкой");
  });

  it("подставить можно, но с вопросом — а не молча", () => {
    const got = substitute(decide("lasting", daysAgo(200), NOW));
    expect(got.ok).toBe(true);
    expect(got.ask).toBe(true);
    expect(got.said).toContain("больше 180");
  });

  it("подтверждение делом сбрасывает срок", () => {
    // `lastAt` — когда человек последний раз **выбрал**, а не когда записали:
    // запись могла быть год назад, а выбор — вчера.
    const old = daysAgo(200);
    const got = decide("lasting", confirm(old, NOW), NOW);
    expect(got.days).toBe(0);
    expect(say(got)).toBe("действует");
  });
});

describe("одноразовое не запоминается вовсе", () => {
  it("один случай — не факт", () => {
    const got = decide("once", daysAgo(0), NOW);
    expect(got.fate).toBe("never");
    expect(got.why).toContain("может быть ошибка, а не привычка");
    expect(say(got)).toBe("не запоминается");
  });

  it("и подставить его нельзя ни при каком возрасте", () => {
    for (const days of [0, 1, 100, 1000]) {
      expect(substitute(decide("once", daysAgo(days), NOW)).ok).toBe(false);
    }
  });
});

describe("границы названы точно", () => {
  it("7 дней — ещё свежо, 8 — уже история", () => {
    // Граница проверена отдельно: `<=`, а не `<`, иначе ровно семь дней
    // считалось бы историей и свежая работа исчезала бы на день раньше.
    expect(decide("temporary", daysAgo(7), NOW).why).toContain("свежо");
    expect(decide("temporary", daysAgo(8), NOW).why).toContain("история");
  });

  it("180 дней — подтверждено, 181 — спросим", () => {
    expect(say(decide("lasting", daysAgo(180), NOW))).toBe("действует");
    expect(say(decide("lasting", daysAgo(181), NOW))).toBe("спросим перед подстановкой");
  });

  it("возраст не бывает отрицательным", () => {
    // Часы машины могут уйти вперёд; «−3 дня» в интерфейсе — это баг на виду.
    expect(decide("temporary", NOW + 5 * DAY, NOW).days).toBe(0);
  });

  it("все три природы отвечают хоть чем-то, а не пустой строкой", () => {
    const natures: Nature[] = ["temporary", "lasting", "once"];
    for (const nature of natures) {
      const got = decide(nature, daysAgo(1), NOW);
      expect(got.why.trim().length).toBeGreaterThan(10);
      expect(say(got).trim().length).toBeGreaterThan(0);
    }
  });
});
