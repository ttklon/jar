import { describe, expect, it } from "vitest";
import { answer, askOf, cache, cacheable, fromRegistry, report } from "./registryCache";

/**
 * Шаг 127: частый ответ реестра не ждёт модель.
 *
 * «Что ты умеешь» шло к модели и ждало 3 с — хотя ответ уже был в реестре.
 */
const registry = { actions: 835, hands: 56, version: "v1" };

describe("частые вопросы узнаются, а не угадываются", () => {
  it("«что ты умеешь» — вопрос про умения", () => {
    expect(askOf("Что ты умеешь?")).toBe("skills");
    expect(askOf("что можешь")).toBe("skills");
  });

  it("«где данные» и «как дела» — свои вопросы", () => {
    expect(askOf("где мои данные")).toBe("data");
    expect(askOf("как дела")).toBe("health");
  });

  it("незнакомое не притворяется знакомым", () => {
    expect(askOf("переименуй все фото на диске")).toBe("other");
  });
});

describe("ответ из реестра — без модели и с числом", () => {
  it("«что умеешь» отвечается из реестра", () => {
    const store = cache("v1");
    const got = answer(store, "что ты умеешь", registry);
    expect(got.from).toBe("registry");
    expect(got.said).toContain("835");
  });

  it("сказано, откуда ответ: реестр — не «подумал»", () => {
    const got = answer(cache("v1"), "где данные", registry);
    expect(got.source).toBe("реестр v1");
  });
});

describe("промах не выдумывает ответ", () => {
  it("незнакомый вопрос идёт к модели", () => {
    const got = answer(cache("v1"), "переименуй фото", registry);
    expect(got.said).toBeNull();
    expect(got.from).toBe("model");
  });

  it("промах считается, а не прячется", () => {
    const store = cache("v1");
    answer(store, "переименуй фото", registry);
    expect(report(store)).toContain("к модели: 1");
  });
});

describe("реестр изменился — кэш сброшен", () => {
  it("устаревший ответ не отдаётся: он хуже медленного", () => {
    const store = cache("v1");
    answer(store, "что ты умеешь", registry);
    const newer = { ...registry, actions: 900, version: "v2" };
    const got = answer(store, "что ты умеешь", newer);
    expect(got.said).toContain("900");
    expect(got.source).toBe("реестр v2");
  });
});

describe("кэшируется только то, что не станет ложью", () => {
  it("«идёт работа» не кэшируется — ответ зависит от момента", () => {
    expect(cacheable("health")).toBe(false);
  });

  it("умения, данные и справка — кэшируются", () => {
    expect(cacheable("skills")).toBe(true);
    expect(cacheable("data")).toBe(true);
    expect(cacheable("help")).toBe(true);
  });

  it("пустой реестр не выдумывает действия", () => {
    const got = fromRegistry({ actions: 0, hands: 0, version: "v0" }, "skills");
    expect(got?.said).toContain("0 действий");
  });
});
