import { describe, expect, it } from "vitest";
import { needsDryFirst, report, result, type Step } from "./dryRun";

/**
 * Шаг 180: сухой прогон — «что бы это сделало» без исполнения.
 *
 * Предпросмотр плана отвечал «что будет делаться», а не «что станет». Согласие
 * дают на результат, а не на глагол.
 */

const step = (over: Partial<Step> = {}): Step => ({
  what: "переместить",
  count: 12,
  bytes: 1024 * 1024,
  undoable: true,
  ...over,
});

describe("что станет, а не что будет делаться", () => {
  it("два места — назван результат с обеих сторон", () => {
    const got = result(step({ from: "C:\\Фото", to: "D:\\Архив" }));
    expect(got.said).toBe("переместить: 12 объектов из C:\\Фото перейдёт в D:\\Архив (1 МБ)");
  });

  it("только «куда» — появится", () => {
    expect(result(step({ to: "D:\\Архив" })).said).toContain("появится в D:\\Архив");
  });

  it("только «откуда» — уйдёт, и видно куда", () => {
    expect(result(step({ from: "C:\\Фото", undoable: false })).said).toContain("исчезнет без возврата");
    expect(result(step({ from: "C:\\Фото", undoable: true })).said).toContain("уйдёт в корзину");
  });

  it("«куда» названо явно — оно попадает в результат", () => {
    expect(result(step({ from: "C:\\a", to: "C:\\b", lands: "корзину" })).said).toContain("окажется в корзину");
  });
});

describe("«не знаю» — не «0»", () => {
  it("неизвестное число названо словами, а не нулём", () => {
    expect(result(step({ count: null, bytes: null })).said).toContain("неизвестно сколько объектов");
    expect(result(step({ count: null, bytes: null })).said).toContain("объём неизвестен");
  });

  it("ноль — законный ответ и называется нулём", () => {
    expect(result(step({ count: 0 })).said).toContain("ничего");
  });

  it("сумма с неизвестным слагаемым остаётся неизвестной", () => {
    const got = report([step({ count: 12 }), step({ count: null })]);
    expect(got.count).toBeNull();
    expect(got.unknown).toBe(true);
    expect(got.said).toContain("не «0»: неизвестное не считалось");
  });

  it("и наоборот: всё известно — сумма считается", () => {
    const got = report([step({ count: 12, bytes: 1024 }), step({ count: 8, bytes: 1024 })]);
    expect(got.count).toBe(20);
    expect(got.bytes).toBe(2048);
    expect(got.unknown).toBe(false);
  });
});

describe("итог читается без плана", () => {
  it("числа, объём и необратимость — одной строкой", () => {
    const got = report([step({ count: 5, bytes: 1024 * 1024 * 1024, undoable: false }), step({ count: 7, bytes: 0 })]);
    expect(got.said).toBe(
      "сухой прогон, ничего не выполнено: затронется 12 объектов · 1.00 ГБ · необратимых шагов 1 из 2",
    );
  });

  it("пустой план — «делать нечего», а не пустая строка", () => {
    expect(report([]).said).toBe("сухой прогон: делать нечего — в плане нет шагов");
  });

  it("ничего не затронется — сказано словами", () => {
    expect(report([step({ count: 0, bytes: 0 })]).said).toContain("не затронется ничего");
  });
});

describe("для опасного — сначала сухо", () => {
  it("необратимое требует сухого прогона", () => {
    const got = needsDryFirst(report([step({ undoable: false })]));
    expect(got.first).toBe(true);
    expect(got.why).toContain("отменить будет нечем");
  });

  it("неизвестный объём требует сухого прогона", () => {
    const got = needsDryFirst(report([step({ bytes: null })]));
    expect(got.first).toBe(true);
    expect(got.why).toContain("согласие на неизвестное это не согласие");
  });

  it("безопасное чтение — без лишнего шага", () => {
    const got = needsDryFirst(report([step({ what: "прочитать", count: 3, bytes: 10 })]));
    expect(got.first).toBe(false);
  });
});
