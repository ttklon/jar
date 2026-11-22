import { describe, expect, it } from "vitest";
import { add, continuationQuery, MAX_ITEMS, setState, trim, type QueueItem } from "./queue";

/**
 * Уборка очереди: N открытых-закрытых дел не должны растить память без предела.
 *
 * Проверяем не «функция вызвалась», а то, чем это ломается на практике: список
 * растёт от работы без человека, и каждое новое дело тащит за собой всю прежнюю
 * летопись — в память, в `localStorage` и в вопрос модели про продолжение.
 */

const goal = "навести порядок в загрузках";

const done = (id: number, origin?: string): QueueItem => ({
  id: `d${id}`,
  goal: `дело номер ${id}`,
  state: "done",
  note: "шагов: 1, всё выполнено",
  ...(origin ? { origin } : {}),
});

describe("уборка очереди", () => {
  it("готовых дел не больше предела, сколько бы их ни сделали", () => {
    let items: QueueItem[] = [];
    for (let index = 1; index <= MAX_ITEMS * 3; index += 1) {
      items = add(items, `дело номер ${index}`, `d${index}`, goal);
      // Через `setState`, как это делает экран: закрытие дела — такая же точка роста.
      items = setState(items, `d${index}`, "done", "шагов: 1, всё выполнено");
    }

    const ready = items.filter((item) => item.state === "done").length;
    expect(ready).toBeLessThanOrEqual(MAX_ITEMS);
    // Убираются самые старые: свежее дело — это отчёт о том, что было только что.
    expect(items.some((item) => item.id === `d${MAX_ITEMS * 3}`)).toBe(true);
    expect(items.some((item) => item.id === "d1")).toBe(false);
  });

  it("дело в работе и ждущее не считаются балластом", () => {
    const items: QueueItem[] = [
      ...Array.from({ length: MAX_ITEMS }, (_, index) => done(index + 1)),
      { id: "run", goal: "идёт", state: "running", note: "" },
      { id: "wait", goal: "ждёт", state: "waiting", note: "" },
    ];

    const kept = trim(items);

    // Убрали только готовые: дело в работе бросить нельзя, а ждущее — просьба человека.
    expect(kept.some((item) => item.id === "run")).toBe(true);
    expect(kept.some((item) => item.id === "wait")).toBe(true);
    expect(kept.filter((item) => item.state === "done").length).toBe(MAX_ITEMS);
  });

  it("неудавшиеся тоже убираются: провал — отчёт, а не долг", () => {
    const items: QueueItem[] = Array.from({ length: MAX_ITEMS + 5 }, (_, index) => ({
      id: `f${index}`,
      goal: `не вышло ${index}`,
      state: "failed" as const,
      note: "не вышло",
    }));

    expect(trim(items).length).toBe(MAX_ITEMS);
  });

  it("порядок не переставляется и вопрос модели не растёт", () => {
    const items: QueueItem[] = Array.from({ length: MAX_ITEMS }, (_, index) =>
      done(index + 1, goal),
    );
    items.push({ id: "run", goal: "идёт", state: "running", note: "", origin: goal });

    const kept = trim(items);

    // Порядок тот же: дело в работе осталось в конце, где и было.
    expect(kept[kept.length - 1]?.id).toBe("run");
    // Вопрос модели содержит не больше готовых дел, чем предел: иначе продолжение
    // цели упиралось бы в размер окна модели, а не в её понимание.
    const question = continuationQuery(goal, trim(items));
    expect(question.split("\n").filter((line) => line.startsWith("— ")).length).toBe(
      MAX_ITEMS,
    );
  });
});
