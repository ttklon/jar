import { describe, expect, it } from "vitest";
import { audit, check, isUserWords, stillNeeded, type Idea, type Pain } from "./painFirst";

/**
 * Шаг 296: проверить, что каждая заимствованная идея закрывает названную боль.
 *
 * Идея без боли — украшение: выглядит как работа, ничего не решает.
 */

const pains: readonly Pain[] = [
  { id: "p1", said: "не помню, куда сохранил файл", people: 7 },
  { id: "p2", said: "не понимаю, почему модель отвечает медленно", people: 3 },
  { id: "p3", said: "нет функции календаря", people: 1 },
];

const idea = (over: Partial<Idea> = {}): Idea => ({
  what: "память одной строкой",
  pain: "p1",
  then: "нахожу файл, вспомнив примерно, о чём он был",
  ...over,
});

describe("боль — словами человека", () => {
  it("«не помню, куда сохранил файл» — слова человека", () => {
    expect(isUserWords(pains[0]!)).toBe(true);
  });

  it("«нет функции календаря» — наши слова, и это ловушка", () => {
    // Так любая идея «закрывает» сама себя.
    expect(isUserWords(pains[2]!)).toBe(false);
  });
});

describe("идея проверяется по боли, а не наоборот", () => {
  it("боль названа, человек сможет больше — идея проходит", () => {
    const got = check(idea(), pains);
    expect(got.ok).toBe(true);
    expect(got.why).toContain("не помню, куда сохранил файл");
  });

  it("боль нашим языком — идея не проверена", () => {
    const got = check(idea({ pain: "p3" }), pains);
    expect(got.ok).toBe(false);
    expect(got.why).toContain("нашим языком");
  });

  it("ссылка на боль, которой нет, — идея из воздуха", () => {
    expect(check(idea({ pain: "p9" }), pains).why).toContain("которой нет в списке");
  });

  it("боль, которую никто не называл, — догадка", () => {
    const got = check(idea(), [{ id: "p1", said: "не помню, куда сохранил файл", people: 0 }]);
    expect(got.ok).toBe(false);
    expect(got.why).toContain("это догадка");
  });
});

describe("«тогда» — что человек смог, а не что мы нарисовали", () => {
  it("«поле поиска» — это интерфейс, а не польза", () => {
    const got = check(idea({ then: "поле поиска в шапке окна" }), pains);
    expect(got.ok).toBe(false);
    expect(got.why).toContain("элемент интерфейса");
  });

  it("«кнопка напоминания» — то же самое", () => {
    expect(check(idea({ then: "кнопка «напомнить»" }), pains).ok).toBe(false);
  });

  it("слишком короткое «тогда» не отличить от украшения", () => {
    expect(check(idea({ then: "стало лучше" }), pains).why).toContain("слишком короткое");
  });
});

describe("итог по таблице", () => {
  it("всё по делу — так и говорим", () => {
    const got = audit([idea()], pains);
    expect(got.ok).toBe(true);
    expect(got.said).toContain("все закрывают названную боль");
  });

  it("украшения считаются, а не прячутся", () => {
    const got = audit([idea({ pain: "p3" }), idea({ what: "календарь", then: "поле даты в памяти" })], pains);
    expect(got.ok).toBe(false);
    expect(got.said).toContain("украшений 2 из 2");
  });

  it("боль без идеи — вопрос, а не ошибка", () => {
    const got = audit([idea()], pains);
    expect(got.ok).toBe(true);
    expect(got.unused).toContain("не понимаю, почему модель отвечает медленно");
  });

  it("боль закрыта другим способом — идею убираем, а не держим «на всякий случай»", () => {
    expect(stillNeeded(idea(), pains.slice(1))).toBe(false);
  });
});
