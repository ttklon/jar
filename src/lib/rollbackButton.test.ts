import { describe, expect, it } from "vitest";
import { dataCopy, labelProblems, offer, offline, where, type Previous } from "./rollbackButton";

/**
 * Шаг 314: откат обновления — файл предыдущей версии рядом, одна кнопка, без сети.
 *
 * Проверяется одним вопросом: что человек сделает, если новая версия не запускается?
 */

const prev = (over: Partial<Previous> = {}): Previous => ({
  version: "1.9",
  file: "ZShelper-1.9.exe",
  bytes: 40_000_000,
  readsSchema: 3,
  ...over,
});

describe("кнопка называется действием и с номером", () => {
  it("«Вернуть версию 1.9», а не «откатить»", () => {
    const got = offer(prev(), 3);
    expect(got.available).toBe(true);
    expect(got.label).toBe("Вернуть версию 1.9");
    expect(labelProblems(got)).toEqual([]);
  });

  it("кнопка без номера версии — проблема", () => {
    const got = { available: true, label: "Откатить", warning: "вернётся прежняя версия программы" };
    expect(labelProblems(got).join()).toContain("нет номера версии");
  });

  it("нет файла рядом — откат недоступен, и это сказано", () => {
    const got = offer(null, 3);
    expect(got.available).toBe(false);
    expect(got.warning).toContain("откат недоступен");
  });

  it("пустой файл — то же, что нет файла", () => {
    expect(offer(prev({ bytes: 0 }), 3).available).toBe(false);
  });
});

describe("данные предупреждаются до нажатия, а не после", () => {
  it("предыдущая версия читает схему — спокойное предупреждение", () => {
    const got = offer(prev(), 3);
    expect(got.warning).toContain("останутся на месте");
  });

  it("не читает — кнопка остаётся, но предупреждение первым", () => {
    const got = offer(prev({ readsSchema: 2 }), 3);
    expect(got.available).toBe(true);
    expect(got.warning).toContain("новые записи она не увидит");
    expect(got.warning).toContain("копию данных");
  });

  it("копия называется так, что её найдут", () => {
    expect(dataCopy(3)).toBe("data-до-отката-схема-3.bak");
  });
});

describe("без сети", () => {
  it("все файлы на диске — можно", () => {
    expect(offline([{ file: "ZShelper-1.9.exe", present: true }])).toEqual({ ok: true, missing: [] });
  });

  it("хоть один надо докачать — это не откат без сети", () => {
    const got = offline([
      { file: "ZShelper-1.9.exe", present: true },
      { file: "engine-1.9.dll", present: false },
    ]);
    expect(got.ok).toBe(false);
    expect(got.missing).toEqual(["engine-1.9.dll"]);
  });

  it("файл лежит рядом с программой, а не во временной папке", () => {
    expect(where()).toContain("рядом с текущей версией");
  });
});
