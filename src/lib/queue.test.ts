import { describe, expect, it } from "vitest";
import {
  add,
  continuationQuery,
  DEEDS_PER_HOUR,
  HOUR_MS,
  hourLeft,
  MAX_TRIES,
  markScreen,
  pick,
  progress,
  remove,
  replenish,
  retry,
  revive,
  rollHour,
  setState,
  startHour,
  stopGoal,
  stopRemaining,
  summary,
  takeDeed,
  phraseIsEnough,
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

/** Свежий час: тесты про ширину не должны упираться в потолок случайно. */
const freshHour = () => startHour(0);
const NOW = 1_000;

const plan = (over: Partial<PlanCheck> = {}): PlanCheck => ({
  plan: { goal: "убавить громкость", steps: [{ registry: "звук|убавить|громкость", params: {} }] },
  problems: [],
  gates: [],
  questions: [],
  ...over,
});

describe("очередь дел", () => {
  it("«нужно ваше слово» — не тупик: дело можно взять в руки или убрать", () => {
    let items = add([], "удалить папку", "1");
    items = setState(items, "1", "held", "шаг 1 требует подтверждения");

    // Взяли в руки: дело снова ждёт, а объяснение «нужно слово» не висит на нём.
    const revived = revive(items, "1");
    expect(revived[0]?.state).toBe("waiting");
    expect(revived[0]?.note).toBe("");
    // Чужое дело и уже начатое не трогаем.
    expect(revive(setState(items, "1", "running", "делаю"), "1")[0]?.state).toBe("running");
    expect(revive(items, "2")[0]?.state).toBe("held");

    // Убрать можно ждущее, отложенное и проваленное; отчёт и начатое — нет.
    expect(remove(items, "1")).toHaveLength(0);
    expect(remove(setState(items, "1", "running", "делаю"), "1")).toHaveLength(1);
    expect(remove(setState(items, "1", "done", "готово"), "1")).toHaveLength(1);
    expect(remove(add(items, "второе", "2"), "2")).toHaveLength(1);
  });

  it("пустое не дело: в очередь не попадает, а пробелы вокруг слов убираются", () => {
    let items: QueueItem[] = [];
    items = add(items, "   ", "1");
    expect(items).toHaveLength(0);

    items = add(items, "  убавить громкость  ", "1");
    expect(items[0]?.goal).toBe("убавить громкость");
    expect(items[0]?.state).toBe("waiting");
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
    // Шаг 137: движок делят только дела, которым он нужен; здесь дела без движка.
    let raw = add(add(add([], "а", "1"), "б", "2"), "в", "3");
    const items = raw.map((item) => ({ ...item, needsEngine: false }));

    const picked = pick(items, budget({ parallel: 3 }), freshHour(), NOW);
    expect(picked.indices).toEqual([0, 1, 2]);
    expect(picked.reason).toContain("3 дела");

    expect(pick(items, budget({ parallel: 1 }), freshHour(), NOW).indices).toEqual([0]);
    expect(pick(items, budget({ parallel: 0 }), freshHour(), NOW).indices).toEqual([]);
  });

  it("два дела в одном окне одновременно — не скорость, а гонка: экранных не больше одного", () => {
    let items = add(add([], "убавить громкость", "1"), "нажать сохранить в Word", "2");
    items = markScreen(items, "2", true);
    // Оба дела без движка (шаг 137): здесь проверяется экран, а не движок.
    items = items.map((item) => ({ ...item, needsEngine: false }));

    // Первое окна не трогает — его можно, второе тоже: они не мешают друг другу.
    expect(pick(items, budget({ parallel: 3 }), freshHour(), NOW).indices).toEqual([0, 1]);

    // А два экранных дела — нет: второе ждёт, и причина названа.
    let two = add(add([], "нажать сохранить", "1"), "нажать удалить", "2");
    two = markScreen(markScreen(two, "1", true), "2", true);
    expect(pick(two, budget({ parallel: 3 }), freshHour(), NOW).indices).toEqual([0]);

    // Теперь одно уже идёт в окне — второе ждёт экрана, и очередь говорит об этом.
    const busy = setState(two, "1", "running", "");
    const waiting = pick(busy, budget({ parallel: 3 }), freshHour(), NOW);
    expect(waiting.indices).toEqual([]);
    expect(waiting.reason).toContain("ждут экрана");
  });

  it("человек за машиной или память на исходе — не начинается ничего", () => {
    const items = add([], "а", "1");
    expect(pick(items, budget({ away: false }), freshHour(), NOW).reason).toContain("чтобы не мешать");
    expect(pick(items, budget({ mayStart: false }), freshHour(), NOW).reason).toContain("памяти на исходе");
  });

  it("потолок в час общий на всю очередь: широкий заход его не обходит", () => {
    // Пять дел и бюджет на три: без потолка очередь взяла бы три сразу. Но в этом часу
    // осталось одно дело — и очередь берёт одно, а не «три, раз бюджет позволяет».
    let items: QueueItem[] = [];
    for (const [goal, id] of [
      ["первое", "1"],
      ["второе", "2"],
      ["третье", "3"],
      ["четвёртое", "4"],
      ["пятое", "5"],
    ] as const) {
      items = add(items, goal, id);
    }

    let log = freshHour();
    for (let index = 0; index < DEEDS_PER_HOUR - 1; index += 1) log = takeDeed(log, NOW);

    const picked = pick(items, budget({ parallel: 3 }), log, NOW);
    expect(picked.indices).toHaveLength(1);
    expect(picked.reason).toContain("потолок");
    expect(picked.reason).toContain(String(DEEDS_PER_HOUR));

    // Счёт не делится по целям: две цели — тот же один свободный слот, а не по одному каждой.
    const twoGoals = add(add(items, "по другой цели", "6"), "и ещё", "7", "большая цель");
    expect(pick(twoGoals, budget({ parallel: 3 }), log, NOW).indices).toHaveLength(1);
  });

  it("потолок выбран — не начинается ничего, и причина говорит именно об этом", () => {
    // Дела без движка: здесь проверяется потолок, а не очередь за движком (137).
    const items = add(add([], "а", "1"), "б", "2").map((item) => ({ ...item, needsEngine: false }));
    let log = freshHour();
    for (let index = 0; index < DEEDS_PER_HOUR; index += 1) log = takeDeed(log, NOW);

    const picked = pick(items, budget({ parallel: 3 }), log, NOW);
    expect(picked.indices).toEqual([]);
    expect(picked.reason).toContain(`потолок ${DEEDS_PER_HOUR} дел в час`);

    // Новый час — потолок снова полный: ждать придётся не вечно, и это видно по счёту.
    expect(pick(items, budget({ parallel: 3 }), log, NOW + HOUR_MS).indices).toEqual([0, 1]);
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

  it("фразы хватает только когда каждый шаг явно разрешён", () => {
    expect(phraseIsEnough(plan())).toBe(false);
    expect(
      phraseIsEnough(
        plan({
          gates: [
            {
              position: 1,
              registry: "звук|убавить|громкость",
              decision: "allow",
              risk: "read",
              wants_approval: false,
            },
          ],
        }),
      ),
    ).toBe(true);
    expect(
      phraseIsEnough(
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
      ),
    ).toBe(false);
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

describe("самопополнение очереди", () => {
  const goal = "наведи порядок в загрузках";

  /**
   * Дело цели. Собираем литералом, а не через индексы массива: индекс без проверки —
   * это ещё одна догадка, а тест должен проверять правила, а не удачу.
   */
  const deed = (
    id: string,
    text: string,
    state: QueueItem["state"],
    note = "",
  ): QueueItem => ({ id, goal: text, state, note, origin: goal });

  /** Два дела одной цели, оба сделаны: ровно тот случай, когда пора спросить «что дальше». */
  const doneDeeds = (): QueueItem[] => [
    deed("1", "найди дубликаты в загрузках", "done", "шагов: 1, всё выполнено"),
    deed("2", "удали старые установщики", "done", "шагов: 1, всё выполнено"),
  ];

  it("все дела цели сделаны — можно спросить модель, что дальше", () => {
    const verdict = replenish(doneDeeds(), goal, startHour(0), 1_000);

    expect(verdict.ask).toBe(true);
    expect(verdict.why).toContain("не закрыта");
  });

  it("пока по цели есть ждущее дело — новых не придумываем", () => {
    const items = [deed("1", "найди дубликаты в загрузках", "done"), deed("2", "удали старые установщики", "waiting")];

    expect(replenish(items, goal, startHour(0), 1_000).ask).toBe(false);
  });

  it("дело не сделалось — это не повод придумывать новые, а повод сказать", () => {
    const items = [
      deed("1", "найди дубликаты в загрузках", "done"),
      deed("2", "удали старые установщики", "failed", "шаг 1: нет доступа"),
    ];

    const verdict = replenish(items, goal, startHour(0), 1_000);

    expect(verdict.ask).toBe(false);
    expect(verdict.why).toContain("не сделалось");
    expect(verdict.why).toContain("удали старые установщики");
  });

  it("остановили — новых дел по этой цели не будет", () => {
    const items = [
      deed("1", "найди дубликаты в загрузках", "done"),
      deed("2", "удали старые установщики", "stopped", "остановлено вами"),
    ];

    const verdict = replenish(items, goal, startHour(0), 1_000);

    expect(verdict.ask).toBe(false);
    expect(verdict.why).toContain("остановили");
  });

  it("потолок в час: больше сам не начинаю, и это сказано словами", () => {
    let log = startHour(0);
    for (let index = 0; index < DEEDS_PER_HOUR; index += 1) log = takeDeed(log, 1_000);

    expect(hourLeft(log, 1_000)).toBe(0);

    const verdict = replenish(doneDeeds(), goal, log, 1_000);
    expect(verdict.ask).toBe(false);
    expect(verdict.why).toContain("потолок");
    expect(verdict.why).toContain(String(DEEDS_PER_HOUR));

    // Час прошёл — счёт новый. Потолок ограничивает час, а не работу вообще.
    expect(hourLeft(log, HOUR_MS + 1)).toBe(DEEDS_PER_HOUR);
    expect(replenish(doneDeeds(), goal, log, HOUR_MS + 1).ask).toBe(true);
  });

  it("счёт дел за час не сбрасывается раньше срока", () => {
    let log = startHour(0);
    log = takeDeed(log, 1);
    log = takeDeed(log, 2);

    expect(log.deeds).toBe(2);
    expect(hourLeft(log, HOUR_MS - 1)).toBe(DEEDS_PER_HOUR - 2);

    const rolled = rollHour(log, HOUR_MS);
    expect(rolled.deeds).toBe(0);
    expect(rolled.since).toBe(HOUR_MS);
  });

  it("вопрос модели — про ту же цель и с тем, что уже было", () => {
    const items = [
      deed("1", "найди дубликаты в загрузках", "done"),
      deed("2", "удали старые установщики", "failed", "шаг 1: нет доступа"),
    ];

    const query = continuationQuery(goal, items);

    expect(query).toContain(goal);
    expect(query).toContain("найди дубликаты в загрузках: сделано");
    expect(query).toContain("удали старые установщики: не вышло (шаг 1: нет доступа)");
    expect(query).toContain("Одно-три следующих дела");
  });

  it("счёт по цели: сделано, впереди и встало — разные числа", () => {
    const items = [
      deed("1", "первое", "done"),
      deed("2", "второе", "held"),
      deed("3", "третье", "waiting"),
    ];

    expect(progress(items, goal)).toEqual({ goal, done: 1, left: 1, stuck: 1 });
  });
});

describe("повтор, когда ничего не сделалось", () => {
  it("сделано — повторять нечего", () => {
    const verdict = retry({ completed: 2, stopped: null }, 1);

    expect(verdict.again).toBe(false);
    expect(verdict.why).toContain("сделано");
  });

  it("хоть что-то сделано — второй раз нельзя: сделает дважды", () => {
    const verdict = retry({ completed: 1, stopped: "шаг 2: нет доступа" }, 1);

    expect(verdict.again).toBe(false);
    expect(verdict.why).toContain("1 шаг уже сделано");
    expect(verdict.why).toContain("дважды");
  });

  it("ничего не сделалось — одна повторная попытка, и она названа", () => {
    const verdict = retry({ completed: 0, stopped: "шаг 1: окно не открылось" }, 1);

    expect(verdict.again).toBe(true);
    expect(verdict.why).toContain("шаг 1: окно не открылось");
    expect(verdict.why).toContain(`попытка 2 из ${MAX_TRIES}`);
  });

  it("две пустые попытки — хватит: это уже долбёжка", () => {
    const verdict = retry({ completed: 0, stopped: "шаг 1: нет доступа" }, MAX_TRIES);

    expect(verdict.again).toBe(false);
    expect(verdict.why).toContain("больше не пробую");
  });
});

describe("стоп по одной цели", () => {
  const goal = "наведи порядок в загрузках";
  const deed = (id: string, text: string, state: QueueItem["state"], origin?: string): QueueItem => ({
    id,
    goal: text,
    state,
    note: "",
    ...(origin ? { origin } : {}),
  });

  it("останавливает только ждущие дела этой цели, остальные работы не трогает", () => {
    const items = [
      deed("1", "найди дубликаты", "waiting", goal),
      deed("2", "удали установщики", "running", goal),
      deed("3", "убавить громкость", "waiting"),
    ];

    const stopped = stopGoal(items, goal);

    expect(stopped[0]?.state).toBe("stopped");
    expect(stopped[0]?.note).toContain("остановлено вами");
    // Начатое не трогаем: его доводят до шага, где можно бросить.
    expect(stopped[1]?.state).toBe("running");
    // Чужая работа продолжается: бросить всё из-за одной цели — не остановка, а паника.
    expect(stopped[2]?.state).toBe("waiting");
  });

  it("сделанное не переписывается в «остановлено»", () => {
    const items = [deed("1", "найди дубликаты", "done", goal)];

    expect(stopGoal(items, goal)[0]?.state).toBe("done");
  });


  it("повтор не рождает новый номер: история не рвётся (шаг 158)", () => {
    // Повтор живёт **внутри** того же дела: экран меняет состояние по `item.id`,
    // а не добавляет новое. Проверяем сам инвариант очереди — что повтор не
    // создаёт второй экземпляр с другим номером.
    const first = add([], "удали временные файлы", "d-1");
    expect(first).toHaveLength(1);
    expect(first[0]?.id).toBe("d-1");

    // После сбоя дело помечается неудачей, но номер у него прежний.
    const failed = setState(first, "d-1", "failed", "ядро упало");
    expect(failed[0]?.id).toBe("d-1");
    // И повторное добавление того же текста новым номером создало бы два дела,
    // связанных только словами, — поэтому повтор делается не через `add`.
    expect(failed).toHaveLength(1);
  });
});
