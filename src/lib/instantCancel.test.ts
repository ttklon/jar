import { describe, expect, it } from "vitest";
import { accept, cancel, FRAME_MS, instant, order, report, said, settled } from "./instantCancel";

/**
 * Шаг 138: отмена возвращает управление мгновенно, даже если ядро ещё считает.
 *
 * «Стоп» ждал ответа ядра — то есть не работал именно тогда, когда нужен.
 */
describe("сначала отпускаем, потом просим", () => {
  it("порядок — часть условия, а не деталь", () => {
    const got = order();
    expect(got.first).toBe("release");
    expect(got.second).toBe("ask-kernel");
    expect(got.said).toContain("ядро может считать ещё сколько угодно");
  });

  it("мгновенно — это в кадре", () => {
    expect(instant(FRAME_MS).ok).toBe(true);
    expect(instant(900).said).toContain("отмена ждала: это уже не мгновенно");
  });
});

describe("поздний ответ не оживает", () => {
  it("ответ с чужим номером выбрасывается", () => {
    const got = cancel(7, "переименовать фото");
    // Ядро ответило старым запросом уже после отмены.
    const late = accept(got.token, 7);
    expect(late.accept).toBe(false);
    expect(late.said).toContain("поздний ответ");
  });

  it("ответ с текущим номером принимается", () => {
    expect(accept(8, 8).accept).toBe(true);
  });

  it("номер растёт при каждой отмене", () => {
    expect(cancel(1, "а").token).toBe(2);
  });
});

describe("сказано так, чтобы не ждать", () => {
  it("«остановлено — управление у вас», а не «останавливаю…»", () => {
    const got = said({ what: "переименовать фото", token: 3 });
    expect(got).toContain("управление у вас");
    expect(got).toContain("ответ будет выброшен");
  });

  it("брошенное и неначатое — разные факты", () => {
    expect(report({ what: "сжать", token: 1 }, true)).toContain("не откатывается");
    expect(report({ what: "сжать", token: 1 }, false)).toContain("не начиналось");
  });
});

describe("«идёт» после отмены — ложь, и проверка её ловит", () => {
  it("забытое снятие видно", () => {
    const got = settled(true, { what: "переименовать фото", token: 4 });
    expect(got.ok).toBe(false);
    expect(got.said).toContain("интерфейс всё ещё заложник");
  });

  it("снятое состояние — в порядке", () => {
    expect(settled(false, { what: "переименовать фото", token: 4 }).ok).toBe(true);
  });
});
