import { describe, expect, it } from "vitest";
import { byScoreOnly, PHRASES, ready, row, say, score, type Answer, type Side } from "./compare";

/**
 * Шаг 76: сравнение двух моделей на пяти своих фразах одной кнопкой.
 *
 * Чужие бенчмарки меряют чужое: чужие фразы, чужой язык, чужие задачи.
 */
const answer = (firstTokenMs: number): Answer => ({ text: "ответ", firstTokenMs, perSecond: 10 });
const side = (model: string, answers: (Answer | null)[]): Side => ({ model, answers });

describe("пять своих фраз", () => {
  it("меньше пяти — отказ с объяснением", () => {
    // На одной можно случайно попасть.
    const check = ready(["открой", "найди"]);
    expect(check.ok).toBe(false);
    expect(check.why).toContain(String(PHRASES));
    expect(check.why).toContain("случайно");
  });

  it("пять — можно", () => {
    expect(ready(["а", "б", "в", "г", "д"]).ok).toBe(true);
  });

  it("пустые фразы не считаются", () => {
    expect(ready(["а", "  ", "в", "", "д"]).ok).toBe(false);
  });

  it("пустой список говорит, чьи фразы нужны", () => {
    // Свои, а не примеры: модель может хорошо отвечать на чужие.
    expect(ready([]).why).toContain("своих");
  });

  it("больше пяти не отвергается — но сравнение идёт по пяти", () => {
    expect(ready(["а", "б", "в", "г", "д", "е"]).ok).toBe(true);
  });
});

describe("ответы рядом, и сбой — не «медленнее»", () => {
  it("обе ответили — разница в скорости", () => {
    expect(row(side("A", [answer(100)]), side("B", [answer(300)]), 0)).toBe("left");
    expect(row(side("A", [answer(300)]), side("B", [answer(100)]), 0)).toBe("right");
  });

  it("разница меньше 20% — шум, а не выигрыш", () => {
    // 1.02 против 1.05 не разница.
    expect(row(side("A", [answer(102)]), side("B", [answer(105)]), 0)).toBe("same");
  });

  it("сбой называется сбоем, а не скоростью", () => {
    // «Не справилась» и «медленнее» — разные вещи с разными следствиями.
    expect(row(side("A", [null]), side("B", [answer(100)]), 0)).toBe("left-failed");
    expect(row(side("A", [answer(100)]), side("B", [null]), 0)).toBe("right-failed");
    expect(row(side("A", [null]), side("B", [null]), 0)).toBe("both-failed");
  });
});

describe("итог — счёт, а не «в целом лучше»", () => {
  it("считаются выигранные фразы", () => {
    const left = side("A", [answer(100), answer(100), answer(500), answer(100), answer(100)]);
    const right = side("B", [answer(500), answer(500), answer(100), answer(100), answer(100)]);
    const got = score(left, right);
    expect(got.left).toBe(2);
    expect(got.right).toBe(1);
    expect(got.same).toBe(2);
  });

  it("сбои считаются отдельно", () => {
    const left = side("A", [null, answer(100)]);
    const right = side("B", [answer(100), null]);
    expect(score(left, right).failed).toBe(2);
  });

  it("сказано, что быстрее — не значит лучше", () => {
    // Выбор по счёту без чтения ответов — угадывание.
    const left = side("A", [answer(100)] as Answer[]);
    const right = side("B", [answer(500)] as Answer[]);
    const said = say(left, right);
    expect(said).toContain("быстрее");
    expect(said).toContain("не значит лучше");
  });

  it("сбой назван сбоем и в итоге", () => {
    const said = say(side("A", [null]), side("B", [answer(100)]));
    expect(said).toContain("сбой");
  });

  it("незаметная разница говорит: смотрите на ответы", () => {
    const said = say(side("A", [answer(100)]), side("B", [answer(101)]));
    expect(said).toContain("смотрите на ответы");
  });
});

describe("приложение не решает за человека", () => {
  it("выбор по счёту не предлагается", () => {
    // Автоматический выбор по «похожести на хороший ответ» — это угадывание.
    expect(byScoreOnly()).toBe(false);
  });
});
