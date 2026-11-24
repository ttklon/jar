import { describe, expect, it } from "vitest";
import { alreadyDone, FRESH_MS, judge, print, remember, summary } from "./idempotent";

/**
 * Шаг 114: повторный запуск видит, что уже сделано, и не делает дважды.
 *
 * «Переименовать 12 файлов» переименовывало уже переименованные — результат
 * портился, хотя работа была сделана.
 */
const now = 1_000_000;
const params = { path: "D:\\Фото" };

describe("сделанное в прошлый раз не повторяется", () => {
  it("тот же шаг с теми же параметрами пропускается", () => {
    const past = [remember("files|переименовать|массово по правилу", params, true, now - 1000)];
    const got = judge("files|переименовать|массово по правилу", params, past, now);
    expect(got.kind).toBe("skip");
    expect(got.why).toContain("уже сделано");
  });

  it("другие параметры — другой шаг, его делаем", () => {
    // Папка другая — работа другая.
    const past = [remember("files|переименовать|массово по правилу", { path: "D:\\Старое" }, true, now - 1000)];
    expect(judge("files|переименовать|массово по правилу", params, past, now).kind).toBe("run");
  });

  it("порядок ключей не меняет отпечаток", () => {
    expect(print("t", { a: "1", b: "2" })).toBe(print("t", { b: "2", a: "1" }));
  });

  it("провал в прошлый раз — не основание пропускать", () => {
    const past = [remember("files|создать|папку", params, false, now - 1000)];
    expect(judge("files|создать|папку", params, past, now).kind).toBe("run");
  });
});

describe("старая отметка — не основание пропускать", () => {
  it("через час «сделано» перестаёт быть верой", () => {
    // Мир меняется: файлы вернули, папку удалили.
    const past = [remember("files|создать|папку", params, true, now - FRESH_MS - 1)];
    const got = judge("files|создать|папку", params, past, now);
    expect(got.kind).toBe("run");
    expect(got.why).toContain("сделано давно");
  });

  it("в пределах часа — пропуск", () => {
    const past = [remember("files|создать|папку", params, true, now - FRESH_MS + 1)];
    expect(judge("files|создать|папку", params, past, now).kind).toBe("skip");
  });

  it("повторить насильно можно — но причина названа", () => {
    const past = [remember("files|создать|папку", params, true, now - 1000)];
    const got = judge("files|создать|папку", params, past, now, true);
    expect(got.kind).toBe("run");
    expect(got.why).toContain("вы так попросили");
  });
});

describe("«уже есть» — успех там, где цель наличие", () => {
  it("создать папку на существующую — успех, а не провал", () => {
    const got = alreadyDone("files|создать|папку", "папка уже есть");
    expect(got?.ok).toBe(true);
    expect(got?.why).toContain("успех");
  });

  it("переименовать на «уже есть» — не успех", () => {
    // Здесь повтор меняет результат, и притворяться иначе нельзя.
    expect(alreadyDone("files|переименовать|массово по правилу", "файл уже есть")).toBeNull();
  });

  it("«уже есть» без совпадения по тексту не считается успехом", () => {
    expect(alreadyDone("files|создать|папку", "нет доступа")).toBeNull();
  });
});

describe("сводка говорит, повтор или доделка", () => {
  it("часть сделана — остальные выполню", () => {
    const verdicts = [
      { kind: "skip" as const, why: "" },
      { kind: "run" as const, why: "" },
      { kind: "run" as const, why: "" },
    ];
    expect(summary(verdicts)).toBe("сделано раньше: 1 из 3, остальные 2 выполню");
  });

  it("всё сделано — повторять нечего", () => {
    expect(summary([{ kind: "skip", why: "" }, { kind: "skip", why: "" }])).toContain("повторять нечего");
  });

  it("ничего не сделано — выполню всё", () => {
    expect(summary([{ kind: "run", why: "" }])).toBe("сделано раньше: 0 из 1, выполню всё");
  });
});
