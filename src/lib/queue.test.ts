import { describe, expect, it } from "vitest";
import {
  add,
  markScreen,
  next,
  pick,
  setState,
  stopRemaining,
  summary,
  unattended,
  usesScreen,
  type QueueItem,
} from "./queue";
import type { PlanCheck } from "../ipc";

/**
 * Очередь решает, что делать дальше, и делает это по правилам, которые можно проверить
 * без машины, без окон и без человека.
 */

const budget = (over: Partial<{ parallel: number; mayStart: boolean; away: boolean }> = {}) => ({
  parallel: 3,
  mayStart: true,
  away: true,
  ...over,
});

const plan = (over: Partial<PlanCheck> = {}): PlanCheck => ({
  plan: { goal: "убавить громкость", steps: [{ registry: "звук|убавить|громкость", params: {} }] },
  problems: [],
  gates: [],
  questions: [],
  ...over,
});

describe("очередь дел", () => {
  it("пустое не дело: в очередь не попадает, а пробелы вокруг слов убираются", () => {
    let items: QueueItem[] = [];
    items = add(items, "   ", "1");
    expect(items).toHaveLength(0);

    items = add(items, "  убавить громкость  ", "1");
    expect(items[0]?.goal).toBe("убавить громкость");
    expect(items[0]?.state).toBe("waiting");
  });

  it("человек отошёл — очередь идёт сама, по одному в пределах бюджета", () => {
    const items = add(add([], "первое", "1"), "второе", "2");

    expect(next(items, budget()).index).toBe(0);

    // Первое уже идёт — при ширине один второе ждёт, и причина названа.
    const running = setState(items, "1", "running", "");
    const decision = next(running, budget({ parallel: 1 }));
    expect(decision.index).toBe(-1);
    expect(decision.reason).toContain("уже идёт 1 из 1");

    // Ширина три — второе можно брать.
    expect(next(running, budget({ parallel: 3 })).index).toBe(1);
  });

  it("человек вернулся — новые дела не начинаются, даже если бюджет велик", () => {
    const items = add([], "первое", "1");
    const decision = next(items, budget({ away: false }));

    expect(decision.index).toBe(-1);
    expect(decision.reason).toContain("чтобы не мешать");
  });

  it("память на исходе — очередь стоит, а не толкается", () => {
    const items = add([], "первое", "1");
    const decision = next(items, budget({ mayStart: false }));

    expect(decision.index).toBe(-1);
    expect(decision.reason).toContain("памяти на исходе");
  });

  it("«стоп» останавливает то, что не началось, и не врёт про начатое", () => {
    let items = add(add([], "первое", "1"), "второе", "2");
    items = setState(items, "1", "running", "");

    const stopped = stopRemaining(items);
    expect(stopped[0]?.state).toBe("running");
    expect(stopped[1]?.state).toBe("stopped");
    expect(stopped[1]?.note).toContain("не начиналось");
  });

  it("сводка считает по состояниям, а не по настроению", () => {
    let items = add(add(add([], "а", "1"), "б", "2"), "в", "3");
    items = setState(items, "1", "done", "два шага");
    items = setState(items, "2", "held", "нужно ваше слово");

    expect(summary(items)).toEqual({ waiting: 1, running: 0, done: 1, failed: 0, held: 1 });
  });
});

describe("сколько дел идёт сразу", () => {
  it("бюджет машины задаёт верхнюю границу, и он назван", () => {
    const items = add(add(add([], "а", "1"), "б", "2"), "в", "3");

    const picked = pick(items, budget({ parallel: 3 }));
    expect(picked.indices).toEqual([0, 1, 2]);
    expect(picked.reason).toContain("3 дела");

    expect(pick(items, budget({ parallel: 1 })).indices).toEqual([0]);
    expect(pick(items, budget({ parallel: 0 })).indices).toEqual([]);
  });

  it("два дела в одном окне одновременно — не скорость, а гонка: экранных не больше одного", () => {
    let items = add(add([], "убавить громкость", "1"), "нажать сохранить в Word", "2");
    items = markScreen(items, "2", true);

    // Первое окна не трогает — его можно, второе тоже: они не мешают друг другу.
    expect(pick(items, budget({ parallel: 3 })).indices).toEqual([0, 1]);

    // А два экранных дела — нет: второе ждёт, и причина названа.
    let two = add(add([], "нажать сохранить", "1"), "нажать удалить", "2");
    two = markScreen(markScreen(two, "1", true), "2", true);
    expect(pick(two, budget({ parallel: 3 })).indices).toEqual([0]);

    // Теперь одно уже идёт в окне — второе ждёт экрана, и очередь говорит об этом.
    const busy = setState(two, "1", "running", "");
    const waiting = pick(busy, budget({ parallel: 3 }));
    expect(waiting.indices).toEqual([]);
    expect(waiting.reason).toContain("ждут экрана");
  });

  it("человек за машиной или память на исходе — не начинается ничего", () => {
    const items = add([], "а", "1");
    expect(pick(items, budget({ away: false })).reason).toContain("чтобы не мешать");
    expect(pick(items, budget({ mayStart: false })).reason).toContain("памяти на исходе");
  });

  it("план узнаётся по шагам, а не по словам", () => {
    const press = {
      plan: {
        goal: "нажать",
        steps: [{ registry: "apps-windows|нажать|кнопку", params: {} }],
      },
      problems: [],
      gates: [],
      questions: [],
    };
    const read = {
      plan: {
        goal: "место",
        steps: [{ registry: "storage-backup|проверить|свободное место", params: {} }],
      },
      problems: [],
      gates: [],
      questions: [],
    };

    expect(usesScreen(press)).toBe(true);
    expect(usesScreen(read)).toBe(false);
    expect(usesScreen(null)).toBe(false);
  });
});

describe("что можно без человека", () => {
  it("простой план без подтверждений исполняется сам", () => {
    expect(unattended(plan()).can).toBe(true);
  });

  it("план, которому нужно подтверждение, ждёт человека", () => {
    const verdict = unattended(
      plan({
        gates: [
          {
            position: 1,
            registry: "файлы|удалить|папка",
            decision: "confirm",
            risk: "destructive",
            wants_approval: true,
          },
        ],
      }),
    );

    expect(verdict.can).toBe(false);
    expect(verdict.why).toContain("требует вашего подтверждения");
  });

  it("запрещённое политикой не исполняется даже в очереди", () => {
    const verdict = unattended(
      plan({
        gates: [
          {
            position: 2,
            registry: "деньги|перевести|счёт",
            decision: "deny",
            risk: "money",
            wants_approval: false,
          },
        ],
      }),
    );

    expect(verdict.can).toBe(false);
    expect(verdict.why).toContain("запрещён политикой");
  });

  it("вопрос без ответа — это «нужно ваше слово», а не догадка", () => {
    const verdict = unattended(
      plan({
        questions: [{ position: 1, name: "path", label: "какая папка", hint: "например, Загрузки" }],
      }),
    );

    expect(verdict.can).toBe(false);
    expect(verdict.why).toContain("какая папка");
  });

  it("сломанный план не исполняется вовсе", () => {
    const verdict = unattended(
      plan({ problems: [{ position: 1, registry: "звук|убавить|громкость", problem: "нет такого действия" }] }),
    );

    expect(verdict.can).toBe(false);
    expect(verdict.why).toContain("шаг 1");

    expect(unattended(null).can).toBe(false);
    expect(unattended({ ...plan(), plan: null }).can).toBe(false);
  });
});
