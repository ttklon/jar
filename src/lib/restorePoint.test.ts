import { describe, expect, it } from "vitest";
import { age, countUsable, firstUsable, label, parse, points, when, STALE_MS } from "./restorePoint";

/**
 * Шаг 155: выбор точки восстановления — временем, а не именем файла.
 *
 * Человек в беде выбирает «когда вернуть», а не «какая строка называется
 * memory-20261120-143000-v1.db».
 */

const T = (iso: string) => Date.parse(iso);
// 20 ноября 2026, 15:00 UTC.
const NOW = T("2026-11-20T15:00:00Z");

describe("имя копии — это время", () => {
  it("имя ядра разбирается в момент UTC", () => {
    const got = parse("memory-20261120-143000-v1.db");
    expect(got.at).toBe(T("2026-11-20T14:30:00Z"));
    expect(got.why).toBe("");
  });

  it("чужая строка не выдаётся за понятную", () => {
    const got = parse("backup.db");
    expect(got.at).toBeNull();
    expect(got.why).toContain("не понять по имени");
  });

  it("невозможная дата не превращается в соседнюю", () => {
    // `Date.UTC` мягко переносит 31 февраля в март — это была бы догадка.
    expect(parse("memory-20260231-100000-v1.db").at).toBeNull();
    expect(parse("memory-20261320-100000-v1.db").at).toBeNull();
  });

  it("копии разбираются списком", () => {
    const got = points(["memory-20261120-143000-v1.db", "мусор"]);
    expect(got[0]?.at).toBe(T("2026-11-20T14:30:00Z"));
    expect(got[1]?.at).toBeNull();
  });
});

describe("когда снята — по-человечески", () => {
  it("сегодня — временем", () => {
    const point = { file: "memory-20261120-143000-v1.db", at: T("2026-11-20T14:30:00Z") };
    expect(when(point, NOW, 0)).toBe("сегодня, 14:30");
  });

  it("вчера называется вчера", () => {
    const point = { file: "memory-20261119-091200-v1.db", at: T("2026-11-19T09:12:00Z") };
    expect(when(point, NOW, 0)).toBe("вчера, 09:12");
  });

  it("давнее — датой, и год только если он другой", () => {
    const old = { file: "memory-20261101-120000-v1.db", at: T("2026-11-01T12:00:00Z") };
    expect(when(old, NOW, 0)).toBe("1 ноября, 12:00");
    const older = { file: "memory-20251101-120000-v1.db", at: T("2025-11-01T12:00:00Z") };
    expect(when(older, NOW, 0)).toBe("1 ноября 2025, 12:00");
  });

  it("UTC переводится в местное: иначе человек ошибётся на часы", () => {
    const point = { file: "memory-20261120-143000-v1.db", at: T("2026-11-20T14:30:00Z") };
    // Рига зимой — UTC+2.
    expect(when(point, NOW, 2 * 60 * 60 * 1000)).toBe("сегодня, 16:30");
  });

  it("непонятное имя не притворяется датой", () => {
    expect(when({ file: "своё.db", at: null }, NOW)).toContain("не понять по имени");
  });
});

describe("возраст словами", () => {
  it("считается по-русски: час, два часа, пять часов", () => {
    expect(age({ file: "f", at: NOW - 60 * 60 * 1000 }, NOW)).toBe("1 час назад");
    expect(age({ file: "f", at: NOW - 2 * 60 * 60 * 1000 }, NOW)).toBe("2 часа назад");
    expect(age({ file: "f", at: NOW - 5 * 60 * 60 * 1000 }, NOW)).toBe("5 часов назад");
  });

  it("дни, месяцы и годы — тоже", () => {
    expect(age({ file: "f", at: NOW - 2 * 24 * 3600e3 }, NOW)).toBe("2 дня назад");
    expect(age({ file: "f", at: NOW - 60 * 24 * 3600e3 }, NOW)).toBe("2 месяца назад");
    expect(age({ file: "f", at: NOW - 800 * 24 * 3600e3 }, NOW)).toBe("2 года назад");
  });

  it("копия из будущего — разошлись часы, а не «свежая»", () => {
    expect(age({ file: "f", at: NOW + 60_000 }, NOW)).toContain("часы машины разошлись");
  });

  it("неизвестное время не выдаёт возраст", () => {
    expect(age({ file: "f", at: null }, NOW)).toBe("возраст неизвестен");
  });
});

describe("старое называется старым", () => {
  it("копия старше недели помечена", () => {
    const point = { file: "memory-20261101-120000-v1.db", at: NOW - STALE_MS - 1 };
    expect(label(point, NOW)).toContain("старое: вернёт память на момент копии");
  });

  it("свежая — без предупреждения", () => {
    const point = { file: "memory-20261120-143000-v1.db", at: T("2026-11-20T14:30:00Z") };
    const got = label(point, NOW);
    expect(got).toContain("сегодня, 14:30");
    expect(got).not.toContain("старое");
  });

  it("непонятная копия всё равно видна, но честно", () => {
    expect(label({ file: "своё.db", at: null }, NOW)).toBe(
      "когда снята — не понять по имени · возраст неизвестен",
    );
  });
});

describe("что предложить первым", () => {
  const ok = () => true;

  it("самая свежая по времени, а не по порядку в папке", () => {
    const list = points([
      "memory-20261101-120000-v1.db",
      "memory-20261119-120000-v1.db",
      "memory-20261110-120000-v1.db",
    ]);
    expect(firstUsable(list, ok)?.file).toBe("memory-20261119-120000-v1.db");
  });

  it("битая не предлагается, даже если свежая", () => {
    const list = points(["memory-20261119-120000-v1.db", "memory-20261110-120000-v1.db"]);
    const usable = (file: string) => file.includes("1110");
    expect(firstUsable(list, usable)?.file).toBe("memory-20261110-120000-v1.db");
  });

  it("с непонятным временем не выдаётся за свежую", () => {
    const list = [{ file: "своё.db", at: null }, ...points(["memory-20261110-120000-v1.db"])];
    expect(firstUsable(list, ok)?.file).toBe("memory-20261110-120000-v1.db");
  });
});

describe("сколько копий годится", () => {
  it("число, а не «есть копии»", () => {
    const list = points(["memory-20261119-120000-v1.db", "memory-20261110-120000-v1.db"]);
    expect(countUsable(list, (file) => file.includes("1119"))).toBe("копий: 2, годны 1");
  });

  it("пусто — говорю прямо", () => {
    expect(countUsable([], () => true)).toBe("копий нет");
  });
});
