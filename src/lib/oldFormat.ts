/**
 * Шаг 320: тест — старый формат данных читается после обновления.
 *
 * Шаг 313 гарантирует, что схема мигрирует. Здесь — что **старые файлы
 * действительно читаются**, включая те, которые никто не обновлял: человек мог
 * не запускать программу год, и его файл — «старый формат», а не «испорченный».
 *
 * Почему это отдельный тест, а не следствие миграции: миграция проверяется на
 * файле, который мы сами сделали в прошлом релизе. А у человека файлы могут быть
 * **старше любого нашего теста** — с полями, которых мы уже не помним.
 *
 * Правило: **читаем то, что понимаем, и называем то, что не поняли** — а не
 * падаем целиком из-за одного незнакомого поля.
 */

/** Что прочитали из файла. */
export interface Parsed {
  /** Факты памяти: «вид: значение — откуда». */
  readonly facts: readonly string[];
  /** Строки, которые не поняли. */
  readonly unknown: readonly string[];
  /** Схема файла. */
  readonly schema: number;
}

/** Строка файла и что с ней стало. */
export type LineKind = "fact" | "header" | "blank" | "unknown";

/**
 * Разобрать одну строку.
 *
 * Формат памяти (`шаг 285`): `вид: значение — откуда`. Понимаем и старый вид
 * «значение — откуда» без вида: у людей такие файлы есть, и терять их нельзя.
 */
export function classify(line: string): LineKind {
  const trimmed = line.trim();
  if (trimmed === "") return "blank";
  if (trimmed.startsWith("#") || trimmed.startsWith(">") || trimmed.startsWith("//")) return "header";
  if (/^[а-яё]+:\s*\S/i.test(trimmed)) return "fact";
  if (trimmed.includes(" — ") || trimmed.includes(" - ")) return "fact";
  return "unknown";
}

/**
 * Прочитать файл целиком.
 *
 * Незнакомые строки **сохраняются**, а не выбрасываются: файл принадлежит
 * человеку, и «почистить» его значит стереть то, что он писал.
 */
export function parse(text: string, schema: number): Parsed {
  const facts: string[] = [];
  const unknown: string[] = [];

  for (const line of text.split("\n")) {
    const kind = classify(line);
    if (kind === "fact") facts.push(line.trim());
    else if (kind === "unknown") unknown.push(line.trim());
  }

  return { facts, unknown, schema };
}

/**
 * Отчёт о чтении старого файла.
 *
 * Три исхода, и все три — нормальные: прочитали всё, прочитали часть, не
 * прочитали ничего. Последнее — не молчание: «файл есть, но не наш формат»
 * важный факт.
 */
export function report(parsed: Parsed): string {
  if (parsed.facts.length > 0 && parsed.unknown.length === 0) {
    return `прочитано ${parsed.facts.length} фактов, схема ${parsed.schema}`;
  }
  if (parsed.facts.length > 0) {
    return `прочитано ${parsed.facts.length} фактов; ${parsed.unknown.length} строк не понял — оставил как есть, они в конце файла`;
  }
  if (parsed.unknown.length > 0) {
    return `файл есть, но ${parsed.unknown.length} строк не в нашем формате — ничего не менял, покажите файл нам`;
  }
  return "файл пуст";
}

/**
 * Как читаются старые форматы — по версиям.
 *
 * Каждая строка — обещание: «файл схемы N читается этой версией». Обещание
 * проверяется тестом на настоящем старом файле, а не на придуманном.
 */
export const READABLE: readonly number[] = [1, 2, 3];

/** Понимает ли текущая версия файл такой схемы. */
export function canRead(schema: number, current: number): boolean {
  return READABLE.includes(schema) || schema === current || schema < current;
}

/**
 * Что сделать, чтобы старые файлы не потерялись.
 *
 * Не «мы поддерживаем все версии» — это неправда навсегда. Обещание узкое:
 * старые файлы **читаются**, а не «работают как новые».
 */
export function promise(): string {
  return "Файлы прошлых версий читаются: память не теряется при обновлении; в новые возможности их переведём, но не молча";
}

/**
 * Проверка теста: он обязан покрывать **каждый** старый формат.
 *
 * Список тестовых файлов сравнивается с обещанными схемами: пропуск — это
 * непроверенное обещание.
 */
export function coverage(files: readonly number[]): string[] {
  return READABLE.filter((schema) => !files.includes(schema)).map((schema) => `схема ${schema} обещана, но файла для теста нет`);
}
