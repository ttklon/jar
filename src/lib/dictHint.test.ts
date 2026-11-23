import { describe, expect, it } from "vitest";
import { fits, hint, MAX_TERMS, sayHint } from "./dictHint";
import { KNOWN } from "./context";

/**
 * Шаг 56: распознавание с подсказкой по словарю реестра.
 *
 * «Эксель» превращается в «и к сердцу», «блокнот» — в «блок нот». Человек
 * произносит единственное важное слово фразы, и именно его слышат неправильно.
 */
const known = (): Record<string, string[]> => ({
  "chrome.exe": ["браузер", "хром", "chrome", "вкладк"],
  "notepad.exe": ["блокнот", "текст", "заметк", "файл"],
  "code.exe": ["редактор", "код", "vs code", "файл"],
});

describe("термины важнее остальных слов", () => {
  it("имена и латиница идут в подсказку первыми", () => {
    // Их путают чаще всего: «виси код» вместо «vs code».
    const { terms } = hint(known(), "code.exe");
    expect(terms[0]).toBe("code");
    expect(terms).toContain("vs code");
  });

  it("программа перед человеком задаёт фокус", () => {
    // Иначе подсказка тянет к себе чужие программы.
    expect(hint(known(), "code.exe").focus).toBe("window");
    expect(hint(known(), "unknown.exe").focus).toBe("all");
    expect(hint(known(), null).focus).toBe("all");
  });

  it("подсказка не засоряется частыми словами", () => {
    // «файл» и «текст» знает любой распознаватель; лишний вес в подсказке они
    // забирают, а точности не добавляют.
    const { terms } = hint(known(), "notepad.exe");
    expect(terms).not.toContain("файл");
    expect(terms).not.toContain("текст");
  });

  it("подсказка ограничена — длинный список портит обычную речь", () => {
    const { terms } = hint(known(), null);
    expect(terms.length).toBeLessThanOrEqual(MAX_TERMS);
    expect(fits({ terms, focus: "all" })).toBe(true);
  });

  it("без программы подсказка берёт все знакомые имена", () => {
    const { terms, focus } = hint(known(), null);
    expect(focus).toBe("all");
    expect(terms).toContain("chrome");
    expect(terms).toContain("notepad");
  });
});

describe("свои термины — первыми", () => {
  it("человек добавил слово — оно впереди словаря", () => {
    // Он добавил его именно потому, что словарь его не покрывает.
    const { terms } = hint(known(), "code.exe", ["Отчёт Квартал-3"]);
    expect(terms[0]).toBe("Отчёт Квартал-3");
  });

  it("дубли не повторяются — регистр не важен", () => {
    const { terms } = hint(known(), null, ["chrome", "CHROME"]);
    expect(terms.filter((term) => term.toLowerCase() === "chrome").length).toBe(1);
  });
});

describe("сказано, чем помогли", () => {
  it("подсказка названа человеку, а не сработала втайне", () => {
    // Иначе одна и та же фраза распознаётся по-разному, и это выглядит как
    // нестабильность.
    const said = sayHint(hint(known(), "code.exe"));
    expect(said).toContain("распознаю точнее");
    expect(said).toContain("code");
  });

  it("без подсказки — не выдумываем сообщение", () => {
    expect(sayHint(hint({}, null))).toBeNull();
  });
});

describe("живой словарь реестра", () => {
  it("знакомые программы дают непустую подсказку", () => {
    // Проверяется не выдуманный словарь, а настоящий: если он опустеет,
    // подсказка тихо перестанет работать.
    const real = hint(KNOWN, "code.exe");
    expect(real.terms.length).toBeGreaterThan(0);
    expect(real.terms).toContain("code");
  });

  it("подсказка по всем программам укладывается в предел", () => {
    expect(fits(hint(KNOWN, null))).toBe(true);
  });
});
