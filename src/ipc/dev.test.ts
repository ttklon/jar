import { describe, expect, it } from "vitest";
import { buildStats, registrySnapshot } from "./dev";
import { RISK_ORDER, STATUS_ORDER, TIER_ORDER } from "./types";

/**
 * Эти тесты — не про цифры «на сегодня» (они меняются с реестром), а про
 * инварианты: любой снапшот, который UI получает, должен быть внутренне
 * согласован. Если реестр разъедется, падает не «магическое число», а смысл.
 */
describe("registry snapshot", () => {
  it("счётчики покрывают весь реестр", async () => {
    const { actions, stats } = await registrySnapshot();
    expect(actions.length).toBeGreaterThan(0);

    const sum = (record: Record<string, number>) =>
      Object.values(record).reduce((total, value) => total + value, 0);

    expect(sum(stats.byRisk)).toBe(actions.length);
    expect(sum(stats.byTier)).toBe(actions.length);
    expect(sum(stats.byStatus)).toBe(actions.length);
    expect(stats.actions).toBe(actions.length);
    expect(stats.domains).toBe(new Set(actions.map((a) => a.domain)).size);
    expect(stats.verbs).toBe(new Set(actions.map((a) => a.verb)).size);
  });

  it("все значения попадают в известные перечисления", async () => {
    const { actions } = await registrySnapshot();
    const risks = new Set<string>(RISK_ORDER);
    const tiers = new Set<string>(TIER_ORDER);
    const statuses = new Set<string>(STATUS_ORDER);

    for (const action of actions) {
      expect(risks.has(action.risk), `risk ${action.risk} у ${action.id}`).toBe(true);
      expect(tiers.has(action.tier), `tier ${action.tier} у ${action.id}`).toBe(true);
      expect(statuses.has(action.status), `status ${action.status} у ${action.id}`).toBe(true);
    }
  });

  it("у каждого действия есть фраза и канал исполнения", async () => {
    const { actions } = await registrySnapshot();
    for (const action of actions) {
      expect(action.example.trim(), `пустой пример у ${action.id}`).not.toBe("");
      expect(action.implementation.length, `нет каналов у ${action.id}`).toBeGreaterThan(0);
      expect(action.domain).not.toBe("");
      expect(action.verb).not.toBe("");
      expect(action.object).not.toBe("");
    }
  });

  it("id и ключи domain|verb|object уникальны", async () => {
    const { actions } = await registrySnapshot();
    const ids = new Set<string>();
    const keys = new Set<string>();

    for (const action of actions) {
      expect(ids.has(action.id), `дубль id ${action.id}`).toBe(false);
      ids.add(action.id);

      const key = `${action.domain}|${action.verb}|${action.object}`;
      expect(keys.has(key), `дубль ключа ${key}`).toBe(false);
      keys.add(key);
    }
  });

  it("buildStats считает пустой реестр без падения", () => {
    const stats = buildStats([]);
    expect(stats.actions).toBe(0);
    expect(stats.domains).toBe(0);
    expect(stats.byRisk.read).toBe(0);
  });
});
