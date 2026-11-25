import { describe, expect, it } from "vitest";
import { duplicate, find, keeps, label, rename, type Deed } from "./nameAfterDeed";

/**
 * Шаг 371: дело можно назвать своими словами после завершения — поиск по смыслу.
 */

const deed = (over: Partial<Deed> = {}): Deed => ({
  id: "1",
  title: "уборка загрузок",
  summary: "удалено 12 старых файлов",
  mine: "",
  ...over,
});

describe("своё имя добавляется, а не заменяет", () => {
  it("имя дано — в отчёте остаётся и то, что было", () => {
    const got = rename(deed(), "почистил комп");
    expect(got.deed.mine).toBe("почистил комп");
    expect(got.said).toContain("останется и то, что было сделано");
  });

  it("пустое имя — снять имя, а не ошибка", () => {
    const got = rename(deed({ mine: "почистил комп" }), "  ");
    expect(got.deed.mine).toBe("");
    expect(got.said).toContain("снова называется как есть");
  });

  it("своё имя первым, программа — в скобках", () => {
    expect(label(deed({ mine: "почистил комп" }))).toBe("почистил комп (уборка загрузок)");
  });

  it("без имени — как назвала программа", () => {
    expect(label(deed())).toBe("уборка загрузок");
  });
});

describe("поиск по словам человека", () => {
  const deeds = [deed({ id: "a", mine: "почистил комп" }), deed({ id: "b", title: "проверка обновлений", summary: "версия 2.1" })];

  it("«комп» находит своё имя", () => {
    expect(find(deeds, "комп")).toEqual([deeds[0]]);
  });

  it("поиск по старому названию тоже работает", () => {
    expect(find(deeds, "загрузок")[0]?.id).toBe("a");
  });

  it("поиск по сводке — по смыслу", () => {
    expect(find(deeds, "12 старых")).toHaveLength(1);
  });

  it("своё имя сильнее: порядок по совпадению", () => {
    const many = [deed({ id: "a", summary: "почистил комп и загрузки" }), deed({ id: "b", mine: "почистил комп" })];
    expect(find(many, "почистил комп")[0]?.id).toBe("b");
  });

  it("пустой запрос ничего не находит", () => {
    expect(find(deeds, "   ")).toEqual([]);
  });
});

describe("что имя не меняет", () => {
  it("три факта, включая «шаги не переименовываются»", () => {
    const got = keeps();
    expect(got.length).toBe(3);
    expect(got.join()).toContain("имя — метка поверх");
  });

  it("имя может повторяться: оно для поиска", () => {
    expect(duplicate("почистил комп")).toContain("для поиска, а не для порядка");
  });
});
