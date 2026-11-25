import { describe, expect, it } from "vitest";
import {
  SHOWN_LIFE,
  confirm,
  counts,
  fresh,
  imported,
  label,
  merge,
  note,
  silently,
  trust,
  type Sourced,
} from "./factOrigin";

/**
 * Шаг 273: показывать, откуда взят факт — сказал человек или вывело приложение.
 *
 * `freshWins` (265) различал «сказано сейчас» и «из памяти», но только в момент
 * заполнения поля: потом человек уже не знал, он ли это сказал. `preferences`
 * хранит `why` («открывали 4 раза»), но это объяснение, а не происхождение.
 */

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_800_000_000_000;

const said = (over: Partial<Sourced> = {}): Sourced => ({
  kind: "folder",
  value: "D:\\Отчёты",
  origin: "said",
  at: NOW - 10 * DAY,
  from: "",
  ...over,
});

const shown = (over: Partial<Sourced> = {}): Sourced => ({
  kind: "folder",
  value: "D:\\Отчёты",
  origin: "shown",
  at: NOW - 2 * DAY,
  from: "открывали 4 раза",
  ...over,
});

describe("происхождение видно словами, а не ярлыком", () => {
  it("сказанное — «вы сказали», замеченное — «приложение заметило»", () => {
    // Человеку нужно понять, спорить ли с этим, а не прочитать `source: said`.
    expect(label("said")).toBe("вы сказали");
    expect(label("shown")).toBe("приложение заметило");
    expect(label("imported")).toContain("перенесено");
  });

  it("у каждого происхождения свой совет, что с ним делать", () => {
    expect(trust("said")).toContain("это вы");
    expect(trust("shown")).toContain("проверьте");
    expect(trust("imported")).toContain("не подтверждено");
  });

  it("объяснение замеченного рядом с происхождением", () => {
    expect(note(shown(), NOW)).toContain("приложение заметило: открывали 4 раза");
  });
});

describe("догадку нельзя показывать как слово человека", () => {
  it("молча подставляется только сказанное", () => {
    // Молча подставленная догадка неотличима от факта.
    expect(silently(said(), NOW)).toEqual({ ok: true, note: "" });
  });

  it("замеченное подставляется с пометкой", () => {
    const got = silently(shown(), NOW);
    expect(got.ok).toBe(true);
    expect(got.note).toBe("приложение заметило");
  });

  it("старое замеченное не подставляется молча", () => {
    const got = silently(shown({ at: NOW - 40 * DAY }), NOW);
    expect(got.ok).toBe(false);
    expect(got.note).toContain("уже не так");
  });

  it("замеченное год назад не «факт», а повод спросить", () => {
    expect(fresh(shown({ at: NOW - 400 * DAY }), NOW).ok).toBe(false);
  });
});

describe("срок есть у догадки, но не у слова", () => {
  it("сказанное год назад остаётся сказанным", () => {
    // «Моя папка — D:\Отчёты» через год всё ещё его слова.
    expect(fresh(said({ at: NOW - 400 * DAY }), NOW).ok).toBe(true);
  });

  it("срок замеченного назван — тридцать дней", () => {
    expect(SHOWN_LIFE).toBe(30 * DAY);
    expect(fresh(shown({ at: NOW - 30 * DAY }), NOW).ok).toBe(true);
    expect(fresh(shown({ at: NOW - 31 * DAY }), NOW).ok).toBe(false);
  });

  it("в отказе сказано, что делать", () => {
    expect(fresh(shown({ at: NOW - 40 * DAY }), NOW).said).toContain("спросите");
  });
});

describe("перенесённое — не подтверждено здесь", () => {
  it("импорт помечается, а не выдаётся за своё", () => {
    const got = imported({ kind: "folder", value: "D:\\Фото", at: NOW, from: "файл памяти" });
    expect(got.origin).toBe("imported");
    expect(note(got, NOW)).toContain("не подтверждено здесь");
  });

  it("подтверждение делает перенесённое своим словом", () => {
    // Подтверждённое перестаёт стареть и перестаёт спрашиваться.
    const after = confirm(imported({ kind: "folder", value: "D:\\Фото", at: NOW - DAY, from: "" }), NOW);
    expect(after.origin).toBe("said");
    expect(after.at).toBe(NOW);
    expect(silently(after, NOW + 400 * DAY)).toEqual({ ok: true, note: "" });
  });

  it("подтверждение сказанного ничего не меняет", () => {
    const before = said();
    expect(confirm(before, NOW)).toBe(before);
  });
});

describe("сколько чего — видно всегда", () => {
  it("сводка называет три числа", () => {
    const got = counts([said(), shown({ value: "D:\\Фото" }), imported({ kind: "voice", value: "Алла", at: NOW, from: "" })]);
    expect(got).toBe("вы сказали: 1, приложение заметило: 1, перенесено: 1");
  });

  it("пустая память — сказано, а не нули", () => {
    expect(counts([])).toBe("память пуста");
  });
});

describe("одно и то же разного происхождения — один факт", () => {
  it("сказанное сильнее замеченного", () => {
    // Показывать одно и то же дважды с разными подписями — заставлять человека
    // выбирать, чему верить, там, где вопроса нет.
    const got = merge([shown(), said()]);
    expect(got.length).toBe(1);
    expect(got[0]!.origin).toBe("said");
  });

  it("замеченное сильнее перенесённого", () => {
    const got = merge([imported({ kind: "folder", value: "D:\\Фото", at: NOW, from: "" }), shown({ value: "D:\\Фото" })]);
    expect(got[0]!.origin).toBe("shown");
  });

  it("разные значения не сливаются", () => {
    expect(merge([said(), said({ value: "D:\\Фото" })]).length).toBe(2);
  });
});
