/**
 * Шаг 266: экспорт/импорт памяти в понятном файле.
 *
 * «Перенос на новый компьютер» звучит как «сохранить файл». Но файл — не
 * транзакция: человек откроет его блокнотом, чтобы понять, что там, а потом
 * понесёт на другой компьютер, где часть данных уже есть. И тогда решают три
 * вопроса, которых у простого `JSON.stringify` нет:
 *
 *  1. **что если файл писали руками.** Человек, открывший память блокнотом,
 *     может её поправить — и это законно. Но опечатка в дате или вид, которого
 *     не бывает, не должны попадать в память молча: файл проверяется, а
 *     непонятное **называется**, а не пропускается;
 *  2. **что если на новом компьютере уже есть память.** Нельзя «заменить»:
 *     замена стирает то, что человек успел наработать. И нельзя просто
 *     добавить: дубль удвоит `times`, и предпочтение станет «крепче», чем было.
 *     Слияние идёт **по факту**: то же самое не дублируется, но и не теряется;
 *  3. **что если в файле секрет.** Память не хранит паролей (шаг 269), но файл
 *     мог быть отредактирован вручную — или приехать с версии до правила.
 *     Поэтому импорт идёт **через ту же проверку**, что и запись.
 *
 * Формат — обычный JSON с версией и подписями полей по-русски: файл должен
 * читаться человеком, а не только программой.
 */

import { guard, allowed as kindAllowed, type Fact } from "./memoryGuard";
import { summary as exceptionsSummary, type Exception } from "./dontStore";
import type { Method } from "./methods";
import type { Preference } from "./preferences";

/** Что лежит в файле памяти. */
export interface Portable {
  /** Версия формата: без неё нельзя понять, как читать файл. */
  readonly version: 1;
  /** Когда выгружено — человеку, не программе. */
  readonly exportedAt: number;
  readonly preferences: readonly Preference[];
  /** Способы: `dayStart` у них уже с датой того компьютера, это нормально. */
  readonly methods: readonly Method[];
  /** Исключения «не запоминай это» (шаг 267): переезжают вместе с памятью. */
  readonly exceptions: readonly Exception[];
}

/**
 * Собрать файл.
 *
 * Секреты вычищаются **и здесь**: память могла быть записана до правила 269, и
 * выгрузка не должна стать способом вынести пароль с компьютера.
 */
export function exportFile(
  preferences: readonly Preference[],
  methods: readonly Method[],
  exceptions: readonly Exception[],
  now: number,
): { file: Portable; said: string; cleaned: number } {
  let cleaned = 0;
  const prefs: Preference[] = preferences.map((preference) => {
    const got = guard(preference);
    if (!got.secret) return preference;
    cleaned += 1;
    return { ...preference, value: got.fact.value };
  });

  const kept = prefs.filter((preference) => kindAllowed(preference.kind).ok);

  const file: Portable = {
    version: 1,
    exportedAt: now,
    preferences: kept,
    methods: methods.map((method) => ({ ...method })),
    exceptions: exceptions.map((exception) => ({ ...exception })),
  };

  const parts = [`${kept.length} ${plural(kept.length, "факт", "факта", "фактов")}`, `${methods.length} ${plural(methods.length, "способ", "способа", "способов")}`];
  if (exceptions.length > 0) parts.push(exceptionsSummary(exceptions));
  return {
    file,
    said: `выгружено: ${parts.join(", ")}${cleaned > 0 ? `; убрано секретов: ${cleaned}` : ""}`,
    cleaned,
  };
}

/** Слить два файла (или файл и текущую память) без потерь и без удвоения. */
export function merge(current: Portable, incoming: Portable): { file: Portable; said: string; added: number; same: number } {
  const prefs = new Map<string, Preference>();
  for (const preference of current.preferences) prefs.set(key(preference.kind, preference.value), preference);

  let added = 0;
  let same = 0;
  for (const preference of incoming.preferences) {
    const k = key(preference.kind, preference.value);
    const existing = prefs.get(k);
    if (existing === undefined) {
      prefs.set(k, preference);
      added += 1;
      continue;
    }
    same += 1;
    // Дубль не удваивает `times`: иначе перенос «закаляет» предпочтение,
    // которого человек не подтверждал на новом месте.
    prefs.set(k, {
      ...existing,
      times: Math.max(existing.times, preference.times),
      last: Math.max(existing.last, preference.last),
      // Причина — от той записи, что свежее: она про то же самое, но точнее.
      why: preference.last > existing.last ? preference.why : existing.why,
    });
  }

  const methods = new Map<string, Method>();
  for (const method of current.methods) methods.set(methodKey(method), method);
  for (const method of incoming.methods) {
    const k = methodKey(method);
    if (methods.has(k)) {
      same += 1;
      continue;
    }
    methods.set(k, method);
    added += 1;
  }

  // Исключения объединяются по паре «вид+значение»; при расхождении остаётся
  // более позднее — человек сказал это позже.
  const exceptions = new Map<string, Exception>();
  for (const exception of current.exceptions) exceptions.set(key(exception.kind, exception.value), exception);
  for (const exception of incoming.exceptions) {
    const k = key(exception.kind, exception.value);
    const existing = exceptions.get(k);
    if (existing === undefined || exception.at > existing.at) exceptions.set(k, exception);
  }

  return {
    file: {
      version: 1,
      exportedAt: current.exportedAt,
      preferences: [...prefs.values()],
      methods: [...methods.values()],
      exceptions: [...exceptions.values()],
    },
    said:
      added === 0
        ? `добавлять нечего: все ${same} ${plural(same, "факт уже был", "факта уже было", "фактов уже было")}`
        : `добавлено ${added}, уже было ${same}`,
    added,
    same,
  };
}

/** Разобранный файл: либо данные, либо причина, по которой читать нельзя. */
export type Read = { ok: true; file: Portable; said: string } | { ok: false; why: string };

/**
 * Прочитать файл, написанный человеком или программой.
 *
 * Молча пропускать непонятное нельзя: человек поправит файл, увидит «импорт
 * прошёл» и будет искать пропавшую папку. Поэтому непонятное **называется**, а
 * одна испорченная строка не отменяет остальные.
 */
export function read(text: string): Read {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, why: "файл не читается как JSON — возможно, он повреждён или это не файл памяти" };
  }
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, why: "в файле нет объекта памяти" };
  }

  const source = raw as Record<string, unknown>;
  if (source.version !== 1) {
    return { ok: false, why: `версия файла ${String(source.version)} не поддерживается этой версией приложения` };
  }

  const preferences: Preference[] = [];
  const methods: Method[] = [];
  const exceptions: Exception[] = [];
  const skipped: string[] = [];

  for (const item of list(source.preferences)) {
    const got = preference(item);
    if (typeof got === "string") skipped.push(got);
    else preferences.push(got);
  }
  for (const item of list(source.methods)) {
    const got = method(item);
    if (typeof got === "string") skipped.push(got);
    else methods.push(got);
  }
  for (const item of list(source.exceptions)) {
    const got = exceptionOf(item);
    if (typeof got === "string") skipped.push(got);
    else exceptions.push(got);
  }

  const total = preferences.length + methods.length + exceptions.length;
  if (total === 0) {
    // «Файл понятен: 0 записей» — это ложный успех: дальше импорт скажет
    // «добавлять нечего», и человек будет искать пропавшую папку в приложении,
    // хотя её не взяли из файла.
    return {
      ok: false,
      why:
        skipped.length === 0
          ? "файл памяти пуст — в нём нет ни фактов, ни способов"
          : `нечего импортировать: ни одна из ${skipped.length} ${plural(skipped.length, "записи", "записей", "записей")} не понята — ${skipped.slice(0, 3).join("; ")}`,
    };
  }

  return {
    ok: true,
    file: { version: 1, exportedAt: typeof source.exportedAt === "number" ? source.exportedAt : 0, preferences, methods, exceptions },
    said:
      skipped.length === 0
        ? `файл понятен: ${total} ${plural(total, "запись", "записи", "записей")}`
        : `файл понятен: ${total} ${plural(total, "запись", "записи", "записей")}, пропущено ${skipped.length} — ${skipped.slice(0, 3).join("; ")}${skipped.length > 3 ? "…" : ""}`,
  };
}

/**
 * Виды, которые эта версия умеет показывать.
 *
 * Не то же, что `NEVER` в `memoryGuard`: там «никогда не храним», здесь «умеем
 * обращаться». Файл с более новой версии может содержать вид, который для нас
 * просто неизвестен, и записать его значит хранить то, чего экран памяти не
 * покажет.
 */
const KNOWN: ReadonlySet<string> = new Set(["folder", "program", "voice", "volume"]);

/**
 * Итог импорта для человека.
 *
 * Импорт не «прошёл успешно», а говорит, что стало: сколько добавилось, что
 * уже было, что не взято и почему.
 */
export function report(got: { added: number; same: number }, skipped: readonly string[], cleaned: number): string {
  const parts: string[] = [];
  if (got.added > 0) parts.push(`добавлено ${got.added}`);
  if (got.same > 0) parts.push(`уже было ${got.same}`);
  if (skipped.length > 0) parts.push(`не взято ${skipped.length}: ${skipped.slice(0, 2).join("; ")}`);
  if (cleaned > 0) parts.push(`убрано секретов: ${cleaned}`);
  if (parts.length === 0) return "импортировать нечего: файл пуст";
  return `импорт: ${parts.join(", ")}`;
}

/**
 * Проверить чужой файл до импорта — так, как проверит запись.
 *
 * Отдельно от `read()`: читаемость и допустимость — разные вопросы. Файл может
 * быть понятным и содержать вид, которого в памяти быть не должно.
 */
export function inspect(file: Portable): { facts: Fact[]; rejected: string[]; cleaned: number } {
  const facts: Fact[] = [];
  const rejected: string[] = [];
  let cleaned = 0;

  for (const preference of file.preferences) {
    // Два разных отказа, и путать их нельзя: запрещённый вид (`password`) —
    // «так не храним никогда», а неизвестный (`sticker`) — «эта версия не знает,
    // что с ним делать»: файл мог приехать с более новой версии.
    if (!kindAllowed(preference.kind).ok) {
      rejected.push(`${preference.kind}: такой вид не хранится`);
      continue;
    }
    if (!KNOWN.has(preference.kind)) {
      rejected.push(`${preference.kind}: неизвестный вид — эта версия не знает, что с ним делать`);
      continue;
    }
    const got = guard(preference);
    if (got.secret) cleaned += 1;
    facts.push(got.fact);
  }
  for (const method of file.methods) {
    const got = guard({ kind: "method", value: method.said });
    if (got.secret) cleaned += 1;
    facts.push(got.fact);
  }
  return { facts, rejected, cleaned };
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function preference(item: unknown): Preference | string {
  if (typeof item !== "object" || item === null) return "предпочтение не объект";
  const row = item as Record<string, unknown>;
  const kind = row.kind;
  if (typeof kind !== "string" || kind === "") return "у предпочтения нет вида";
  if (typeof row.value !== "string" || row.value === "") return `у ${kind} нет значения`;
  if (typeof row.times !== "number" || !Number.isFinite(row.times) || row.times < 1) return `${kind} ${row.value}: число повторов не число`;
  if (typeof row.last !== "number" || !Number.isFinite(row.last) || row.last < 0) return `${kind} ${row.value}: дата не дата`;
  return {
    kind: kind as Preference["kind"],
    value: row.value,
    times: row.times,
    last: row.last,
    why: typeof row.why === "string" ? row.why : "",
  };
}

function method(item: unknown): Method | string {
  if (typeof item !== "object" || item === null) return "способ не объект";
  const row = item as Record<string, unknown>;
  if (typeof row.said !== "string" || row.said.trim() === "") return "у способа нет фразы, по которой его узнают";
  if (!Array.isArray(row.steps) || row.steps.length === 0) return `способ «${row.said}»: нет ни одного шага`;
  const params: Record<string, string> = {};
  if (typeof row.params === "object" && row.params !== null) {
    for (const [k, v] of Object.entries(row.params as Record<string, unknown>)) {
      if (typeof v === "string") params[k] = v;
    }
  }
  return {
    dayStart: typeof row.dayStart === "number" && Number.isFinite(row.dayStart) ? row.dayStart : 0,
    said: row.said,
    steps: row.steps.filter((step): step is string => typeof step === "string" && step !== ""),
    params,
  };
}

function exceptionOf(item: unknown): Exception | string {
  if (typeof item !== "object" || item === null) return "исключение не объект";
  const row = item as Record<string, unknown>;
  if (typeof row.kind !== "string" || row.kind === "") return "у исключения нет вида";
  if (typeof row.at !== "number" || !Number.isFinite(row.at) || row.at < 0) return `исключение ${row.kind}: дата не дата`;
  return {
    kind: row.kind,
    value: typeof row.value === "string" ? row.value : "",
    at: row.at,
    said: typeof row.said === "string" ? row.said : "",
  };
}

function key(kind: string, value: string): string {
  return `${kind}:${value}`;
}

function methodKey(method: Method): string {
  return `${method.said}|${method.steps.join("→")}`;
}

function plural(n: number, one: string, few: string, many: string): string {
  const ten = n % 100;
  if (ten >= 11 && ten <= 14) return many;
  const unit = n % 10;
  if (unit === 1) return one;
  if (unit >= 2 && unit <= 4) return few;
  return many;
}
