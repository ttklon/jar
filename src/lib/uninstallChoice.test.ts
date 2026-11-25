import { describe, expect, it } from "vitest";
import { ITEMS, defaultChoice, format, listing, preview, whatRemains, whereKept } from "./uninstallChoice";

/**
 * Шаг 305: удаление оставляет данные, если попросили; иначе — чисто.
 *
 * Удаляем всё молча — человек теряет память за год. Оставляем всё молча — считает,
 * что «удалил», а на диске 4 ГБ.
 */

describe("удаление — вопрос со списком, а не галочка", () => {
  it("каждая строка с размером и «можно ли получить заново»", () => {
    const got = listing();
    expect(got.length).toBe(ITEMS.length);
    expect(got[0]).toContain("восстановить нельзя");
    expect(got.some((row) => row.includes("скачается заново"))).toBe(true);
  });

  it("модель по весу больше всего остального вместе", () => {
    const models = ITEMS.find((item) => item.id === "models")!;
    const rest = ITEMS.filter((item) => item.id !== "models").reduce((sum, item) => sum + item.mb, 0);
    expect(models.mb).toBeGreaterThan(rest);
  });

  it("ГБ вместо «4200 МБ»", () => {
    expect(format(4200)).toBe("4.1 ГБ");
    expect(format(1024)).toBe("1 ГБ");
    expect(format(8)).toBe("8 МБ");
  });
});

describe("ответ по умолчанию — оставить данные", () => {
  it("потому что асимметрия, а не «безопаснее»", () => {
    const got = defaultChoice();
    expect(got.choice).toBe("keep");
    expect(got.why).toContain("вернуть собранную память — нельзя");
  });
});

describe("предпросмотр говорит, что потеряется", () => {
  it("оставить данные — всё равно освобождает модели и движок", () => {
    const got = preview("keep");
    expect(got.lost).toEqual([]);
    expect(got.said).toContain("память, журнал и настройки останутся");
    expect(got.freeMb).toBe(4500);
  });

  it("удалить всё — называет, что восстановить нельзя", () => {
    const got = preview("wipe");
    expect(got.lost).toContain("память: факты и предпочтения");
    expect(got.said).toContain("восстановить нельзя");
  });
});

describe("после удаления — не молчание", () => {
  it("«удалить всё» — так и говорим: ничего не осталось", () => {
    expect(whatRemains("wipe")).toContain("ничего не осталось");
  });

  it("данные остались — сказано где", () => {
    const got = whatRemains("keep");
    expect(got).toContain("память");
    expect(whereKept()).toContain("переживает удаление");
  });
});
