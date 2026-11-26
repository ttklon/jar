import { describe, expect, it } from "vitest";
import { all, awkward, check, checks, NEEDED, usual, type Faq } from "./faqTen";

/**
 * Шаг 470: FAQ — десять вопросов, которые задают на самом деле.
 */

describe("ровно десять и без повторов", () => {
  it("весь FAQ проходит проверку", () => {
    expect(all()).toHaveLength(NEEDED);
    expect(check(all())).toEqual([]);
  });

  it("недобор — назван числом", () => {
    expect(check(all().slice(0, 8)).join()).toContain("вопросов 8, а нужно ровно 10");
  });

  it("повтор — назван", () => {
    const faq = [...all()];
    faq[1] = faq[0]!;
    expect(check(faq).join()).toContain("повторяется");
  });
});

describe("ответ — прямой, а не история", () => {
  it("ответ с истории — замечание", () => {
    const faq: Faq[] = [{ q: "Он слушает?", a: "Когда-то давно мы решили, что микрофон будет открываться по клавише, и с тех пор так.", awkward: true }];
    expect(check(faq).join()).toContain("не с прямого ответа");
  });

  it("ответ короче вопроса — не ответ", () => {
    const faq: Faq[] = [{ q: "Он будет сам что-то делать без меня?", a: "Нет.", awkward: false }];
    expect(check(faq).join()).toContain("ответ короче вопроса");
  });
});

describe("неудобные вопросы обязательны", () => {
  it("три штуки, и все неприятные", () => {
    const got = awkward();
    expect(got).toHaveLength(3);
    expect(got.every((item) => item.awkward)).toBe(true);
  });

  it("про удаление — «может, поэтому и спрашивает»", () => {
    expect(awkward()[1]!.a).toContain("в корзину");
  });

  it("про интернет — «в журнале запрос наружу = дефект»", () => {
    expect(awkward()[2]!.a).toContain("дефект, а не функция");
  });

  it("семь обычных — ни одного неудобного", () => {
    expect(usual()).toHaveLength(7);
    expect(usual().some((item) => item.awkward)).toBe(false);
  });

  it("три проверки", () => {
    expect(checks()).toHaveLength(3);
  });
});
