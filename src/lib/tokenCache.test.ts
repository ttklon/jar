import { describe, expect, it } from "vitest";
import { clear, commonPrefix, KEEP, put, resume, saved, stale, type Entry } from "./tokenCache";

/**
 * Шаг 68: кэш токенизации реплики — повтор не пересчитывает всё.
 *
 * Девяносто процентов истории не менялось: человек добавил одну фразу, а
 * пересчитывается всё.
 */
const entry = (text: string, tokens: number[], tokenizer = "qwen"): Entry => ({ text, tokens, tokenizer });

describe("неизменное не пересчитывается", () => {
  it("общее начало находится, остальное считается", () => {
    // Предыдущий разговор почти всегда префикс нового.
    const cache = [entry("привет как дела", [1, 2, 3, 4])];
    const resumed = resume(cache, "привет как дела что нового", "qwen");
    expect(resumed?.rest).toBe(" что нового");
    expect(resumed?.tokens.length).toBeGreaterThan(0);
    expect(resumed?.tokens.length).toBeLessThanOrEqual(4);
  });

  it("тот же текст — считать нечего вовсе", () => {
    const cache = [entry("привет", [1, 2])];
    const resumed = resume(cache, "привет", "qwen");
    expect(resumed?.rest).toBe("");
    expect(resumed?.tokens).toEqual([1, 2]);
  });

  it("ничего общего — считаем с нуля", () => {
    expect(resume([entry("привет", [1])], "совсем другое", "qwen")).toBeNull();
  });

  it("половина слова не префикс, а целое слово — префикс", () => {
    // «ко» — половина слова, и продолжать с него нельзя: токены посчитаны по
    // целым словам. А «кот» целиком в «кот сидит» — законное общее начало.
    expect(commonPrefix("котик", "кофе")).toBe(0);
    expect(commonPrefix("кот", "котик")).toBe(3);
    expect(commonPrefix("кот сидит", "кот сидит там")).toBe(9);
  });
});

describe("чужой токенизатор — чужие токены", () => {
  it("после смены модели кэш негоден", () => {
    // Иначе модель получит токены чужого словаря и выдаст мусор **без видимой
    // ошибки** — худший вид сбоя.
    const old = entry("привет", [1, 2]);
    expect(stale(old, "llama")).toBe(true);
    expect(resume([old], "привет мир", "llama")).toBeNull();
  });

  it("чистка убирает только чужое", () => {
    const cache = [entry("а", [1], "qwen"), entry("б", [2], "llama")];
    expect(clear(cache, "qwen").length).toBe(1);
    expect(clear(cache, "qwen")[0]?.text).toBe("а");
  });
});

describe("кэш не растёт без предела", () => {
  it("новое вытесняет старое: последний разговор нужнее первого", () => {
    let cache: Entry[] = [];
    for (let index = 0; index < KEEP + 5; index += 1) cache = put(cache, entry(`т${index}`, [index]));
    expect(cache.length).toBe(KEEP);
    expect(cache[0]?.text).toBe(`т${KEEP + 4}`);
  });

  it("тот же текст не дублируется", () => {
    const cache = put(put([], entry("а", [1])), entry("а", [1, 2]));
    expect(cache.length).toBe(1);
  });
});

describe("экономию можно проверить", () => {
  it("сэкономить больше, чем есть, нельзя", () => {
    // Иначе отчёт о кэше врёт в свою пользу.
    expect(saved([1, 2, 3], 10)).toBe(3);
    expect(saved([1, 2, 3], -5)).toBe(0);
  });
});
