import { describe, expect, it } from "vitest";
import { empty, idle, picked, type Entry } from "./paletteStart";

/**
 * Шаг 281: Raycast — палитра, быстрый старт, единый вход.
 *
 * Взято одно поле как вход. Не взято: расширения, облачный индекс, «единый экран
 * вместо единого поля».
 */

const NOW = 1_800_000_000_000;

const entry = (over: Partial<Entry> = {}): Entry => ({
  id: "clean",
  title: "почисти диск",
  does: "покажу, что занимает место",
  ...over,
});

describe("пустое поле подсказывает слово, а не молчит", () => {
  it("показывает последнее", () => {
    // Пустой экран с курсором — человек не знает, что писать, и закрывает.
    const got = idle([entry({ last: NOW - 1000 }), entry({ id: "b", title: "фото", last: NOW })]);
    expect(got.items[0]!.title).toBe("фото");
    expect(got.said).toContain("последнее и частое");
  });

  it("свежее важнее частого", () => {
    const got = idle([
      entry({ id: "a", last: NOW - 10_000, times: 50 }),
      entry({ id: "b", last: NOW, times: 1 }),
    ]);
    expect(got.items[0]!.id).toBe("b");
  });

  it("ничего не выбирали — сказано, с чего начать", () => {
    const got = idle([entry()]);
    expect(got.items).toEqual([]);
    expect(got.said).toContain("начните писать");
  });

  it("показывается не больше пяти", () => {
    const many = Array.from({ length: 9 }, (_, i) => entry({ id: `e${i}`, last: NOW - i }));
    expect(idle(many).items.length).toBe(5);
  });
});

describe("Enter выполняет подсвеченное, а не первое", () => {
  it("берётся по индексу подсветки", () => {
    // Иначе приложение выполнит не то, что человек видит выделенным, — действие
    // без согласия с экраном.
    const items = [entry({ id: "a" }), entry({ id: "b" })];
    expect(picked(items, 1).entry!.id).toBe("b");
  });

  it("что будет — сказано до нажатия", () => {
    const items = [entry({ does: "удалю временные файлы" })];
    expect(picked(items, 0).said).toBe("удалю временные файлы");
  });

  it("подсветки нет — сказано, а не выполнено наугад", () => {
    const got = picked([entry()], 5);
    expect(got.entry).toBeNull();
    expect(got.said).toContain("подсветки нет");
  });

  it("пустой список — не «выполнено»", () => {
    expect(picked([], 0).said).toContain("нечего выполнять");
  });
});

describe("ничего не нашлось — с подсказкой", () => {
  it("пустой запрос отличается от ненайденного", () => {
    expect(empty("")).toContain("начните писать");
    expect(empty("борщ")).toContain("ничего нет");
    expect(empty("борщ")).toContain("борщ");
  });
});
