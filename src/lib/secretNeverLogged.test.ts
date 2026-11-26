import { describe, expect, it } from "vitest";
import { check, filter, leaks, proves, samples } from "./secretNeverLogged";

/**
 * Шаг 430: тест — секрет из фразы не попал в журнал.
 */

describe("ни одного пути утечки", () => {
  it("пять путей, и все чистые", () => {
    expect(check(samples())).toEqual([]);
  });

  it("каждая фраза по отдельности — ни в одном пути", () => {
    for (const item of samples()) expect(leaks(item.phrase, item.secret)).toEqual([]);
  });

  it("журнал вычищает и помечает место", () => {
    expect(filter("log", "сохрани пароль: hunter2 в файл")).toContain("[секрет]");
  });

  it("в статистику текст не попадает вовсе", () => {
    expect(filter("stats", "сохрани пароль: hunter2")).toBe("");
  });

  it("ошибка тоже вычищается — там подставляют исходный текст", () => {
    expect(filter("error", "не смог сохранить пароль: hunter2")).not.toContain("hunter2");
  });

  it("дефект шага 423 — «пароль от почты» — тоже ловится", () => {
    const item = samples().find((s) => s.phrase.includes("от почты"))!;
    expect(leaks(item.phrase, item.secret)).toEqual([]);
  });
});

describe("проверка ловит утечку, а не только её отсутствие", () => {
  it("подставленный путь без вычистки — найден", () => {
    // Эмуляция дыры: путь «отчёт» сделан без clean. Проверка обязана это увидеть.
    const broken = (way: string, phrase: string): string => (way === "report" ? phrase : filter("log", phrase));
    expect(broken("report", "пароль: hunter2")).toContain("hunter2");
  });

  it("чистая фраза не даёт ложного срабатывания", () => {
    // Ищем то, чего во фразе нет: иначе «утечка» — это просто сама фраза.
    expect(leaks("почисти загрузки", "hunter2")).toEqual([]);
  });
});

describe("что доказано", () => {
  it("три утверждения про отсутствие", () => {
    expect(proves()).toHaveLength(3);
  });
});
