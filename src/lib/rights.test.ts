import { describe, expect, it } from "vitest";
import actionsJson from "../../data/actions.json";
import { countWords, drift, neverDones, RULES, sheet, tally, type Row } from "./rights";

/**
 * Шаг 161: один список прав — из данных, а не из обещаний.
 *
 * Проверяется на настоящем реестре (835 действий), а не на выдуманных строках:
 * список, сверенный с копией данных, ничего не доказывает.
 */

const rows = actionsJson as unknown as Row[];

describe("«никогда» берётся из реестра", () => {
  it("в реестре 11 действий не делаем — и столько же в списке", () => {
    const never = neverDones(rows);
    expect(never).toHaveLength(11);
  });

  it("каждое «никогда» говорит, что вместо", () => {
    for (const item of neverDones(rows)) {
      expect(item.instead.length).toBeGreaterThan(10);
      expect(item.why.length).toBeGreaterThan(5);
    }
  });

  it("деньги — в списке и объяснены деньгами, а не общим «нельзя»", () => {
    const money = neverDones(rows).filter((item) => item.instead.includes("платить будете вы"));
    expect(money.length).toBeGreaterThanOrEqual(3);
    expect(money.map((item) => item.what)).toContain("купить билет");
    expect(money.map((item) => item.what)).toContain("оплатить счёт");
  });

  it("причина — из заметки реестра, а не выдумана заново", () => {
    const buy = neverDones(rows).find((item) => item.what === "купить билет");
    expect(buy?.why).toBe("только навигатор");
  });

  it("нет заметки — причина по риску, и список не пустует", () => {
    const got = neverDones([
      { id: "x", verb: "стереть", object: "диск", risk: "destructive", status: "never" },
    ]);
    expect(got[0]?.why).toContain("необратимое не делаем без слова человека");
  });

  it("статус v1 и v2 в «никогда» не попадают", () => {
    const got = neverDones([
      { id: "a", verb: "прочитать", object: "размер", risk: "read", status: "v1" },
      { id: "b", verb: "сжать", object: "папку", risk: "write-local", status: "v2" },
    ]);
    expect(got).toHaveLength(0);
  });
});

describe("счёт — числом", () => {
  it("на настоящем реестре: 626 готово, 198 в работе, 11 никогда", () => {
    const got = tally(rows);
    expect(got).toEqual({ ready: 626, planned: 198, never: 11, total: 835 });
  });

  it("словами, а не «много»", () => {
    expect(countWords({ ready: 626, planned: 198, never: 11, total: 835 })).toBe(
      "готово 626, в работе 198, не делаем никогда 11",
    );
  });
});

describe("правила, которые не про одно действие", () => {
  it("деньги не двигаются — это строка, а не вывод из таблицы", () => {
    expect(RULES.map((rule) => rule.what).join(" ")).toContain("не двигаю деньги");
  });

  it("у каждого правила есть место, где оно срабатывает", () => {
    for (const rule of RULES) {
      expect(rule.proof.length).toBeGreaterThan(10);
    }
  });
});

describe("список расходится с данными — это ловится", () => {
  it("пропавшее «никогда» названо", () => {
    const shown = neverDones(rows).map((item) => item.what).slice(1);
    const got = drift(shown, rows);
    expect(got).toHaveLength(1);
    expect(got[0]).toContain("в списке нет");
  });

  it("лишнее в списке названо: список не обещает больше данных", () => {
    const shown = [...neverDones(rows).map((item) => item.what), "стереть диск"];
    expect(drift(shown, rows)[0]).toContain("в списке лишнее");
  });

  it("сходится — молчит", () => {
    expect(drift(neverDones(rows).map((item) => item.what), rows)).toEqual([]);
  });
});

describe("лист целиком", () => {
  it("одно место: счёт, правила и «никогда»", () => {
    const got = sheet(rows);
    expect(got.count).toBe("готово 626, в работе 198, не делаем никогда 11");
    expect(got.rules.length).toBe(RULES.length);
    expect(got.never).toHaveLength(11);
  });
});
