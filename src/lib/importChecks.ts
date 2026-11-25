/**
 * Шаг 416: импорт проверяет формат и не перезаписывает молча.
 *
 * Файл профиля приносят извне: с флешки, из почты, из чужого экспорта. Значит, в
 * нём может быть что угодно — обрезанный JSON, чужой формат, новый файл с версией
 * из будущего, профиль с тем же именем, что уже есть.
 *
 * Четыре исхода, и все четыре — **громкие**:
 *
 *  * **можно** — формат верный, версия знакомая;
 *  * **нельзя и сказано почему** — «это не файл профиля» / «файл от новой версии»;
 *  * **можно, но с изменениями** — часть фактов отброшена, и какие именно;
 *  * **нельзя без выбора** — профиль с таким именем уже есть: что делать, решает
 *    человек, а не программа.
 *
 * Последнее — главное. «Импорт» не должен молча заменить существующего человека
 * другим: два разных «Анна» — это разные люди, и стереть одного ради другого
 * нельзя без вопроса.
 */

/** Что прочитали из файла. */
export interface Parsed {
  readonly name: string;
  readonly facts: readonly string[];
  readonly grants: readonly string[];
}

/** Исход разбора строки. */
export type Read =
  | { readonly ok: true; readonly got: Parsed; readonly dropped: string[]; readonly said: string }
  | { readonly ok: false; readonly why: string; readonly said: string };

/** Максимальный размер файла: профиль — не архив. */
export const LIMIT_BYTES = 1024 * 1024;

/**
 * Разобрать.
 *
 * Проверки идут от дешёвых к дорогим, и каждая называет свою причину: «файл
 * слишком большой» понятнее, чем «ошибка разбора».
 */
export function read(text: string): Read {
  if (text.length > LIMIT_BYTES) {
    return { ok: false, why: "too big", said: `файл больше ${Math.round(LIMIT_BYTES / 1024)} КБ: это не профиль, а что-то другое` };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, why: "not json", said: "файл не читается как JSON: возможно, он обрезан или это не профиль" };
  }

  if (typeof raw !== "object" || raw === null) {
    return { ok: false, why: "not object", said: "в файле не объект: это не профиль" };
  }

  const obj = raw as Record<string, unknown>;

  if (obj["версия"] === undefined && obj["version"] === undefined) {
    return { ok: false, why: "no version", said: "в файле нет версии формата: непонятно, как его читать — это не файл профиля ZShelper" };
  }

  const version = Number(obj["версия"] ?? obj["version"]);
  if (!Number.isFinite(version) || version < 1) {
    return { ok: false, why: "bad version", said: `версия «${String(obj["версия"] ?? obj["version"])}» не число: файл повреждён` };
  }
  if (version > 1) {
    return { ok: false, why: "future", said: `файл от новой версии (${version}): обновите программу, иначе часть данных потеряется молча` };
  }

  const name = typeof obj["имя"] === "string" ? obj["имя"].trim() : typeof obj["name"] === "string" ? obj["name"].trim() : "";
  if (name === "") return { ok: false, why: "no name", said: "у профиля нет имени: без него непонятно, чья это память" };

  const factsRaw = Array.isArray(obj["факты"]) ? obj["факты"] : Array.isArray(obj["facts"]) ? obj["facts"] : [];
  const dropped: string[] = [];
  const facts: string[] = [];
  for (const fact of factsRaw) {
    if (typeof fact === "string" && fact.trim() !== "") facts.push(fact.trim());
    else dropped.push(String(fact));
  }

  const grantsRaw = Array.isArray(obj["разрешения"]) ? obj["разрешения"] : Array.isArray(obj["grants"]) ? obj["grants"] : [];
  const grants: string[] = [];
  for (const grant of grantsRaw) {
    if (typeof grant === "string" && grant.trim() !== "") grants.push(grant.trim());
    else dropped.push(String(grant));
  }

  return {
    ok: true,
    got: { name, facts, grants },
    dropped,
    said:
      dropped.length === 0
        ? `файл прочитан: «${name}», ${facts.length} фактов, ${grants.length} разрешений`
        : `файл прочитан, но ${dropped.length} ${dropped.length === 1 ? "запись отброшена" : "записей отброшено"}: не текст`,
  };
}

/**
 * Что делать, если такой человек уже есть.
 *
 * Три варианта, и все три — действия человека: заменить, добавить рядом, отменить.
 * Молчаливого «сольём» нет: слияние двух «Анн» — это два человека в одном.
 */
export function conflict(name: string): { options: string[]; said: string } {
  return {
    options: ["заменить существующего", "добавить как второго человека", "отменить импорт"],
    said: `профиль «${name}» уже есть. Это вы, или второй человек с тем же именем? Импорт остановлен, пока не решите`,
  };
}

/**
 * Что импорт не делает.
 *
 * Три запрета, и первый — тот, ради которого шаг написан.
 */
export function notDo(): string[] {
  return [
    "не перезаписывает существующий профиль без выбора: два «Анна» — это два человека",
    "не «исправляет» файл молча: отброшенное называется числом и по возможности содержимым",
    "не принимает файл от новой версии: часть данных потерялась бы тихо",
  ];
}
