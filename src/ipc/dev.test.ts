import { describe, expect, it } from "vitest";
import {
  auditTail,
  buildStats,
  downloadModel,
  engineStatus,
  listFlows,
  listProfiles,
  listTools,
  listModels,
  listRoles,
  memoryRuns,
  assignRole,
  removeModel,
  startEngine,
  verifyModel,
  planFor,
  registrySnapshot,
} from "./dev";
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

describe("сценарии в браузере", () => {
  it("каждый шаг опирается на известный инструмент и на риск своего инструмента", async () => {
    const tools = await listTools();
    const byKey = new Map(tools.map((tool) => [tool.registry, tool]));

    const flows = await listFlows();
    expect(flows.length).toBeGreaterThan(0);

    for (const flow of flows) {
      expect(flow.steps.length).toBeGreaterThan(0);
      for (const step of flow.steps) {
        const tool = byKey.get(step.tool);
        expect(tool, `шаг ${step.tool} сценария ${flow.id}`).toBeTruthy();
        expect(step.risk).toBe(tool?.risk);
        expect(step.needs_token).toBe(tool?.needs_token);
      }

      // Риск сценария не может быть мягче самого опасного шага.
      const order = ["read", "write-local", "external", "destructive", "identity", "money"];
      const worst = flow.steps.reduce(
        (best, step) => (order.indexOf(step.risk) > order.indexOf(best) ? step.risk : best),
        "read" as (typeof order)[number],
      );
      expect(flow.risk).toBe(worst);
    }
  });

  it("исполнение сценария в браузере честно недоступно", async () => {
    const flows = await listFlows();
    const first = flows[0];
    expect(first).toBeTruthy();
    // Сценарий исполняется тем же runTool, что и одиночный инструмент.
    const { runTool } = await import("./dev");
    await expect(runTool(first?.steps[0]?.tool ?? "", {})).rejects.toThrow(/только в приложении/);
  });
});

describe("журнал в браузере", () => {
  it("возвращает пустой список, а не выдуманные события", async () => {
    await expect(auditTail(10)).resolves.toEqual([]);
  });
});

describe("профили приложений в браузере", () => {
  it("каждая операция разрешается в строку реестра и берёт риск оттуда", async () => {
    const { actions } = await registrySnapshot();
    const byKey = new Map(actions.map((a) => [`${a.domain}|${a.verb}|${a.object}`, a]));
    const tools = new Set((await listTools()).map((tool) => tool.registry));

    const profiles = await listProfiles();
    expect(profiles.length).toBeGreaterThan(0);

    for (const profile of profiles) {
      expect(profile.operations.length).toBeGreaterThan(0);
      let executable = 0;

      for (const operation of profile.operations) {
        const action = byKey.get(operation.resolved);
        expect(action, `${profile.slug}: ${operation.registry}`).toBeTruthy();
        // Профиль может быть осторожнее реестра, но не мягче: ранг не ниже.
        const rank = (risk: string) =>
          ["read", "write-local", "external", "destructive", "identity", "money"].indexOf(risk);
        expect(rank(operation.risk), `${profile.slug}: ${operation.registry}`).toBeGreaterThanOrEqual(
          rank(action?.risk ?? "read"),
        );
        if (operation.has_tool) executable += 1;
        if (operation.has_tool) expect(tools.has(operation.registry)).toBe(true);
      }

      expect(profile.executable).toBe(executable);
    }
  });
});

describe("память в браузере", () => {
  it("запусков нет — пустой список, и параметры не подставляются", async () => {
    await expect(memoryRuns(10)).resolves.toEqual([]);

    const tools = await listTools();
    expect(tools.length).toBeGreaterThan(0);
    for (const tool of tools) {
      expect(tool.last_params).toBeNull();
    }
  });
});

describe("поиск по реестру в браузере", () => {
  it("отвечает тем же, чем ответило бы ядро", async () => {
    const [first] = await planFor("создай папку", 5);
    expect(first?.key).toBe("files|создать|папку");
    expect(first?.tool).not.toBeNull();

    await expect(planFor("   ")).resolves.toEqual([]);
  });

  it("на отказ по деньгам отвечает отказом, а не пустотой", async () => {
    const money = (await planFor("оплати счёт", 20)).find((item) => item.risk === "money");
    expect(money?.decision).toBe("deny");
    expect(money?.tool).toBeNull();
  });
});

describe("роли в браузере", () => {
  it("требования ролей те же, что читает ядро", async () => {
    const roles = await listRoles();
    const ids = roles.map((role) => role.id);
    expect(ids).toContain("router");
    expect(ids).toContain("workhorse");
    expect(roles.every((role) => role.max_bytes > 0)).toBe(true);
    expect(roles.every((role) => role.assigned === null)).toBe(true);
  });

  it("назначение роли в браузере отказывает", async () => {
    await expect(assignRole("router", "m.gguf")).rejects.toThrow(/памяти/);
  });
});

describe("движок в браузере", () => {
  it("движка нет — и это честное «не найден», а не ошибка", async () => {
    const status = await engineStatus();
    expect(status.found).toBe(false);
    expect(status.running).toBe(false);
  });

  it("запуск движка в браузере отказывает", async () => {
    await expect(startEngine("m.gguf")).rejects.toThrow(/приложение/);
  });
});

describe("модели в браузере", () => {
  it("список пуст без ошибки: папку видит только приложение", async () => {
    const view = await listModels();
    expect(view.items).toEqual([]);
    expect(view.dir).toBe("");
    expect(view.error).toBeNull();
  });

  it("хеш не выдумывается: сверку делает только приложение", async () => {
    await expect(verifyModel("qwen3-1.7b.gguf")).rejects.toThrow(/приложение/);
  });

  it("удаление в браузере отказывает, а не делает вид", async () => {
    await expect(removeModel("m.gguf")).rejects.toThrow(/приложение/);
  });

  it("скачивание в браузере не притворяется успешным", async () => {
    await expect(downloadModel("https://example.com/m.gguf", "m.gguf")).rejects.toThrow(
      /приложение/,
    );
  });
});
