import { describe, expect, it } from "vitest";
import { findSecret, proves, samples, writeAll, type Store } from "./secretWriteTest";

/**
 * Шаг 438: никаких записей с содержимым секретов — тест на запись.
 */

describe("проверка идёт по записанному, а не по коду", () => {
  it("ни одного значения секрета в хранилище", () => {
    const store = writeAll(samples().map((s) => s.phrase));
    for (const item of samples()) expect(findSecret(store, item.secret)).toEqual([]);
  });

  it("каждый путь записи участвовал", () => {
    const store = writeAll(["почисти загрузки"]);
    expect(store.rows).toHaveLength(3);
    expect(store.rows.join(" ")).toContain("journal:");
    expect(store.rows.join(" ")).toContain("error:");
  });

  it("место секрета помечено, а не стёрто молча", () => {
    const store = writeAll(["сохрани пароль: hunter2"]);
    expect(store.rows[0]).toContain("[секрет]");
  });

  it("дефект шага 423 — «пароль от почты» — тоже не записывается", () => {
    const item = samples().find((s) => s.phrase.includes("от почты"))!;
    expect(findSecret(writeAll([item.phrase]), item.secret)).toEqual([]);
  });
});

describe("проверка ловит утечку, а не только её отсутствие", () => {
  it("подложенная строка без вычистки — найдена", () => {
    const broken: Store = { rows: ["error: не смог открыть пароль: hunter2"] };
    expect(findSecret(broken, "hunter2")).toHaveLength(1);
  });

  it("обычная фраза не даёт ложного срабатывания", () => {
    expect(findSecret(writeAll(["почисти загрузки"]), "hunter2")).toEqual([]);
  });
});

describe("что доказано", () => {
  it("три утверждения — по одному на путь", () => {
    expect(proves()).toHaveLength(3);
  });
});
