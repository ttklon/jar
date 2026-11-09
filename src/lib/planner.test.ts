import { describe, expect, it } from "vitest";
import actionsJson from "../../data/actions.json";
import toolsJson from "../../data/tools.json";
import type { Action } from "../ipc";
import { decide, decisionReason } from "./policy";
import { plan, terms } from "./planner";

/**
 * Контракт зеркала с Rust-планировщиком (`src-tauri/src/planner.rs`).
 *
 * Те же запросы обязаны давать те же первые строки реестра, что и в тестах модуля
 * `planner` в ядре. Если правила поиска поменяются в одном месте и не поменяются в
 * другом, эти тесты и тесты Rust разойдутся — это и есть страховка от двух правд.
 */

const ACTIONS = actionsJson as unknown as Action[];
const TOOLS: ReadonlySet<string> = new Set(
  (toolsJson as unknown as { registry: string }[]).map((spec) => spec.registry),
);

const find = (query: string, limit = 5) =>
  plan({ actions: ACTIONS, tools: TOOLS, decide, reason: decisionReason }, query, limit);

describe("поиск по реестру", () => {
  it("разбирает фразу на значимые слова", () => {
    const words = terms("Создай папку в Ёмкости!");
    expect(words).toContain("создай");
    expect(words).toContain("папку");
    expect(words).toContain("емкости");
    expect(words).not.toContain("в");
  });

  it("«создай папку» находит руку, которая это делает", () => {
    const [first] = find("создай папку");
    expect(first?.key).toBe("files|создать|папку");
    expect(first?.tool).toBe("files|создать|папку");
    expect(first?.needs_token).toBe(true);
  });

  it("про деньги строка находится, но выполнить её нельзя", () => {
    const money = find("оплати счёт", 20).find((item) => item.risk === "money");
    expect(money, "в реестре есть такая строка").toBeTruthy();
    expect(money?.decision).toBe("deny");
    expect(money?.tool).toBeNull();
  });

  it("бессмысленный запрос ничего не находит", () => {
    expect(find("   ")).toEqual([]);
    expect(find("квазар")).toEqual([]);
  });

  it("порядок детерминированный, лимит соблюдается", () => {
    const keys = find("проверить диск", 3).map((item) => item.key);
    expect(keys.length).toBeLessThanOrEqual(3);
    expect(find("проверить диск", 3).map((item) => item.key)).toEqual(keys);
  });

  it("при равном счёте выполнимое действие идёт раньше", () => {
    const rows = find("размеры папки", 10);
    for (let i = 1; i < rows.length; i += 1) {
      const left = rows[i - 1]!;
      const right = rows[i]!;
      if (left.score === right.score && right.tool !== null) {
        // Выполнимое не может стоять после невыполнимого с тем же счётом.
        expect(left.tool).not.toBeNull();
      }
    }
  });
});
