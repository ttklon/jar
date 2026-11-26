/**
 * Шаг 441: трей — состояние, пауза, выход. И это понимает Windows-пользователь.
 *
 * Правила трея у Windows простые и жёсткие, и нарушение любого — это «приложение
 * мусорит в трее»:
 *
 *  * **пункты в привычном порядке**: открыть, пауза, выход — снизу;
 *  * **подсказка говорит состояние**, а не название: «идёт дело: уборка» лучше,
 *    чем «ZShelper — работает»;
 *  * **иконка отражает состояние** (идёт / ждёт / спит), а не просто «программа
 *    запущена»: иначе почему в трее, а не в окне;
 *  * **выход — с предупреждением, если идёт дело**, иначе оно оборвётся молча.
 */

/** Что происходит. */
export type State = "idle" | "running" | "waiting" | "paused" | "failed";

/** Пункт меню. */
export interface Item {
  readonly id: string;
  readonly label: string;
  /** Серым и неактивным — для «выход», когда идёт дело. */
  readonly enabled: boolean;
}

/**
 * Подсказка при наведении.
 *
 * Состояние и одно пояснение. Не «ZShelper»: имя и так видно.
 */
export function tooltip(state: State, what?: string): string {
  switch (state) {
    case "idle":
      return "ZShelper: жду вашу фразу";
    case "running":
      return `ZShelper: делаю «${what ?? "дело"}»`;
    case "waiting":
      return `ZShelper: ждёт вашего ответа${what ? ` — «${what}»` : ""}`;
    case "paused":
      return "ZShelper: на паузе";
    case "failed":
      return "ZShelper: последнее дело не получилось — откройте окно";
  }
}

/**
 * Меню.
 *
 * Порядок — привычный: действия, потом пауза, потом выход последним.
 */
export function menu(state: State): Item[] {
  const items: Item[] = [
    { id: "open", label: "Открыть ZShelper", enabled: true },
    { id: "talk", label: "Сказать фразу", enabled: state !== "paused" },
  ];

  if (state === "running" || state === "waiting") {
    items.push({ id: "now", label: "Что сейчас делаю", enabled: true });
  }

  items.push(
    state === "paused"
      ? { id: "resume", label: "Продолжить", enabled: true }
      : { id: "pause", label: "Пауза", enabled: true },
  );

  // «Выход» остаётся доступным, но с предупреждением — видно из `exitWarn`.
  items.push({ id: "quit", label: "Выход", enabled: true });

  return items;
}

/**
 * Предупреждение перед выходом.
 *
 * `null` — выходить можно молча. Не «Вы уверены?» на каждый выход.
 */
export function exitWarn(state: State, done: number, total: number): string | null {
  if (state !== "running" && state !== "waiting") return null;
  if (total === 0) return "идёт дело: если выйти, оно не закончится";
  return `идёт дело: выполнено ${done} из ${total} шагов. Если выйти, оно не закончится, а продолжить можно будет с этого шага`;
}

/**
 * Что иконка говорит без наведения.
 *
 * Четыре значка — не больше: больше человек не различает.
 */
export function icon(state: State): { mark: string; said: string } {
  const marks: Record<State, { mark: string; said: string }> = {
    idle: { mark: "○", said: "сплю: ничего не происходит" },
    running: { mark: "●", said: "работаю: идёт дело" },
    waiting: { mark: "!", said: "жду ответа: без вас дело стоит" },
    paused: { mark: "‖", said: "на паузе: дела не запускаются" },
    failed: { mark: "×", said: "был сбой: последнее дело не получилось" },
  };
  return marks[state];
}

/**
 * Что трей не делает.
 *
 * Три соблазна, каждая из которых ломает привычку Windows-пользователя.
 */
export function notDo(): string[] {
  return [
    "не выходит без предупреждения, когда идёт дело: работа обрывается молча",
    "не держит «выход» вверху меню: там его нажимают случайно",
    "не меняет порядок пунктов от состояния к состоянию: мышца помнит место",
  ];
}
