import { describe, expect, it } from "vitest";
import actionsJson from "../../data/actions.json";
import toolsJson from "../../data/tools.json";
import type { Action } from "../ipc";
import { decide, decisionReason } from "./policy";
import { plan } from "./planner";
import {
  judge,
  meets,
  say,
  summary,
  THRESHOLD,
  worst,
  type Row,
} from "./parsing200";
import phrases from "../../tests/fixtures/phrases200.json";

/**
 * Шаг 100: 200 живых фраз, порог понятых ≥ 90%, отказы с причиной.
 *
 * До шага «разбор работает» проверялось ощущением: примеры из реестра проходили,
 * а живые фразы — нет, и никто не знал, сколько именно.
 */
const ACTIONS = actionsJson as unknown as Action[];
const TOOLS: ReadonlySet<string> = new Set(
  (toolsJson as unknown as { registry: string }[]).map((spec) => spec.registry),
);
const context = { actions: ACTIONS, tools: TOOLS, decide, reason: decisionReason };

const samples = phrases as { phrase: string; id: string }[];
// Домен берётся из **самого действия**, а не из префикса `id`: `music-production-787`
// — это домен `music-production`, и `id.split("-")[0]` дал бы `music`.
const DOMAIN = new Map(ACTIONS.map((action) => [action.id, action.domain]));

/** Прогон 200 фраз **настоящим** планировщиком, а не своим списком глаголов. */
const rows: Row[] = samples.map((sample) =>
  judge(
    sample.phrase,
    DOMAIN.get(sample.id) ?? "",
    plan(context, sample.phrase, 5).map((item) => item.key),
  ),
);
const got = summary(rows);

describe("двести живых фраз и настоящий планировщик", () => {
  it("фраз двести", () => {
    expect(rows).toHaveLength(200);
  });

  it("порог «понято» — обещание 90%, а не настройка", () => {
    expect(THRESHOLD).toBe(0.9);
  });

  it("найдено не меньше 90% — 183 из 200 (92%)", () => {
    // До шага найдено было 171 из 200 (85.5%) — ниже порога. Причина оказалась
    // настоящей: сравнение по началу слова не ловило **формы одного глагола**
    // («отправь» / «отправить»), и 29 живых фраз не находили ничего.
    const failed = meets(got);
    expect(failed, failed ?? "").toBeNull();
    expect(got.found).toBeGreaterThanOrEqual(183);
  });

  it("верное первым считается отдельно и выросло с 37 до 99", () => {
    // Без этого «183 из 200» звучит как успех, хотя верно было 37.
    expect(got.right).toBeGreaterThanOrEqual(99);
    expect(got.rightShare).toBeLessThanOrEqual(got.foundShare);
    expect(say(got)).toContain("верно с первой строки");
  });

  it("верное первым не закрывается порогом молча", () => {
    // Порог 90% на верность первым значит либо врать, либо выключить тест —
    // поэтому 99 из 200 названы, а не спрятаны за «порог пройден».
    expect(got.right).toBeLessThan(0.9 * got.total);
    expect(worst(rows).some((group) => group.reason === "верное не первым")).toBe(true);
  });
});

describe("отказы — с причиной, а не счётчиком", () => {
  it("у каждого отказа есть причина", () => {
    for (const row of got.misses) {
      expect(row.why.length, `«${row.phrase}» без причины`).toBeGreaterThan(5);
    }
  });

  it("вопрос назван вопросом, а не «нет совпадений»", () => {
    // Разные дефекты с разным лечением.
    const asked = rows.filter((row) => row.got === "nothing" && /^(что|как|почему|насколько|нет ли|не)\b/.test(row.phrase.trim().toLowerCase()));
    for (const row of asked.slice(0, 5)) {
      expect(row.why).toContain("вопрос");
    }
  });

  it("что чинить — по группам причин", () => {
    const top = worst(rows);
    expect(top.length).toBeGreaterThan(0);
    expect(top[0]?.times ?? 0).toBeGreaterThan(0);
    expect(top[0]?.reason.length).toBeGreaterThan(5);
  });
});

describe("судьба одной фразы", () => {
  it("ничего не нашлось — отказ с причиной", () => {
    const row = judge("ыыы", "files", []);
    expect(row.got).toBe("nothing");
    expect(row.why).toContain("нет совпадений");
  });

  it("нашлось из другого домена — «верное не первым»", () => {
    const row = judge("найди файл", "files", ["mail|найти|письмо"]);
    expect(row.got).toBe("wrong-first");
    expect(row.why).toContain("а просили files");
  });

  it("первая строка из нужного домена — понято", () => {
    const row = judge("найди файл", "files", ["files|найти|файл"]);
    expect(row.got).toBe("fits");
    expect(row.why).toBe("");
  });

  it("пустая фраза названа пустой, а не «не нашлось»", () => {
    expect(judge("", "files", []).why).toContain("пустая");
  });
});
