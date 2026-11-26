import { describe, expect, it } from "vitest";
import { checks, kindOf, line, neverWrite, words, type Fault } from "./reasonWords";

/**
 * Шаг 431: журнал пишет причину отказа словами человека, а не кодом ошибки.
 */

const fault = (over: Partial<Fault> = {}): Fault => ({ code: "EACCES", what: "удалить «старый.zip»", where: "Загрузки", about: "opened", ...over });

describe("причина отвечает: что, где, почему", () => {
  it("файл занят — что делать", () => {
    const got = words(fault());
    expect(got).toContain("не получилось удалить «старый.zip» в «Загрузки»");
    expect(got).toContain("открыт в другой программе — закройте её и повторите");
  });

  it("нет прав", () => {
    expect(words(fault({ about: "denied" }))).toContain("система не пустила");
  });

  it("нет сети, нет места, таймаут, файла нет — своя причина у каждого", () => {
    expect(words(fault({ about: "offline" }))).toContain("нет сети");
    expect(words(fault({ about: "full" }))).toContain("кончилось место");
    expect(words(fault({ about: "timeout" }))).toContain("не ответил вовремя");
    expect(words(fault({ about: "missing" }))).toContain("переименовали");
  });

  it("неизвестная причина — честно, с кодом для поддержки", () => {
    const got = words(fault({ about: undefined }));
    expect(got).toContain("причину определить не удалось");
    expect(got).toContain("для поддержки");
  });
});

describe("код отдельно, в конце", () => {
  it("в скобках последним", () => {
    const got = line(fault());
    expect(got.endsWith("(код EACCES)")).toBe(true);
  });

  it("неизвестная причина уже содержит код — второй раз не дублируем", () => {
    const got = line(fault({ about: undefined }));
    expect(got.match(/EACCES/g)).toHaveLength(1);
  });
});

describe("чего в причине быть не должно", () => {
  it("пять запретов, первый — голый код", () => {
    const got = neverWrite();
    expect(got).toHaveLength(5);
    expect(got[0]).toContain("ничего не говорит");
  });

  it("три требования к строке", () => {
    expect(checks()).toHaveLength(3);
  });
});

describe("ни одного английского слова в переводе", () => {
  it("латиница в причине — только код", () => {
    // Имя файла — русское: иначе «.zip» в имени справедливо даёт латиницу,
    // и проверка ловила бы имя, а не непереведённое слово.
    for (const about of ["opened", "denied", "offline", "full", "timeout", "missing", undefined] as const) {
      const got = words(fault({ about, code: "X", what: "удалить старый архив" }));
      expect(/[A-Za-z]{2,}/.test(got)).toBe(false);
    }
  });
});

describe("разбор строки руки", () => {
  it("коды узнаются по-русски понятными видами отказа", () => {
    expect(kindOf("EACCES: permission denied")).toBe("denied");
    expect(kindOf("os error 112: на диске нет места")).toBe("full");
    expect(kindOf("ETIMEDOUT")).toBe("timeout");
    expect(kindOf("os error 32: файл занят")).toBe("opened");
    expect(kindOf("ENOENT: no such file")).toBe("missing");
  });

  it("пустая строка и незнакомый текст — без вида, а не «другое»", () => {
    expect(kindOf("")).toBeUndefined();
    expect(kindOf("оборвалось на середине")).toBeUndefined();
  });
});
