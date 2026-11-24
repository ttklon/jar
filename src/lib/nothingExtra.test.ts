import { describe, expect, it } from "vitest";
import { appendEvent, readLog, type FirstRunEvent } from "./firstRunLog";

/**
 * Шаг 259: «не сделал ничего лишнего» — журнал содержит **ровно** ожидаемые шаги.
 *
 * Почему отдельный тест. Проверять «сделал нужное» мало: приложение может сделать
 * нужное **и заодно** лишнее — скачать вторую модель, дважды записать одно
 * событие, дёрнуть проверку, которую никто не просил. Такое не видно ни в
 * результате, ни в интерфейсе: только в журнале, и только если сравнивать
 * **точно**, а не «содержит».
 *
 * Правило: последовательность сравнивается целиком. Лишняя запись — провал, как и
 * пропущенная: обе значат, что шагов было не столько, сколько обещано.
 */

class Store {
  private data = new Map<string, string>();
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
}

function journal(events: FirstRunEvent[]): Store {
  const store = new Store();
  for (const event of events) appendEvent(event, store);
  return store;
}

/** Ровно ожидаемое, по порядку: ни лишнего, ни пропущенного. */
function exactly(store: Store, expected: FirstRunEvent[]) {
  expect(readLog(store)).toEqual(expected);
}

describe("ровно ожидаемые шаги", () => {
  it("первый запуск: проверка, загрузка, сверка — и ничего сверх", () => {
    const store = journal([
      { what: "checked", item: "движок", result: "absent" },
      { what: "downloaded", item: "движок" },
      { what: "verified", item: "движок", how: "hash" },
    ]);
    exactly(store, [
      { what: "checked", item: "движок", result: "absent" },
      { what: "downloaded", item: "движок" },
      { what: "verified", item: "движок", how: "hash" },
    ]);
  });

  it("лишняя запись — провал, а не «содержит нужное»", () => {
    // Так выглядит «сделал нужное и заодно лишнее»: в результате всё хорошо,
    // в журнале — вторая модель, которую никто не просил.
    const store = journal([
      { what: "downloaded", item: "модель" },
      { what: "downloaded", item: "движок" },
    ]);
    const expected: FirstRunEvent[] = [{ what: "downloaded", item: "модель" }];
    expect(readLog(store)).not.toEqual(expected);
    expect(readLog(store)).toHaveLength(2);
  });

  it("пропущенная запись — такой же провал, как лишняя", () => {
    const store = journal([{ what: "downloaded", item: "модель" }]);
    const expected: FirstRunEvent[] = [
      { what: "downloaded", item: "модель" },
      { what: "verified", item: "модель", how: "hash" },
    ];
    expect(readLog(store)).not.toEqual(expected);
  });

  it("порядок важен: сверка после загрузки, а не до", () => {
    const store = journal([
      { what: "verified", item: "модель", how: "hash" },
      { what: "downloaded", item: "модель" },
    ]);
    const right: FirstRunEvent[] = [
      { what: "downloaded", item: "модель" },
      { what: "verified", item: "модель", how: "hash" },
    ];
    expect(readLog(store)).not.toEqual(right);
  });
});

describe("одно и то же событие дважды — один факт", () => {
  it("повтор подряд не дублируется", () => {
    // Иначе «скачано: модель» дважды читается как две загрузки.
    const store = journal([
      { what: "downloaded", item: "модель" },
      { what: "downloaded", item: "модель" },
    ]);
    exactly(store, [{ what: "downloaded", item: "модель" }]);
  });

  it("но два разных события подряд — это два факта", () => {
    const store = journal([
      { what: "downloaded", item: "модель" },
      { what: "downloaded", item: "движок" },
    ]);
    expect(readLog(store)).toHaveLength(2);
  });
});

describe("журнал не растёт без предела", () => {
  it("сорок записей — предел, а не «сколько влезет»", () => {
    // Лишние записи в журнале первого запуска значат, что туда пишут не то.
    const store = new Store();
    for (let index = 0; index < 100; index += 1) {
      appendEvent({ what: "checked", item: `шаг-${index}`, result: "present" }, store);
    }
    expect(readLog(store).length).toBe(40);
  });
});

describe("ничего не сделано — пустой журнал, а не выдуманная запись", () => {
  it("без событий журнал пуст", () => {
    exactly(new Store(), []);
  });
});

describe("план не делает лишнего: ровно то, что нашлось по фразе", () => {
  it("шагов в плане столько же, сколько нашлось, и все — по фразе", async () => {
    // «Не сделал ничего лишнего» на уровне плана: если поиск нашёл три действия, в
    // плане не может быть четвёртого — оно появилось бы из воздуха.
    const { plan } = await import("./planner");
    const { decide, decisionReason } = await import("./policy");
    const { default: actionsJson } = await import("../../data/actions.json");
    const { default: toolsJson } = await import("../../data/tools.json");

    const actions = actionsJson as unknown as import("../ipc").Action[];
    const tools = new Set((toolsJson as { registry: string }[]).map((tool) => tool.registry));
    const context = { actions, tools, decide, reason: decisionReason };

    for (const query of ["создай папку Проект X", "сколько места на диске", "отправь письмо"]) {
      const found = plan(context, query, 8);
      // Каждый шаг плана — из найденного, а не добавленный сверх. `key` плана —
      // это `домен|глагол|объект` (так его понимает лист действий), а не `id`.
      for (const item of found) {
        expect(actions.some((row) => `${row.domain}|${row.verb}|${row.object}` === item.key)).toBe(true);
      }
      // И найденное не больше, чем просили.
      expect(found.length).toBeLessThanOrEqual(8);
    }
  });

  it("лимит соблюдается: «покажи всё» — не «покажи 835»", async () => {
    const { plan } = await import("./planner");
    const { decide, decisionReason } = await import("./policy");
    const { default: actionsJson } = await import("../../data/actions.json");
    const { default: toolsJson } = await import("../../data/tools.json");
    const context = {
      actions: actionsJson as unknown as import("../ipc").Action[],
      tools: new Set((toolsJson as { registry: string }[]).map((tool) => tool.registry)),
      decide,
      reason: decisionReason,
    };
    expect(plan(context, "", 3).length).toBeLessThanOrEqual(3);
  });
});
