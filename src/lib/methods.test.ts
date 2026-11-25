import { describe, expect, it } from "vitest";
import {
  AGES_MS,
  age,
  forget,
  from,
  list,
  old,
  say,
  summary,
  usual,
} from "./methods";
import type { Done } from "./likeYesterday";

/**
 * Шаг 262: память о способах — «как вчера» находит вчерашнюю цепочку.
 *
 * `likeYesterday.ts` (шаг 85) умеет **найти** вчерашнюю цепочку по просьбе. Но
 * способ существовал только как ответ на вопрос: его нельзя было ни увидеть
 * списком, ни удалить, ни понять, почему он предлагается. Память, которая
 * работает только по запросу, — это не память, а поиск: человек не знает, что
 * там лежит и как это убрать.
 *
 * Правило: способ — такой же факт памяти, как папка или голос. У него есть
 * когда, что и почему; его видно в списке; его удаляют одной кнопкой.
 */

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-11-20T12:00:00").getTime();
const day = (daysAgo: number): number => NOW - daysAgo * DAY;

const done = (daysAgo: number, over: Partial<Done> = {}): Done => ({
  dayStart: day(daysAgo),
  steps: ["files|rename|photos", "files|move|photos"],
  params: { from: "D:\\Фото", to: "D:\\Фото\\2026" },
  said: "переименуй фото",
  ...over,
});

describe("способ — факт памяти, а не только ответ на вопрос (шаг 262)", () => {
  it("способы видны списком, новые первыми", () => {
    // Так список читают сверху вниз. Обратный порядок заставлял бы листать в
    // конец, чтобы найти вчерашнее.
    const got = list([done(5), done(1), done(3)]);
    expect(got.length).toBe(3);
    expect(got[0]!.dayStart).toBe(day(1));
    expect(got[2]!.dayStart).toBe(day(5));
  });

  it("в способе сохранено и когда, и что, и чем — без потери", () => {
    const got = from(done(1));
    expect(got.said).toBe("переименуй фото");
    expect(got.steps.length).toBe(2);
    expect(got.params.from).toBe("D:\\Фото");
  });

  it("список не делит шаги с журналом: правка памяти не меняет источник", () => {
    const source = done(1);
    const got = from(source);
    source.steps.push("files|delete|photos");
    expect(got.steps.length).toBe(2);
  });
});

describe("возраст — словами, а не миллисекундами", () => {
  it("сегодня, вчера, дни назад", () => {
    // Число миллисекунд в списке памяти читается как мусор.
    expect(age(from(done(0)), NOW)).toBe("сегодня");
    expect(age(from(done(1)), NOW)).toBe("вчера");
    expect(age(from(done(3)), NOW)).toBe("3 дня назад");
    expect(age(from(done(10)), NOW)).toBe("10 дней назад");
  });
});

describe("старый способ остаётся, но не предлагается (шаг 262)", () => {
  it("порог — семь дней, и он назван", () => {
    // За неделю меняются имена файлов и папки: цепочка чаще заденет не то.
    expect(AGES_MS).toBe(7 * DAY);
    expect(old(from(done(6)), NOW)).toBe(false);
    expect(old(from(done(8)), NOW)).toBe(true);
  });

  it("старый способ не удалён: он находится по просьбе «как в прошлый раз»", () => {
    // Это разные вещи, которые легко перепутать: «не предлагать» ≠ «стереть».
    const got = list([done(30)]);
    expect(got.length).toBe(1);
  });

  it("и предупреждение объясняет, чего боится повтор", () => {
    const text = say(from(done(30)), NOW);
    expect(text).toContain("старый способ");
    expect(text).toContain("имена и папки могли измениться");
  });

  it("свежий способ идёт без предупреждения", () => {
    const text = say(from(done(1)), NOW);
    expect(text).toContain("вчера");
    expect(text).not.toContain("старый способ");
  });

  it("«как обычно» берёт самый свежий не старый", () => {
    const got = usual([done(2), done(30), done(1)], NOW);
    expect(got!.dayStart).toBe(day(1));
  });

  it("все способы старые — честное ничего, а не самый свежий из старых", () => {
    // Предложить месячную цепочку молча значит задеть не те файлы.
    expect(usual([done(30), done(40)], NOW)).toBeNull();
  });
});

describe("удаление одного способа, а не всей памяти", () => {
  it("забывается ровно этот день", () => {
    const dones = [done(1), done(2), done(3)];
    const left = forget(dones, dones[1]!.dayStart);
    expect(left.length).toBe(2);
    expect(left.map((item) => item.dayStart)).toEqual([day(1), day(3)]);
  });

  it("исходный список не меняется", () => {
    const dones = [done(1), done(2)];
    forget(dones, dones[0]!.dayStart);
    expect(dones.length).toBe(2);
  });

  it("после удаления способ не находится", () => {
    const dones = [done(1)];
    expect(list(forget(dones, dones[0]!.dayStart)).length).toBe(0);
  });
});

describe("сводка для экрана памяти", () => {
  it("сколько способов и сколько старых — числом", () => {
    expect(summary([done(1), done(2), done(30)], NOW)).toBe("3 способа в памяти, из них старых 1");
  });

  it("пустая память — сказано, а не «0»", () => {
    expect(summary([], NOW)).toBe("способов в памяти нет");
  });

  it("всё свежее — так и сказано", () => {
    expect(summary([done(1)], NOW)).toBe("1 способ в памяти, все свежие");
  });
});
