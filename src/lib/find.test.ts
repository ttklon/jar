import { describe, expect, it } from "vitest";
import { filterFindables, findables, kindLabel } from "./find";

/**
 * Шаг 192: одно поле ищет и настройки, и возможности.
 *
 * Главная проверка — не «находится ли тема», а **что именно** находится: поиск,
 * который на «скачать модель» отвечает «Настройки», хуже отсутствия поиска —
 * человек идёт туда и не находит там модели вовсе.
 */
describe("поиск настроек и возможностей", () => {
  it("настройка находится по своему слову и ведёт на экран настроек", () => {
    const found = filterFindables(findables(), "тема");
    expect(found.length).toBeGreaterThan(0);
    expect(found[0]?.kind).toBe("setting");
    expect(found[0]?.id).toBe("settings");
  });

  it("возможность ведёт туда, где она живёт, а не в настройки", () => {
    // «Скачать модель» — это не настройка и не экран: живёт на карточке моделей.
    // Ответ «Настройки» отправил бы человека искать модель в теме оформления.
    const found = filterFindables(findables(), "скачать модель");
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((item) => item.id === "models")).toBe(true);
  });

  it("регистр и ё/е не разница — как в палитре экранов", () => {
    // Два списка должны искаться одинаково: иначе «Тема» находится, а «тема» нет.
    expect(filterFindables(findables(), "ТЕМА")).toHaveLength(
      filterFindables(findables(), "тема").length,
    );
    expect(filterFindables(findables(), "тёмная")).toHaveLength(
      filterFindables(findables(), "темная").length,
    );
  });

  it("пустой запрос показывает всё — поиск открывается как оглавление", () => {
    expect(filterFindables(findables(), "")).toHaveLength(findables().length);
    expect(filterFindables(findables(), "   ")).toHaveLength(findables().length);
  });

  it("чего нет — того нет, и пустота честная", () => {
    // Не «ближайшее похожее»: поиск, который на любое слово что-то находит,
    // перестаёт быть поиском.
    expect(filterFindables(findables(), "хочу на луну")).toEqual([]);
  });

  it("у каждой находки сказано, что это", () => {
    // «Тема» и «экран» — разные вещи; подсказка различима, и повторов нет.
    const labels = new Set([kindLabel("screen"), kindLabel("setting"), kindLabel("ability")]);
    expect(labels.size).toBe(3);
    for (const item of findables()) {
      expect(item.label.trim().length).toBeGreaterThan(0);
      expect(kindLabel(item.kind).trim().length).toBeGreaterThan(0);
    }
  });

  it("всё найденное ведёт на настоящий экран", () => {
    // Ссылка на несуществующий экран — это пустота после нажатия.
    const screens = ["voice", "overview", "catalog", "ask", "hands", "flows", "apps", "models", "journal", "settings"];
    for (const item of findables()) {
      expect(screens).toContain(item.id);
    }
  });
});
