import { describe, expect, it } from "vitest";
import { ASK_EVERY_MS, OLD_MS, apply, next, nothing, waiting } from "./aging";
import type { Sourced } from "./factOrigin";

/**
 * Шаг 279: старые факты стареют — раз в месяц спросить, актуально ли.
 *
 * Срок уже есть у временного (264) и у замеченного (273), но оба решают **за**
 * человека. А факт, который значит, ведёт себя иначе: папка может быть нужна
 * годами, и удалить её за давность — потеря; замолчать — потеря тихая.
 */

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_800_000_000_000;

const fact = (over: Partial<Sourced> = {}): Sourced => ({
  kind: "folder",
  value: "D:\\Отчёты",
  origin: "said",
  at: NOW - 40 * DAY,
  from: "",
  ...over,
});

describe("старый — это месяц", () => {
  it("срок назван и совпадает с остальными", () => {
    expect(OLD_MS).toBe(30 * DAY);
    expect(ASK_EVERY_MS).toBe(30 * DAY);
  });

  it("свежий факт не спрашивается", () => {
    expect(next([fact({ at: NOW - 10 * DAY })], {}, NOW)).toBeNull();
  });

  it("старый — спрашивается", () => {
    expect(next([fact()], {}, NOW)).not.toBeNull();
  });
});

describe("спрашивают один факт, самый старый", () => {
  it("самый старый идёт первым", () => {
    // Если спрашивать самый свежий, до старых очередь не дойдёт никогда.
    const got = next(
      [fact({ value: "D:\\Новое", at: NOW - 31 * DAY }), fact({ value: "D:\\Старое", at: NOW - 300 * DAY })],
      {},
      NOW,
    );
    expect(got!.fact.value).toBe("D:\\Старое");
  });

  it("неотвеченный вопрос не повторяется каждый день", () => {
    // Иначе один вопрос закрывает остальные.
    const old = fact();
    const asked = { "folder:D:\\Отчёты": NOW - DAY };
    expect(next([old], asked, NOW)).toBeNull();
  });

  it("через месяц вопрос возвращается", () => {
    const asked = { "folder:D:\\Отчёты": NOW - 31 * DAY };
    expect(next([fact()], asked, NOW)).not.toBeNull();
  });
});

describe("вопрос называет последствия", () => {
  it("сказано, что будет при «да» и при «нет»", () => {
    // «Ещё актуально?» без последствий — просьба потратить внимание ни на что.
    const got = next([fact()], {}, NOW)!;
    expect(got.yes).toContain("обновим дату");
    expect(got.no).toContain("вернуть можно");
    expect(got.no).toContain("уйдёт в историю");
  });
});

describe("ответы ведут себя по-разному", () => {
  it("«да» обновляет дату — вопрос откладывается на месяц", () => {
    const got = apply(fact(), "yes", NOW);
    expect(got.fact.at).toBe(NOW);
    expect(got.said).toContain("через месяц");
    expect(next([got.fact], {}, NOW)).toBeNull();
  });

  it("«нет» не стирает факт: он в истории и его можно вернуть", () => {
    // Человек может ошибиться, и «вернуть нельзя» (263) здесь неуместно.
    const got = apply(fact(), "no", NOW);
    expect(got.fact.value).toBe("D:\\Отчёты");
    expect(got.fact.origin).toBe("imported");
    expect(got.said).toContain("вернуть можно");
  });

  it("«позже» не значит «нет»: факт не опровергнут", () => {
    const got = apply(fact(), "later", NOW);
    expect(got.fact).toEqual(fact());
    expect(got.said).toContain("спрошу позже");
  });

  it("«позже» откладывает вопрос, но не навсегда", () => {
    const got = apply(fact(), "later", NOW);
    expect(next([got.fact], { "folder:D:\\Отчёты": got.at! }, NOW + DAY)).toBeNull();
    expect(next([got.fact], { "folder:D:\\Отчёты": got.at! }, NOW + 31 * DAY)).not.toBeNull();
  });

  it("молчание не считается «да»: дата не меняется", () => {
    // Не удаляется за невнимательность — но и не подтверждается.
    expect(next([fact()], {}, NOW)!.fact.at).toBe(fact().at);
  });
});

describe("когда спрашивать нечего — сказано что именно", () => {
  it("«всё свежее» — не «всё актуально»", () => {
    // Второе — утверждение о фактах, которого программа не проверяла.
    const got = nothing([fact({ at: NOW - 5 * DAY })], NOW);
    expect(got).toContain("всё свежее");
    expect(got).not.toContain("актуально");
  });

  it("пустая память отличается от «всё свежее»", () => {
    expect(nothing([], NOW)).toContain("память пуста");
  });

  it("старые есть, но недавно спрашивали — тоже сказано", () => {
    const got = nothing([fact()], NOW);
    expect(got).toContain("спрашивали меньше месяца назад");
  });

  it("сколько ждут вопроса — числом", () => {
    expect(waiting([fact(), fact({ value: "D:\\Фото" }), fact({ at: NOW - DAY })], {}, NOW)).toBe(2);
  });
});
