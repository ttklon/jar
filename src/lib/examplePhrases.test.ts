import { describe, expect, it } from "vitest";
import { check, checks, fix, MIN_CONFIDENCE, notDo, type Example, type Parse } from "./examplePhrases";

/**
 * Шаг 472: каждая фраза в примерах проверяется тестом.
 */

const example = (over: Partial<Example> = {}): Example => ({ said: "почисти загрузки", hand: "clean", gets: "файлы в корзину", ...over });
const parse = (over: Partial<Parse> = {}): ((said: string) => Parse) => () => ({ hand: "clean", confidence: 0.9, dangerous: false, ...over });

describe("пример — это обещание", () => {
  it("работающий пример проходит", () => {
    expect(check([example()], parse())).toMatchObject({ ok: true, broken: [] });
  });

  it("фраза перестала разбираться — красный тест", () => {
    const got = check([example()], parse({ hand: null }));
    expect(got.ok).toBe(false);
    expect(got.broken[0]).toContain("больше не разбирается");
  });

  it("попадает в другую руку — назван обещанный и настоящий", () => {
    const got = check([example()], parse({ hand: "other" }));
    expect(got.broken[0]).toContain("попадает в «other», а обещано «clean»");
  });

  it("низкая уверенность — не пример", () => {
    const got = check([example()], parse({ confidence: MIN_CONFIDENCE - 0.1 }));
    expect(got.broken[0]).toContain("уверенность 0.50");
  });

  it("опасная рука без слова «спросит» — пример врёт", () => {
    const got = check([example()], parse({ dangerous: true }));
    expect(got.broken[0]).toContain("не сказано, что спросит");
  });

  it("опасная рука с «спросит» — честный пример", () => {
    expect(check([example({ gets: "спросит и удалит в корзину" })], parse({ dangerous: true })).ok).toBe(true);
  });
});

describe("сводка и починка", () => {
  it("всё работает — числом", () => {
    expect(check([example(), example({ said: "найди счета" })], parse()).said).toContain("все 2 примеров работают");
  });

  it("два исхода починки, оба честные", () => {
    const got = fix().join();
    expect(got).toContain("дефект разбора");
    expect(got).toContain("пример убирают");
  });

  it("пример не правят под то, что получилось", () => {
    expect(notDo()[0]).toContain("пример — это обещание");
    expect(checks()).toHaveLength(3);
  });
});
