import { describe, expect, it } from "vitest";
import { add, markEngine, markScreen, pick, startHour, usesEngine } from "./queue";

const budget = (over: Partial<{ parallel: number; mayStart: boolean; away: boolean }> = {}) => ({
  parallel: 3,
  mayStart: true,
  away: true,
  ...over,
});
/** Свежий час: тесты про ширину не должны упираться в потолок случайно. */
const freshHour = () => startHour(0);

/**
 * Шаг 137 на настоящей очереди: два дела на один движок не идут вместе.
 *
 * Вместе они делят процессор и оба медленнее, чем по очереди.
 */
const NOW = Date.UTC(2026, 0, 1, 9, 0, 0);

describe("движок один, и это видно по плану", () => {
  it("план от модели — движок участвовал", () => {
    expect(usesEngine({ plan: { goal: "g", source: "model", steps: [] } } as never)).toBe(true);
  });

  it("план целиком из реестра — движок не нужен", () => {
    expect(
      usesEngine({
        plan: { goal: "g", source: "registry", steps: [{ registry: "звук|убавить|громкость", params: {} }] },
      } as never),
    ).toBe(false);
  });

  it("плана нет — считаем, что нужен: осторожность дешевле гонки", () => {
    expect(usesEngine(null)).toBe(true);
  });
});

describe("второе дело на движок ждёт", () => {
  it("одно идёт, второе ждёт, и причина названа", () => {
    let items = add(add([], "переименовать фото", "1"), "сжать видео", "2");
    items = markEngine(markEngine(items, "1", true), "2", true);

    const picked = pick(items, budget({ parallel: 3 }), freshHour(), NOW);
    expect(picked.indices).toEqual([0]);
    expect(picked.reason).toContain("движок один, второе на нём было бы медленнее");
  });

  it("дело без движка не ждёт занятого: очередь ради очереди замедляет", () => {
    let items = add(add([], "убавить громкость", "1"), "проверить место", "2");
    items = markEngine(markEngine(items, "1", false), "2", false);

    expect(pick(items, budget({ parallel: 3 }), freshHour(), NOW).indices).toEqual([0, 1]);
  });

  it("экран по-прежнему важнее: два экранных не идут вместе", () => {
    let items = add(add([], "нажать в окне", "1"), "нажать в другом", "2");
    items = markScreen(markScreen(items, "1", true), "2", true);
    items = markEngine(markEngine(items, "1", false), "2", false);

    expect(pick(items, budget({ parallel: 3 }), freshHour(), NOW).indices).toEqual([0]);
  });
});
