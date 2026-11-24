import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { t } from "../i18n/ru";
import { LANGUAGES, baseLanguage, choose, missing, nameOf, translated } from "./locale";

/**
 * Шаг 229: локализация — русский полностью, остальные — честно «нет перевода».
 *
 * Дефект: словарь был **только** русский, а язык системы не читался нигде. На
 * английской машине человек получал русский интерфейс **без единого слова** о
 * том, почему. Он не отличал «перевода нет» от «интерфейс сломан», а второе
 * читается как недоверие к приложению целиком.
 */

describe("язык системы читается, а не угадывается", () => {
  it("`ru-RU` и `RU` — русский: различать регистр значило бы считать свою систему чужой", () => {
    expect(baseLanguage("ru-RU")).toBe("ru");
    expect(baseLanguage("RU")).toBe("ru");
    expect(baseLanguage("ru_by")).toBe("ru");
  });

  it("пустой язык не роняет", () => {
    expect(baseLanguage(null)).toBe("");
    expect(baseLanguage(undefined)).toBe("");
    expect(baseLanguage("")).toBe("");
  });

  it("русская система — без разговоров", () => {
    const decision = choose("ru-RU");
    expect(decision.language).toBe("ru");
    expect(decision.notice).toBeNull();
  });
});

describe("нет перевода — это сказано, а не скрыто", () => {
  it("английская система получает русский и **объяснение**", () => {
    const decision = choose("en-US");
    expect(decision.language).toBe("ru");
    expect(decision.notice).toContain("en-US");
    expect(decision.notice).toContain("Перевода");
  });

  it("и объяснение отличает «нет перевода» от «сломалось»", () => {
    // Именно этого не хватало: человек видел русский и не знал, почему.
    const notice = choose("de-DE").notice ?? "";
    expect(notice).toContain("не ошибка");
    expect(notice).toContain("по-русски переведено всё");
  });

  it("неизвестный язык называется, а не подменяется пустотой", () => {
    // Пустая скобка в строке читается как недоделка.
    expect(choose(null).notice).toContain("неизвестный");
  });

  it("выбор человека сильнее системы: не спрашиваем заново каждый запуск", () => {
    const decision = choose("en-US", "ru");
    expect(decision.language).toBe("ru");
    expect(decision.notice).toBeNull();
  });

  it("переведён только русский, и это видно", () => {
    expect([...LANGUAGES]).toEqual(["ru"]);
    expect(translated("ru-RU")).toBe(true);
    expect(translated("en-US")).toBe(false);
  });

  it("название языка — на своём языке, а не «Russian»", () => {
    expect(nameOf("ru")).toBe("русский");
  });
});

describe("русский переведён полностью", () => {
  it("в словаре нет пустых строк", () => {
    // Полуперевод начинается с пустой строки: её никто не замечает, пока она не
    // окажется в интерфейсе пустым местом. Проверка называет **имена**, а не
    // «есть проблемы»: имя — то, что можно починить.
    expect(missing(t as unknown as Record<string, unknown>)).toEqual([]);
  });

  it("проверка полноты действительно ловит пустое", () => {
    // Иначе «нет пустых строк» — утверждение о самой проверке, а не о словаре.
    expect(missing({ a: "есть", b: "  " })).toEqual(["b"]);
    expect(missing({ nested: { a: "" } })).toEqual(["nested.a"]);
  });

  it("функции-строки не считаются пустыми: их проверяет вызов", () => {
    expect(missing({ fn: () => "есть" })).toEqual([]);
  });

  it("вложенные словари проверяются, а не пропускаются", () => {
    // Половина интерфейса живёт во вложенных объектах (`welcome`, `catalog`).
    const deep = { outer: { inner: { deep: "" } } };
    expect(missing(deep)).toEqual(["outer.inner.deep"]);
  });
});

/**
 * Хранитель подключения: «нет перевода» сказано **в приложении**, а не только в
 * модуле. Тот же урок, что и в шаге 227: код, которого не зовут, — это документ.
 */
describe("уведомление о языке подключено в приложении", () => {
  const app = readFileSync(new URL("../app.tsx", import.meta.url), "utf8");

  it("язык читается из системы, а не задан числом", () => {
    expect(app).toContain("navigator.language");
    expect(app).toContain("choose(");
  });

  it("уведомление показывается, а не вычисляется в пустоту", () => {
    // Первая версия звала `localeNotice()` только в условии, и строка появлялась
    // бы лишь когда она и так есть.
    expect(app).toContain("{localeNotice() ? <span>{localeNotice()}</span> : null}");
  });

  it("`useState` стоит до ранних `return` — иначе хуки по условию", () => {
    // Первая версия искала `"  if ("` и попала в `useEffect` с клавиатурой —
    // проверка была бы красной на исправном коде. Ранний `return` узнаётся по
    // отступу **ровно в два пробела** и слову `return` в начале строки.
    const hook = app.indexOf("const [localeChoice] = useState(");
    expect(hook).toBeGreaterThan(-1);
    const before = app.slice(0, hook);
    const early = /\n {2}(?:if \([^\n]*\) )?return\b/.test(before);
    expect(early).toBe(false);
  });
});
