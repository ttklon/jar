import { describe, expect, it } from "vitest";
import type { Action } from "../ipc";
import {
  filterByRisk,
  groupByDomain,
  highestRisk,
  plural,
  riskRank,
  searchActions,
} from "./registry";

function action(overrides: Partial<Action> & Pick<Action, "id">): Action {
  return {
    domain: "files",
    verb: "создать",
    object: "папку",
    example: "создай папку",
    implementation: ["fs.mkdir"],
    risk: "write-local",
    tier: "T0",
    human: "может",
    human_code: "c",
    status: "v1",
    notes: "",
    ...overrides,
  };
}

const ROWS: Action[] = [
  action({ id: "a1", example: "создай папку Проект", risk: "write-local" }),
  action({ id: "a2", domain: "files", verb: "удалить", object: "файл", example: "удали файл в корзину", risk: "destructive", implementation: ["fs.remove", "Shell.Recycle"] }),
  action({ id: "a3", domain: "web", verb: "открыть", object: "страницу", example: "открой страницу в браузере", risk: "read", implementation: ["browser.open"] }),
  action({ id: "a4", domain: "web", verb: "оплатить", object: "заказ", example: "оплати заказ", risk: "money", implementation: ["—"] }),
];

describe("riskRank", () => {
  it("деньги опаснее чтения", () => {
    expect(riskRank("money")).toBeGreaterThan(riskRank("read"));
    expect(riskRank("destructive")).toBeGreaterThan(riskRank("write-local"));
  });

  it("highestRisk берёт максимум по домену", () => {
    expect(highestRisk(ROWS.filter((r) => r.domain === "web"))).toBe("money");
    expect(highestRisk([])).toBe("read");
  });
});

describe("searchActions", () => {
  it("пустой запрос возвращает всё", () => {
    expect(searchActions(ROWS, "   ")).toHaveLength(ROWS.length);
  });

  it("ищет по фразе без учёта регистра", () => {
    expect(searchActions(ROWS, "ПАПКУ").map((r) => r.id)).toEqual(["a1"]);
  });

  it("ищет по каналу исполнения", () => {
    expect(searchActions(ROWS, "fs.remove").map((r) => r.id)).toEqual(["a2"]);
  });

  it("несколько слов — это И, а не ИЛИ", () => {
    expect(searchActions(ROWS, "удали файл").map((r) => r.id)).toEqual(["a2"]);
    expect(searchActions(ROWS, "удали папку")).toHaveLength(0);
  });
});

describe("filterByRisk", () => {
  it("пустой фильтр не фильтрует", () => {
    expect(filterByRisk(ROWS, [])).toHaveLength(ROWS.length);
  });

  it("оставляет только выбранные риски", () => {
    expect(filterByRisk(ROWS, ["read", "money"]).map((r) => r.id)).toEqual(["a3", "a4"]);
  });
});

describe("groupByDomain", () => {
  it("сумма групп равна числу действий", () => {
    const groups = groupByDomain(ROWS);
    expect(groups.reduce((n, g) => n + g.actions.length, 0)).toBe(ROWS.length);
  });

  it("сортирует по объёму, внутри домена — глаголы без повторов", () => {
    const groups = groupByDomain(ROWS);
    expect(groups[0]?.domain).toBe("files");
    expect(groups[0]?.verbs).toEqual(["создать", "удалить"]);
  });
});

describe("plural", () => {
  it("склоняет по-русски", () => {
    expect(plural(1, "действие", "действия", "действий")).toBe("действие");
    expect(plural(3, "действие", "действия", "действий")).toBe("действия");
    expect(plural(11, "действие", "действия", "действий")).toBe("действий");
    expect(plural(21, "действие", "действия", "действий")).toBe("действие");
    expect(plural(112, "действие", "действия", "действий")).toBe("действий");
  });
});
