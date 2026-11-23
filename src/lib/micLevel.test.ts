import { describe, expect, it } from "vitest";
import {
  LEVEL_WORD,
  CLIP_AT,
  TEST_PHRASE,
  TEST_RESULT,
  advice,
  level,
  ready,
  type Level,
} from "./micLevel";

/**
 * Шаг 51: настройка микрофона — уровень и тестовая фраза.
 *
 * «Работает / не работает» — не ответ на вопрос человека: он пришёл, потому что
 * его не слышат, и ему нужно знать, слышат ли **сейчас** и достаточно ли громко.
 * «Работает» может значить «микрофон открылся, но вас едва слышно».
 */
const ALL: Level[] = ["silent", "quiet", "good", "loud", "clipping"];

describe("уровень", () => {
  it("уровень называется словом, а не числом", () => {
    // Человеку не нужно число: ему нужно знать, надо ли говорить громче.
    expect(level(0)).toBe("silent");
    expect(level(0.02)).toBe("quiet");
    expect(level(0.2)).toBe("good");
    expect(level(0.7)).toBe("loud");
    expect(level(0.99)).toBe("clipping");
  });

  it("перегрузка — отдельное слово, а не «громко»", () => {
    // «Громко» — хорошо; перегрузка — искажение, из которого разбор делает
    // мусор. Одно слово на оба значило бы советовать не то.
    expect(LEVEL_WORD.clipping).not.toBe(LEVEL_WORD.loud);
    expect(advice("clipping")).toContain("отодвиньтесь");
    // И совет не «говорите тише»: тише — это тихий голос, а не расстояние.
    expect(advice("clipping")).not.toContain("говорите тише");
    expect(CLIP_AT).toBeGreaterThan(0.9);
  });

  it("пять состояний — пять разных слов", () => {
    expect(new Set(ALL.map((item) => LEVEL_WORD[item])).size).toBe(5);
  });

  it("у каждого состояния свой совет, а не общий «проверьте микрофон»", () => {
    for (const item of ALL) {
      expect(advice(item).length).toBeGreaterThan(20);
    }
    expect(new Set(ALL.map(advice)).size).toBe(5);
    // У молчания причин две, и совет не выбирает за человека: не говорят или не
    // слышат.
    expect(advice("silent")).toContain("скажите");
    expect(advice("silent")).toContain("микрофон");
  });

  it("мусорные значения не ломают правило", () => {
    expect(level(Number.NaN)).toBe("silent");
    expect(level(-1)).toBe("silent");
  });
});

describe("тестовая фраза", () => {
  it("фраза названа, короткая и осмысленная", () => {
    // Не «скажите что-нибудь»: человек должен знать, что сказать, и узнать это
    // в поле «Услышал».
    expect(TEST_PHRASE.split(" ").length).toBeLessThan(5);
    expect(TEST_PHRASE.length).toBeGreaterThan(5);
  });

  it("сказано, что произойдёт после фразы", () => {
    // Обещание проверяемое: человек ждёт именно этого, а не «результата».
    expect(TEST_RESULT).toContain("появится");
  });

  it("готовность к проверке честная", () => {
    // Тишина — не повод не пробовать, но сказать об этом надо до, иначе человек
    // скажет фразу в закрытый микрофон и решит, что тот сломан.
    expect(ready("good")).toBe(true);
    expect(ready("quiet")).toBe(true);
    // А с перегрузкой проверять рано: искажение режет слова, и тест провалится
    // по причине, которую можно убрать за секунду.
    expect(ready("clipping")).toBe(false);
  });
});
