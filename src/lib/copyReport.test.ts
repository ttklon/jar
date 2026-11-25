import { describe, expect, it } from "vitest";
import { audit, copied, essentials, shorten, text, type Report } from "./copyReport";

/**
 * Шаг 374: скопировать отчёт одной кнопкой, по-русски и по-человечески.
 *
 * Отчёт копируют для другого человека: в чат, в поддержку, в письмо.
 */

const report = (over: Partial<Report> = {}): Report => ({
  said: "почисти загрузки",
  when: "20 ноября, 09:12",
  steps: [{ name: "просмотр", detail: "12 старых файлов" }, { name: "удаление", detail: "удалено 12, освобождено 340 МБ" }],
  ...over,
});

describe("отчёт читается без нас", () => {
  it("что просили, что вышло", () => {
    const got = text(report());
    expect(got.split("\n")[0]).toBe("Что просили: почисти загрузки");
    expect(got).toContain("  — удаление: удалено 12, освобождено 340 МБ");
  });

  it("что не получилось и что делать — если было", () => {
    const got = text(report({ failed: "папка занята", next: "закрыть проводник" }));
    expect(got).toContain("Что не получилось: папка занята");
    expect(got).toContain("Что делать: закрыть проводник");
  });

  it("ничего не выполнилось — так и говорим", () => {
    expect(text(report({ steps: [] }))).toContain("ничего не выполнилось");
  });
});

describe("в отчёте нет лишнего", () => {
  it("путь сокращается до двух последних частей", () => {
    expect(shorten("C:\\Users\\anna\\AppData\\Local\\ZShelper\\data")).toBe("…\\ZShelper\\data");
  });

  it("короткий путь не трогаем", () => {
    expect(shorten("C:\\data")).toBe("C:\\data");
  });

  it("полный путь с именем пользователя — замечание", () => {
    const bad = report({ steps: [{ name: "файл", detail: "C:\\Users\\anna\\Desktop\\отчёт.pdf" }] });
    expect(audit(bad).join()).toContain("с именем пользователя");
  });

  it("секрет в отчёте ловится", () => {
    expect(audit(report({ next: "проверьте token" })).join()).toContain("секрет");
  });

  it("JSON в отчёте ловится", () => {
    expect(audit(report({ failed: 'ответ: {"error": "нет доступа"}' })).join()).toContain("JSON");
  });

  it("stack trace ловится", () => {
    expect(audit(report({ failed: "TypeError at run (main.ts:12)" })).join()).toContain("stack trace");
  });

  it("чистый отчёт — замечаний нет", () => {
    expect(audit(report())).toEqual([]);
  });
});

describe("кнопка говорит, что скопировала", () => {
  it("без этого нажимают второй раз", () => {
    expect(copied()).toContain("скопирован");
  });

  it("три обязательные вещи для поддержки", () => {
    expect(essentials().length).toBe(3);
    expect(essentials().join()).toContain("фраза человека");
  });
});
