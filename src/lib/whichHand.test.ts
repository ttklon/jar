import { describe, expect, it } from "vitest";
import { ASK, chosen, differs, go, need, question, type Option } from "./whichHand";

/**
 * Шаг 95: фраза похожа на две разные руки — спросить одним коротким вопросом.
 *
 * Сегодня неоднозначная фраза решается молча, порядком в списке.
 */
const option = (what: string, position: number, dangerous = false): Option => ({ what, position, dangerous });

describe("вопрос только там, где есть выбор", () => {
  it("два разных варианта — спросить", () => {
    const ask = need([option("очистить корзину", 0), option("найти крупные файлы", 1)]);
    expect(ask.ask).toBe(true);
    expect(ask.options).toHaveLength(2);
  });

  it("один вариант — не вопрос", () => {
    const ask = need([option("очистить корзину", 0)]);
    expect(ask.ask).toBe(false);
    expect(ask.why).toContain("подходит одно");
  });

  it("ничего не нашлось — не вопрос, а честное «не нашлось»", () => {
    expect(need([]).ask).toBe(false);
    expect(need([]).why).toContain("не нашлось");
  });

  it("два одинаковых по последствиям — не выбор, а шум", () => {
    // Вопрос о них — работа без пользы.
    const same = need([option("открыть папку", 0), option("открыть папку", 1)]);
    expect(same.ask).toBe(false);
    expect(same.why).toContain("выбирать не из чего");
  });

  it("опасный против безопасного — всегда выбор", () => {
    // Даже если «что» похоже: последствия разные.
    expect(differs([option("почистить", 0, true), option("почистить", 1, false)])).toBe(true);
  });
});

describe("вопрос короткий и из того, что нашлось", () => {
  it("варианты названы словами действий, а не реестра", () => {
    const said = question(need([option("очистить корзину", 0), option("найти крупные файлы", 1)]));
    expect(said).toContain("очистить корзину");
    expect(said).toContain("найти крупные файлы");
    expect(said).toContain("что именно");
  });

  it("больше трёх — показываем три и говорим, что есть ещё", () => {
    // Десять вариантов — это меню, а не вопрос.
    const many = need([
      option("а", 0),
      option("б", 1),
      option("в", 2),
      option("г", 3),
      option("д", 4),
    ]);
    expect(many.options).toHaveLength(ASK);
    expect(many.hidden).toBe(2);
    expect(question(many)).toContain("ещё 2");
  });

  it("опасный назван опасным в самом вопросе, а не после", () => {
    const said = question(need([option("удалить всё", 0, true), option("найти крупные", 1)]));
    expect(said).toContain("удалить всё (это необратимо)");
  });
});

describe("пока не отвечено — не исполняется", () => {
  it("без ответа нельзя", () => {
    // Молчаливо выбранный вариант — это выбор за человека.
    const ask = need([option("а", 0), option("б", 1)]);
    expect(go(ask, null)).toBe(false);
    expect(go(ask, 1)).toBe(true);
  });

  it("без вопроса — можно сразу", () => {
    expect(go(need([option("а", 0)]), null)).toBe(true);
  });

  it("после ответа названо, что выбрано, а не «начинаю»", () => {
    const ask = need([option("очистить корзину", 0, true), option("найти крупные файлы", 1)]);
    const said = chosen(ask, 0);
    expect(said).toContain("очистить корзину");
    expect(said).toContain("необратимо");
  });

  it("ответ не связался с вариантом — так и сказать", () => {
    const ask = need([option("а", 0), option("б", 1)]);
    expect(chosen(ask, 99)).toContain("не связался");
  });
});
