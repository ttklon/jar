/**
 * Очередь дел на диск: закрыл окно — не потерял дело.
 *
 * Зачем. Человек говорит «сделай это, это и это» и уходит. Очередь живёт в памяти
 * компонента, а компонент живёт, пока открыто окно; обновление, перезапуск или
 * закрытие окна стирали список, и дела исчезали без следа. Это противоречит
 * обещанию «второй друг»: он не должен забывать порученное от того, что окно
 * перерисовали.
 *
 * Четыре правила, и каждое — следствие того, как это ломается на практике:
 *
 *  * **пишем часто, но не на каждое событие.** Запись на каждое изменение — это
 *    десятки записей в секунду; пишем после паузы (`debounce`);
 *  * **читаем терпимо.** Битый или чужой JSON — это «очередь пуста», а не
 *    падение: терять окно из-за испорченного файла хуже, чем начать с пустой
 *    очереди;
 *  * **не сохраняем то, что нельзя продолжить.** Дела в состоянии `running` при
 *    перезапуске не «бегут» — процесс уже умер. Они возвращаются как `waiting`
 *    с честной пометкой, чтобы человек решал, а не думал, что работа идёт;
 *  * **`held` остаётся `held`.** «Нужно ваше слово» — не то же, что «ждёт
 *    очереди»: такие дела и не начинались.
 *
 * Здесь нет ни `window`, ни `localStorage`: хранилище передаётся снаружи. Поэтому
 * правила проверяются без браузера, а тест не полагается на состояние между
 * запусками.
 */

import type { QueueItem, QueueState } from "./queue";

/** Что нужно от хранилища. Совсем как `localStorage`, но без глобального объекта. */
export interface Store {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem?: (key: string) => void;
}

/** Имя ключа. С версией: формат может измениться, и старый файл не должен ломать новый. */
export const KEY = "zshelper.queue.v1";

/** Состояния, которые нельзя «продолжить» после перезапуска. */
const NOT_RESUMABLE: ReadonlySet<QueueState> = new Set<QueueState>(["running"]);

/** Записать очередь. Пустая очередь — это тоже состояние: её надо запомнить. */
export function save(store: Store, items: readonly QueueItem[]): void {
  try {
    store.setItem(KEY, JSON.stringify(items));
  } catch {
    // Место кончилось или хранилище запрещено: очередь продолжает жить в памяти.
    // Молча — потому что это не то, о чём человеку надо решать сейчас.
  }
}

/**
 * Прочитать очередь.
 *
 * Возвращает два ответа: что удалось спасти и сколько дел было в работе (их
 * надо назвать человеку — «это не продолжилось, а остановилось»).
 */
export function load(store: Store): { items: QueueItem[]; interrupted: number } {
  let raw: string | null = null;
  try {
    raw = store.getItem(KEY);
  } catch {
    return { items: [], interrupted: 0 };
  }
  if (!raw) return { items: [], interrupted: 0 };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Битый файл: честно начинаем с пустой очереди, а не падаем на старте.
    return { items: [], interrupted: 0 };
  }

  if (!Array.isArray(parsed)) return { items: [], interrupted: 0 };

  const items: QueueItem[] = [];
  let interrupted = 0;

  for (const entry of parsed) {
    const item = sanitize(entry);
    if (!item) continue;
    if (NOT_RESUMABLE.has(item.state)) {
      interrupted += 1;
      // Дело не «продолжается»: процесса уже нет. Ставим в ожидание и говорим.
      // Если известно, где остановились, — говорим это, а не «заново»: продолжение
      // с шага и начало заново — разные обещания, и путать их значит врать.
      items.push({
        ...item,
        state: "waiting",
        note:
          item.resumeAt === undefined
            ? "прервано перезапуском — продолжаю заново"
            : `прервано перезапуском — продолжаю с шага ${item.resumeAt}`,
      });
      continue;
    }
    items.push(item);
  }

  return { items, interrupted };
}

/** Один элемент: либо нормальное дело, либо `null`. Чужое не тащим в очередь. */
function sanitize(entry: unknown): QueueItem | null {
  if (typeof entry !== "object" || entry === null) return null;
  const raw = entry as Record<string, unknown>;

  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  const goal = typeof raw.goal === "string" ? raw.goal.trim() : "";
  // Без номера дело не найти, без слов — нечего делать.
  if (id.length === 0 || goal.length === 0) return null;

  const states: QueueState[] = ["waiting", "running", "done", "failed", "held", "stopped"];
  const state = states.includes(raw.state as QueueState) ? (raw.state as QueueState) : "waiting";

  const note = typeof raw.note === "string" ? raw.note : "";
  const origin = typeof raw.origin === "string" && raw.origin.trim() ? raw.origin.trim() : undefined;
  const touchesScreen = typeof raw.touchesScreen === "boolean" ? raw.touchesScreen : undefined;
  // Точка продолжения — только положительное целое. Ноль, дробь, строка и «-1» —
  // это не «шаг 0», это мусор; принимать его за точку продолжения значит однажды
  // продолжить с несуществующего шага.
  const resumeAt =
    typeof raw.resumeAt === "number" && Number.isInteger(raw.resumeAt) && raw.resumeAt > 0
      ? raw.resumeAt
      : undefined;

  return {
    id,
    goal,
    state,
    note,
    ...(origin ? { origin } : {}),
    ...(touchesScreen === undefined ? {} : { touchesScreen }),
    ...(resumeAt === undefined ? {} : { resumeAt }),
  };
}

/** Записать с паузой: последнее изменение за `wait` мс. */
export function createWriter(
  store: Store,
  wait = 400,
): { write: (items: readonly QueueItem[]) => void; flush: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: readonly QueueItem[] | null = null;

  const flush = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (pending !== null) {
      save(store, pending);
      pending = null;
    }
  };

  return {
    write(items: readonly QueueItem[]): void {
      pending = items;
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        flush();
      }, wait);
    },
    flush,
  };
}
