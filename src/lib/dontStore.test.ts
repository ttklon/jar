import { describe, expect, it } from "vitest";
import {
  LIFE_MS,
  active,
  allowed,
  hear,
  lift,
  live,
  summary,
  wantsMemory,
  wantsNoMemory,
  type Exception,
} from "./dontStore";

/**
 * Шаг 267: отдельно — «не запоминай это»; одна фраза становится исключением.
 *
 * Почему отдельно от удаления (шаг 263): удаление убирает **уже** записанное —
 * это разбор прошлого. Просьба «не запоминай это» смотрит вперёд: человек
 * говорит её, когда память вот-вот запишет, и ждёт, что запись не случится.
 *
 * Перепутать их значит либо записать и стереть (человек увидит факт, который
 * просил не хранить), либо не записать вовсе — но тогда «не запоминай **это**»
 * станет «не запоминай ничего».
 */

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_800_000_000_000;
const folder = { kind: "folder", value: "D:\\Личное" };

const exception = (over: Partial<Exception> = {}): Exception => ({
  kind: "folder",
  value: "D:\\Личное",
  at: NOW,
  said: "не запоминай эту папку",
  ...over,
});

describe("просьба узнаётся по отрицанию перед глаголом (шаг 267)", () => {
  it("«не запоминай это» — просьба не запоминать", () => {
    expect(wantsNoMemory("не запоминай это")).toBe(true);
    expect(wantsNoMemory("Не запоминай эту папку")).toBe(true);
    expect(wantsNoMemory("не сохраняй это")).toBe(true);
  });

  it("«запоминай это всегда» — обратная просьба, а не та же", () => {
    // Одна и та же подстрока в обеих фразах, и различие — только в отрицании.
    expect(wantsMemory("запоминай это всегда")).toBe(true);
    expect(wantsNoMemory("запоминай это всегда")).toBe(false);
  });

  it("слово «запоминай» само по себе — не просьба не запоминать", () => {
    // Иначе «запомни, что я люблю кофе» перестало бы записываться.
    expect(wantsNoMemory("запомни, что я люблю кофе")).toBe(false);
    expect(wantsMemory("запомни, что я люблю кофе")).toBe(true);
  });
});

describe("исключение предметно, а не «на всю память»", () => {
  it("относится к обсуждаемому факту, а не ко всему", () => {
    // «Не запоминай, что я открывал D:\Личное» — про одну папку.
    const got = hear("не запоминай это", folder, NOW);
    expect(got.exception).not.toBeNull();
    expect(got.exception!.kind).toBe("folder");
    expect(got.exception!.value).toBe("D:\\Личное");
  });

  it("человек слышит, что именно не запомнится", () => {
    // Отсутствие факта неотличимо от сбоя: «хорошо» должно быть сказано.
    const got = hear("не запоминай это", folder, NOW);
    expect(got.ask).toContain("не запомню папку D:\\Личное");
    expect(got.ask).toContain("в память не попадёт");
  });

  it("«это» без предмета — приложение спрашивает, а не решает за человека", () => {
    const got = hear("не запоминай это", null, NOW);
    expect(got.exception).toBeNull();
    expect(got.ask).toContain("что именно");
  });

  it("фраза без просьбы не создаёт исключение", () => {
    const got = hear("открой папку", folder, NOW);
    expect(got.exception).toBeNull();
    expect(got.ask).toBe("");
  });
});

describe("исключение проверяется на записи", () => {
  it("факт не записывается, и причина названа", () => {
    // Иначе исключение работает только там, где о нём вспомнили, — то есть нигде.
    const got = allowed(folder, [exception()]);
    expect(got.ok).toBe(false);
    expect(got.because).toContain("вы просили не запоминать");
    expect(got.because).toContain("D:\\Личное");
  });

  it("другие факты того же вида пишутся", () => {
    // Это главное: «не запоминай это» не значит «не запоминай ничего».
    const got = allowed({ kind: "folder", value: "D:\\Отчёты" }, [exception()]);
    expect(got.ok).toBe(true);
    expect(got.because).toBe("");
  });

  it("исключение на весь вид работает словом «папки»", () => {
    const got = allowed({ kind: "folder", value: "D:\\Любое" }, [exception({ value: "" })]);
    expect(got.ok).toBe(false);
    expect(got.because).toContain("все folder");
  });

  it("без исключений пишется всё", () => {
    expect(allowed(folder, []).ok).toBe(true);
  });
});

describe("исключение можно снять", () => {
  it("снимается ровно это исключение", () => {
    const list = [exception(), exception({ kind: "program", value: "Code" })];
    const left = lift(list, "folder", "D:\\Личное");
    expect(left.length).toBe(1);
    expect(left[0]!.kind).toBe("program");
  });

  it("исходный список не меняется", () => {
    const list = [exception()];
    lift(list, "folder", "D:\\Личное");
    expect(list.length).toBe(1);
  });

  it("после снятия факт снова записывается", () => {
    const left = lift([exception()], "folder", "D:\\Личное");
    expect(allowed(folder, left).ok).toBe(true);
  });
});

describe("исключение не вечное, но и не снимается молча", () => {
  it("срок назван заранее — 90 дней", () => {
    expect(LIFE_MS).toBe(90 * DAY);
    expect(active(exception({ at: NOW - 89 * DAY }), NOW)).toBe(true);
    expect(active(exception({ at: NOW - 91 * DAY }), NOW)).toBe(false);
  });

  it("истёкшее не применяется на записи", () => {
    // Человек говорил про случай, а не про все будущие.
    const old = exception({ at: NOW - 91 * DAY });
    expect(live([old], NOW).length).toBe(0);
    expect(allowed(folder, live([old], NOW)).ok).toBe(true);
  });
});

describe("сводка экрана памяти", () => {
  it("исключения видны рядом с фактами", () => {
    // Человек, который забыл, что просил не запоминать, будет искать сбой.
    expect(summary([exception()])).toContain("не запоминать папку D:\\Личное");
  });

  it("пусто — сказано, а не пустая строка", () => {
    expect(summary([])).toContain("исключений нет");
  });

  it("склонение: 1 исключение, 2 исключения", () => {
    expect(summary([exception()])).toContain("1 исключение");
    expect(summary([exception(), exception({ kind: "program", value: "Code" })])).toContain("2 исключения");
  });
});
