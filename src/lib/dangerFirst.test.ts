import { describe, expect, it } from "vitest";
import { dangerous, first, order, tally, weight, type Orderable } from "./dangerFirst";

/**
 * Шаг 176: опасное — выше обычного.
 *
 * Журнал — хронология; вопрос к нему — «не случилось ли чего». Плоская лента
 * отвечает на первый вопрос и молчит на второй.
 */

const at = (n: number, risk: string, subject = "s", kind = "started", outcome = "ok"): Orderable => ({
  subject,
  risk,
  kind,
  outcome,
  at_ms: n,
});

describe("вес опасности — тот же порядок, что в реестре", () => {
  it("деньги и подпись опаснее удаления, удаление опаснее внешнего", () => {
    expect(weight("money")).toBeGreaterThan(weight("identity"));
    expect(weight("identity")).toBeGreaterThan(weight("destructive"));
    expect(weight("destructive")).toBeGreaterThan(weight("external"));
    expect(weight("external")).toBeGreaterThan(weight("read"));
  });

  it("опасное — от внешнего и выше, чтение и запись внутри — обычное", () => {
    expect(dangerous("external")).toBe(true);
    expect(dangerous("destructive")).toBe(true);
    expect(dangerous("read")).toBe(false);
    expect(dangerous("write-local")).toBe(false);
  });
});

describe("опасное поднимается выше", () => {
  it("старое удаление выше свежего чтения", () => {
    const got = order([at(100, "read"), at(1, "destructive")]);
    expect(got[0]!.risk).toBe("destructive");
  });

  it("внутри группы — свежее выше старого", () => {
    const got = order([at(1, "read"), at(9, "read"), at(5, "read")]);
    expect(got.map((event) => event.at_ms)).toEqual([9, 5, 1]);
  });

  it("отказ политики ниже запуска того же риска, но не исчезает", () => {
    const got = order([at(9, "destructive", "s", "denied", "denied: политика"), at(1, "destructive")]);
    expect(got).toHaveLength(2);
    expect(got[0]!.kind).toBe("started");
    expect(got[1]!.kind).toBe("denied");
  });

  it("чужие поля не теряются: сортировка отдаёт исходные объекты", () => {
    const rich = { ...at(1, "read"), decision: "allow", duration_ms: 12 };
    const got = order([rich]);
    expect(got[0]).toBe(rich);
    expect(got[0]!.decision).toBe("allow");
  });

  it("порядок устойчив: повторная сортировка даёт тот же список", () => {
    const events = [at(5, "read", "a"), at(5, "read", "b"), at(5, "destructive", "c")];
    const once = order(events).map((event) => event.subject);
    const twice = order(order(events)).map((event) => event.subject);
    expect(twice).toEqual(once);
    expect(once).toEqual(["c", "a", "b"]);
  });
});

describe("счётчик говорит, сколько смотреть", () => {
  it("опасных три из сорока одного", () => {
    const events = [at(1, "money"), at(2, "destructive"), at(3, "external"), ...Array.from({ length: 38 }, (_, i) => at(10 + i, "read"))];
    expect(tally(events).said).toBe("опасных 3 из 41 — они сверху, остальное ниже по времени");
    expect(tally(events).see).toBe(true);
  });

  it("ноль опасного — можно не листать, и это сказано", () => {
    const got = tally([at(1, "read"), at(2, "write-local")]);
    expect(got.see).toBe(false);
    expect(got.said).toContain("опасного нет");
    expect(got.said).toContain("читать подряд незачем");
  });

  it("пустой журнал — законный ответ, а не пустая строка", () => {
    expect(tally([]).said).toBe("журнал пуст — и опасного в нём нет");
  });
});

describe("первая строка отвечает на вопрос «что случилось»", () => {
  it("сверху опасное — названо с риском и итогом", () => {
    const got = first([at(100, "read"), at(1, "money", "оплатить счёт", "started", "ok")]);
    expect(got).toBe("сверху опасное: «оплатить счёт» (money) — ok");
  });

  it("опасного не было — так и говорим, а не выдаём чтение за событие", () => {
    expect(first([at(1, "read", "прочитать файл")])).toBe("опасного не было: последнее — обычное «прочитать файл»");
  });

  it("пустой журнал", () => {
    expect(first([])).toBe("журнал пуст");
  });
});
