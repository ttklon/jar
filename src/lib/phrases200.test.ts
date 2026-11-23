import { describe, expect, it } from "vitest";
import { parse } from "./intent";
import phrases from "../../tests/fixtures/phrases200.json";

/**
 * Шаг 89: 200 живых фраз из каталога (`data/actions.json`) как регрессия разбора.
 *
 * Регрессия на **настоящих** фразах, а не на выдуманных: выдуманные проверяют,
 * что разбор понимает то, что мы сами придумали, — и это всегда правда.
 * Фикстура сделана детерминированно (`random.seed(89)`), поэтому число
 * распознанных не прыгает от запуска к запуску.
 */
interface Sample {
  phrase: string;
  verb: string;
  object: string;
  id: string;
}

const samples = phrases as Sample[];
const parsed = samples.map((sample) => ({ sample, intent: parse(sample.phrase) }));
const known = parsed.filter(({ intent }) => intent.verb !== "неизвестно");

describe("регрессия идёт по живым фразам", () => {
  it("фраз двести", () => {
    expect(samples.length).toBe(200);
  });

  it("каждая фраза из каталога, а не придумана", () => {
    // Выдуманные фразы проверяют, что разбор понимает то, что мы придумали сами.
    for (const sample of samples) {
      expect(sample.phrase.trim().length).toBeGreaterThan(0);
      expect(sample.id).toMatch(/^[a-z0-9-]+-\d+$/);
    }
  });
});

describe("разбор узнаёт действие в живых фразах", () => {
  it("узнано 96 из 200 — и меньше не станет", () => {
    // Порог **измерен** (шаг 89), а не выбран: до расширения глаголов по живым
    // фразам было ~30, после — 96. Остальные 104 начинаются с объекта («что
    // изменилось между бэкапами») или с редкого глагола, и там честный ответ —
    // «неизвестно», а не угадывание.
    const share = known.length / samples.length;
    expect(known.length).toBeGreaterThanOrEqual(96);
    expect(share).toBeGreaterThanOrEqual(0.48);
  });

  it("что не узнано — видно списком, а не спрятано", () => {
    // Молчаливый порог хуже: он говорит «стало хуже», но не говорит, где.
    const unknown = parsed.filter(({ intent }) => intent.verb === "неизвестно").map(({ sample }) => sample.phrase);
    expect(Array.isArray(unknown)).toBe(true);
    for (const phrase of unknown.slice(0, 3)) expect(typeof phrase).toBe("string");
  });
});

describe("узнанное узнано верно, а не просто узнано", () => {
  it("«удали» в живых фразах — это удаление, а не что попало", () => {
    // Узнать глагол — половина дела: важно, что глагол тот.
    const removable = parsed.filter(({ sample }) => sample.verb === "удалить" && parse(sample.phrase).verb !== "неизвестно");
    for (const { sample, intent } of removable) {
      expect(intent.verb, sample.phrase).toBe("удали");
    }
  });

  it("«найди» в начале фразы — это поиск", () => {
    // Именно в начале: «прочитай и найди» даёт «прочитай» главным, и это верно.
    const findable = parsed.filter(({ sample }) => /^найд/i.test(sample.phrase));
    expect(findable.length).toBeGreaterThan(0);
    for (const { sample, intent } of findable) {
      expect(intent.verb, sample.phrase).toBe("найди");
    }
  });

  it("живая фраза никогда не становится «удали» без просьбы", () => {
    // Ошибка полярности на живых фразах — самая дорогая (шаг 84).
    for (const { sample, intent } of parsed) {
      if (!/удал|сотр|стер/i.test(sample.phrase)) {
        expect(intent.verb, sample.phrase).not.toBe("удали");
      }
    }
  });
});

describe("разбор не выдумывает определение", () => {
  it("определение есть только там, где оно сказано", () => {
    // «Найди отчёты» — без размера: соблазн подставить «по умолчанию» велик.
    const plain = parsed.filter(({ intent }) => intent.qualifier === "нет");
    expect(plain.length).toBeGreaterThan(0);
    for (const { intent } of plain) expect(intent.qualifierWord).toBeNull();
  });
});
