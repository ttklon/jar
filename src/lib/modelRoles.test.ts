import { describe, expect, it } from "vitest";
import {
  choose,
  CODE_MIN_MB,
  memoryMb,
  need,
  plan,
  roleWord,
  say,
  type Model,
} from "./modelRoles";

/**
 * Шаг 62: роль → модель, а не «одна на всё».
 *
 * Требования ролей враждебные: понять фразу — быстро и дешево, код — сложно и
 * точно. Одна модель посредственна во всём.
 */
const small: Model = { name: "0.5B", sizeMb: 400, code: false, embed: false };
const medium: Model = { name: "1.5B", sizeMb: 1100, code: false, embed: false };
const code: Model = { name: "3B", sizeMb: 2200, code: true, embed: false };
const big: Model = { name: "7B", sizeMb: 4600, code: true, embed: false };
const embed: Model = { name: "bge", sizeMb: 100, code: false, embed: true };
const all = [small, medium, code, big, embed];

describe("требования ролей разные и названы", () => {
  it("понять фразу — скорость, код и план — качество", () => {
    // Это причина выбора, а не украшение: видно, чем модель не подходит.
    expect(need("intent")).toBe("speed");
    expect(need("plan")).toBe("quality");
    expect(need("code")).toBe("quality");
    expect(need("chat")).toBe("balance");
    expect(need("embed")).toBe("meaning");
  });

  it("понять фразу берёт самую маленькую", () => {
    // Тысячи вызовов в день: большая модель здесь тратит секунды впустую, а
    // человек судит по первому ответу.
    expect(choose("intent", all).model?.name).toBe("0.5B");
  });

  it("код берёт самую сильную, которая умеет код", () => {
    // Ошибка дороже секунды; маленькая пишет неверное уверенно.
    expect(choose("code", all).model?.name).toBe("7B");
  });

  it("план не обязан уметь код, но берёт сильнейшую", () => {
    expect(choose("plan", all).model?.name).toBe("7B");
  });

  it("разговор — середина, а не крайности", () => {
    // Самая маленькая тупит в разговоре, самая большая заставляет ждать зря.
    const chosen = choose("chat", all).model;
    expect(chosen?.name).not.toBe("0.5B");
    expect(chosen?.name).not.toBe("7B");
  });

  it("поиск по смыслу — модель эмбеддингов, и хватает маленькой", () => {
    expect(choose("embed", all).model?.name).toBe("bge");
  });
});

describe("лучше «нечем», чем неподходящая", () => {
  it("для кода без модели от 3B — честный отказ", () => {
    // Взять модель поменьше и сделать вид, что всё хорошо, значит уверенно
    // написать неверный код.
    const choice = choose("code", [small, medium]);
    expect(choice.model).toBeNull();
    expect(choice.why).toContain(String(CODE_MIN_MB));
  });

  it("для смысла без модели эмбеддингов — отказ, а не генератор", () => {
    // Генератор не умеет эмбеддинги, и подменять одно другим нельзя.
    expect(choose("embed", [small, big]).model).toBeNull();
  });

  it("пустой список — не падение", () => {
    expect(choose("chat", []).model).toBeNull();
  });
});

describe("выбор объяснён человеку", () => {
  it("названа роль по-русски, модель и причина", () => {
    // «intent» в интерфейсе читается как сбой, а без причины разная скорость
    // выглядит как нестабильность.
    const said = say(plan(all));
    expect(said[0]).toContain("понять фразу");
    expect(said[0]).toContain("0.5B");
    expect(said[0]).toContain("скорость");
    expect(roleWord("code")).toBe("код");
  });

  it("план ролей покрывает все роли, и выбора хватает", () => {
    const choices = plan(all);
    expect(choices.length).toBe(5);
    expect(choices.every((choice) => choice.model !== null)).toBe(true);
  });
});

describe("память считается по выбранным, а не по всем", () => {
  it("одна и та же модель на две роли считается один раз", () => {
    // Человек решает, влезет ли это на его машину (шаг 61).
    const choices = plan([big]);
    expect(memoryMb(choices)).toBe(big.sizeMb);
  });

  it("разные модели складываются", () => {
    const choices = plan(all);
    // 0.5B (intent) + 1.5B (chat) + 7B (plan, code) + bge (embed)
    expect(memoryMb(choices)).toBe(400 + 1100 + 4600 + 100);
  });

  it("отказ не занимает памяти", () => {
    expect(memoryMb([{ role: "code", need: "quality", model: null, why: "нет" }])).toBe(0);
  });
});
