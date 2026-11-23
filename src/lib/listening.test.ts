import { describe, expect, it } from "vitest";
import { MIC_WORD, TRAY_WORD, allWordsDistinct, hears, sayWord, type MicState } from "./listening";

/**
 * Шаг 49: явный индикатор «сейчас услышат» на экране и в трее.
 *
 * Цвет — плохой ответ на вопрос «меня слышат?»: его не видит дальтоник, не
 * слышит диктор, не замечает тот, кто смотрит в сторону. Поэтому у микрофона
 * всегда есть **слово**.
 */
const ALL: MicState[] = ["closed", "listening", "parsing", "thinking", "asking", "error"];

describe("слово у каждого состояния", () => {
  it("шесть состояний — шесть разных слов", () => {
    // Склеить «слушаю» и «разбираю» значит отнять у человека возможность понять,
    // что происходит: перебить словом можно только в первом.
    expect(allWordsDistinct()).toBe(true);
    expect(ALL.map((state) => MIC_WORD[state]).length).toBe(6);
  });

  it("«слушаю» значит именно слушаю", () => {
    // Только в этом состоянии приложение слышит. В остальных «услышат» было бы
    // неправдой.
    expect(hears("listening")).toBe(true);
    for (const state of ALL.filter((item) => item !== "listening")) {
      expect(hears(state)).toBe(false);
    }
  });

  it("в трее те же смыслы, но короче — и всё равно разные", () => {
    // Обрезка «услышал, разбираю» до «услышал» потеряла бы разницу с
    // «слушаю», и человек в трее видел бы одно и то же в двух состояниях.
    const words = Object.values(TRAY_WORD);
    expect(new Set(words).size).toBe(words.length);
    expect(TRAY_WORD.listening).toBe(MIC_WORD.listening);
  });

  it("каждое состояние объясняет, что это значит", () => {
    // «Состояние» без значения — это код, а не ответ человеку.
    for (const state of ALL) {
      const line = sayWord(state);
      expect(line.length).toBeGreaterThan(10);
    }
    expect(sayWord("closed")).toContain("не слышит");
    expect(sayWord("listening")).toContain("услышу");
  });

  it("выключенный микрофон — норма, а не ошибка", () => {
    // Иначе человек решит, что приложение сломалось, хотя он сам его выключил.
    expect(MIC_WORD.closed).toBe("не слушаю");
    expect(MIC_WORD.closed).not.toContain("ошиб");
    expect(MIC_WORD.error).not.toBe(MIC_WORD.closed);
  });
});
