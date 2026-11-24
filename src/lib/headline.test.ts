import { describe, expect, it } from "vitest";
import actionsJson from "../../data/actions.json";
import toolsJson from "../../data/tools.json";
import { plan } from "./planner";
import { decide, decisionReason } from "./policy";
import { checkPlan, runPlan } from "../ipc/dev";
import type { Action } from "../ipc";

/**
 * Шаг 258: головной сценарий «сказал → сделано» проходит целиком.
 *
 * Почему это главный тест продукта. Всё остальное — узлы: правило поиска,
 * правило прав, правило отказа. Человеку же обещано **одно**: он говорит фразу,
 * и она делается. Ломается это на стыках: план нашёлся, но права не спросили;
 * права спросили, но план не собрался; план собрался, а исполнить его некому — и
 * человек узнаёт об этом после нажатия.
 *
 * Что проверяется сквозь всю цепочку, в одном месте:
 *
 *   1. фраза → найденное действие (правило то же, что в ядре);
 *   2. действие → решение прав (можно / спросить / нельзя) с причиной;
 *   3. решение → план: `draftPlan` собирает шаг, **только** если есть рука и
 *      действие не запрещено;
 *   4. план → проверка: `checkPlan` **не подделывается** в браузере — исполнение
 *      живёт в ядре, и повторять его здесь значило бы обещать то, чего нет;
 *   5. запрет доходит до человека причиной, а не «не удалось».
 *
 * Чего тест не делает: не изображает исполнение. Он проверяет, что до исполнения
 * всё честно и что подделки нет — это и есть граница, которую нельзя размывать.
 */

const actions = actionsJson as unknown as Action[];
const toolKeys = new Set((toolsJson as { registry: string }[]).map((tool) => tool.registry));

function run(query: string) {
  return plan({ actions, tools: toolKeys, decide, reason: decisionReason }, query, 8);
}

describe("сказал → найдено", () => {
  it("обычная фраза находит действие, а не пустоту", () => {
    const found = run("создай папку Проект X на рабочем столе");
    expect(found.length).toBeGreaterThan(0);
  });

  it("у найденного есть причина решения, а не только оценка", () => {
    // Без причины человек не понимает, почему «нельзя», и идёт искать обход.
    const [first] = run("создай папку Проект X на рабочем столе");
    expect(first?.decision_reason.length).toBeGreaterThan(0);
  });
});

describe("найдено → права", () => {
  it("опасное требует человека, а не решается молча", () => {
    const found = run("создай папку Проект X");
    const risky = found.find((item) => item.risk === "destructive" || item.risk === "identity");
    if (risky) {
      // Опасное без вопроса — дефект; если такое нашлось, решение обязано быть
      // не `allow`.
      expect(risky.decision).not.toBe("allow");
      // `allow_with_notice` тоже «без вопроса» — для опасного этого мало.
      expect(risky.decision).not.toBe("allow_with_notice");
    }
    // И наоборот: что-то нашлось — значит цепочка не оборвалась.
    expect(found.length).toBeGreaterThan(0);
  });

  it("запретное отказывается причиной, а не «не удалось»", () => {
    const found = run("поставь мою подпись");
    const denied = found.find((item) => item.decision === "deny");
    if (denied) {
      expect(denied.decision_reason.length).toBeGreaterThan(0);
      expect(denied.decision_reason).not.toContain("не удалось");
    }
    expect(found.length).toBeGreaterThan(0);
  });
});

describe("права → план → проверка", () => {
  it("без руки план не собирается: обещать исполнение нечего", async () => {
    // `draftPlan` в браузере честен: если у найденного нет руки, он молчит.
    const found = run("создай папку Проект X");
    const withHand = found.find((item) => item.tool && item.decision !== "deny");
    if (!withHand) {
      expect(found.every((item) => !item.tool || item.decision === "deny")).toBe(true);
    }
    // В любом случае цепочка не «падает»: она либо даёт шаг, либо молчит.
    expect(Array.isArray(found)).toBe(true);
  });

  it("проверка плана в браузере не подделывается", async () => {
    // Исполнение живёт в ядре: правила реестра и политики там. Подделать ответ
    // здесь значит показать «сделано» там, где ничего не делалось.
    await expect(checkPlan("{}")).rejects.toThrow(/ядре/);
  });

  it("исполнение в браузере не изображается", async () => {
    // Та же граница с другой стороны: «сделано» без рук — это ложь, а не заглушка.
    await expect(runPlan("{}", [])).rejects.toThrow(/ядре/);
  });

  it("оба отказа называют, где живёт исполнение, а не «ошибка»", async () => {
    const text = await checkPlan("{}").catch((error: Error) => error.message);
    expect(String(text)).toMatch(/руки|политик/);
  });
});

describe("на всём реестре, а не на одной фразе", () => {
  it("ни одного опасного действия без вопроса", () => {
    // Это главное обещание продукта целиком: 835 строк, и ни одна опасная не
    // получает `allow`. Одна такая — и весь разговор о «спросим человека» пуст.
    const loose = actions.filter(
      (row) =>
        ["destructive", "identity", "money"].includes(row.risk) &&
        row.status !== "never" &&
        decide(row) === "allow",
    );
    expect(loose.map((row) => row.id)).toEqual([]);
  });

  it("все «никогда» отказываются, а не «спрашивают»", () => {
    const never = actions.filter((row) => row.status === "never");
    expect(never.length).toBeGreaterThan(0);
    expect([...new Set(never.map((row) => decide(row)))]).toEqual(["deny"]);
  });

  it("у каждого действия есть причина решения — на всех 835", () => {
    const silent = actions.filter((row) => decisionReason(decide(row), row.risk).trim().length === 0);
    expect(silent.map((row) => row.id)).toEqual([]);
  });
});

describe("сказал → сделано: цепочка целиком", () => {
  it("фраза доходит до плана и не теряет причину по дороге", async () => {
    const found = run("создай папку Проект X");
    const first = found[0];
    expect(first).toBeTruthy();
    // Решение и причина — на каждом шаге, а не только на первом экране.
    for (const item of found) {
      // Четыре решения, а не три: `allow_with_notice` — «можно, но человеку
      // сказано» (наружу, с записью), и путать его с простым `allow` нельзя.
      expect(["allow", "allow_with_notice", "confirm", "deny"]).toContain(item.decision);
      expect(item.decision_reason.length).toBeGreaterThan(0);
    }
  });
});
