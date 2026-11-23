import { describe, expect, it } from "vitest";
import { add, clean, load, MAX_LENGTH, MAX_WORDS, remove, save, status, STORE_KEY, terms } from "./ownWords";

/**
 * Шаг 57: свой словарь — человек добавляет имена файлов и программ.
 *
 * «Квартал-3», «диплом_финал» распознавание не знает; правка общего словаря не
 * его дело, а повторять громче бесполезно.
 */
describe("слово добавляется так, как слышится", () => {
  it("добавленное сразу работает — без перезапуска", () => {
    // Отложенное действие — это действие, которое не сделают.
    const added = add([], "Квартал-3");
    expect(added.ok).toBe(true);
    expect(added.words).toEqual(["Квартал-3"]);
    expect(terms(added.words)).toEqual(["Квартал-3"]);
  });

  it("кавычки и лишние пробелы не мешают", () => {
    // Человек копирует имя файла и приносит кавычки с собой.
    expect(clean('  «диплом финал»  ')).toBe("диплом финал");
    expect(clean("отчёт   за  март")).toBe("отчёт за март");
  });

  it("повтор не добавляется дважды, но и не ругает", () => {
    // Человек мог забыть, что уже добавил: это не ошибка, а «уже есть».
    const added = add(["Квартал-3"], "квартал-3");
    expect(added.ok).toBe(false);
    expect("why" in added ? added.why : "").toContain("уже в словаре");
    expect(added.words).toEqual(["Квартал-3"]);
  });
});

describe("человек видит словарь и может его почистить", () => {
  it("удаление по слову, регистр не важен", () => {
    // Человек нажимает крестик у слова, а не пишет его заново.
    expect(remove(["Квартал-3", "диплом финал"], "квартал-3")).toEqual(["диплом финал"]);
  });

  it("сказано, сколько слов и сколько ещё поместится", () => {
    // Без числа не понять, кончилось место или что-то сделано не так.
    expect(status([])).toContain("пуст");
    expect(status(["а"])).toContain("1 из");
    expect(status(["а"])).toContain("ещё");
  });

  it("полный словарь говорит, что делать", () => {
    // «Нельзя» без пути — тупик.
    const full = Array.from({ length: MAX_WORDS }, (_, index) => `слово${index}`);
    const added = add(full, "новое");
    expect(added.ok).toBe(false);
    expect("why" in added ? added.why : "").toContain("удалите");
    expect(status(full)).toContain("полон");
  });
});

describe("отказы называют причину и путь", () => {
  it("пустое слово — не молчание", () => {
    expect(add([], "   ").ok).toBe(false);
    expect(add([], "   ").words).toEqual([]);
  });

  it("слишком длинное — это фраза, а не термин", () => {
    const long = "а".repeat(MAX_LENGTH + 1);
    const added = add([], long);
    expect(added.ok).toBe(false);
    expect("why" in added ? added.why : "").toContain(String(MAX_LENGTH));
  });
});

describe("словарь принадлежит человеку", () => {
  it("похожие слова не вытесняют друг друга", () => {
    // Выкидывать чужое слово за него нельзя: «отчёт» и «отчёт квартал» — разные.
    const first = add([], "отчёт");
    const second = add(first.words, "отчёт квартал");
    expect(second.words).toEqual(["отчёт", "отчёт квартал"]);
  });

  it("порядок добавления сохраняется — это единственный сигнал важности", () => {
    const added = add(add([], "первое").words, "второе");
    expect(terms(added.words)).toEqual(["первое", "второе"]);
  });

describe("словарь переживает перезапуск", () => {
  const fake = () => {
    const data = new Map<string, string>();
    return {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => void data.set(key, value),
      data,
    };
  };

  it("сохранённое читается обратно", () => {
    // Словарь, который забывается при перезапуске, бесполезен: его не будут
    // заполнять заново.
    const storage = fake();
    save(storage, ["Квартал-3", "диплом финал"]);
    expect(load(storage)).toEqual(["Квартал-3", "диплом финал"]);
    expect(storage.data.has(STORE_KEY)).toBe(true);
  });

  it("битое хранилище — пустой словарь, а не падение", () => {
    // Подсказка не должна быть условием запуска.
    const storage = fake();
    storage.setItem(STORE_KEY, "{не json");
    expect(load(storage)).toEqual([]);
    storage.setItem(STORE_KEY, '{"а":1}');
    expect(load(storage)).toEqual([]);
    storage.setItem(STORE_KEY, '["а", 5, null]');
    expect(load(storage)).toEqual(["а"]);
  });

  it("без хранилища правило работает", () => {
    // Приватный режим или тесты: словарь живёт до перезапуска, но не ломается.
    expect(load(null)).toEqual([]);
    expect(() => save(null, ["а"])).not.toThrow();
  });
});
});
