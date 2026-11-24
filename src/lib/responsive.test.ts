import { describe, expect, it } from "vitest";
import { available, busy, can, settled, stuck, STUCK_MS, why, word } from "./responsive";

/**
 * Шаг 126: не блокировать интерфейс ни на одном шаге.
 *
 * Пока шло дело, экран серел целиком — и кнопка «стоп» тоже, именно тогда, когда она
 * нужна.
 */
describe("блокируется действие, а не экран", () => {
  it("во время разбора журнал и план доступны", () => {
    expect(can("thinking", "journal")).toBe(true);
    expect(can("thinking", "plan")).toBe(true);
  });

  it("второй разбор во время разбора недоступен — вот и всё, что блокируется", () => {
    expect(can("thinking", "submit")).toBe(false);
    expect(why("thinking", "submit")).toBe("сначала дождитесь: думаю");
  });

  it("во время работы что-то доступно всегда", () => {
    // Если список пуст — экран заблокирован целиком, и это дефект.
    for (const job of ["thinking", "running", "transcribing", "speaking"] as const) {
      expect(available(job).length).toBeGreaterThan(0);
    }
  });
});

describe("стоп доступен именно тогда, когда нужен", () => {
  it("посреди работы стоп живой", () => {
    expect(can("running", "stop")).toBe(true);
    expect(can("thinking", "stop")).toBe(true);
  });

  it("когда останавливать нечего — стоп не нужен", () => {
    expect(can("none", "stop")).toBe(false);
  });
});

describe("занятость названа, а не просто серое", () => {
  it("каждое состояние — своё слово", () => {
    expect(word("thinking")).toBe("думаю");
    expect(word("transcribing")).toBe("распознаю");
    expect(word("none")).toBe("свободно");
  });

  it("недоступное объясняет почему", () => {
    expect(why("running", "run")).toContain("остановите или дождитесь");
  });
});

describe("занятость снимается при любом исходе", () => {
  it("успех, ошибка и отмена снимают одинаково", () => {
    // Забытое снятие — блокировка до перезагрузки.
    for (const outcome of ["ok", "failed", "cancelled"] as const) {
      expect(settled("running", outcome)).toBe("none");
    }
  });

  it("свободное остаётся свободным", () => {
    expect(settled("none", "ok")).toBe("none");
  });
});

describe("зависание видно, а не выглядит «ещё думает»", () => {
  it("дольше 30 секунд — зависание, и можно остановить", () => {
    const got = stuck("thinking", 0, STUCK_MS + 1);
    expect(got.stuck).toBe(true);
    expect(got.said).toContain("зависание");
    expect(got.said).toContain("можно остановить");
  });

  it("в пределах — не зависание", () => {
    expect(stuck("thinking", 0, STUCK_MS - 1).stuck).toBe(false);
  });

  it("когда ничего не идёт — зависания нет", () => {
    expect(busy("none")).toBe(false);
    expect(stuck("none", 0, 1e9).stuck).toBe(false);
  });
});
