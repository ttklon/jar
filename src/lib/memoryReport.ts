/**
 * Шаг 278: отчёт «что память знает обо мне» одной страницей.
 *
 * Экран памяти (шаг 263) показывает список фактов и даёт удалить каждый. Это
 * правильно для **работы** с памятью, но не отвечает на вопрос, с которым
 * человек приходит, когда впервые задумывается о приватности: **что вы обо мне
 * знаете**. Список из сорока строк на него не отвечает: в нём видно каждую
 * строку и не видно **картины** — где меня больше всего, что вывело приложение
 * само, что приехало из другого компьютера.
 *
 * Отчёт — это не экран памяти, а его **сводка**, и у неё три свойства:
 *
 *  1. **одна страница.** Не «полный список» и не «нажмите, чтобы развернуть»:
 *     если для ответа надо листать, это не ответ. Полный список остаётся на
 *     экране памяти — но открывать его человек должен по своему решению;
 *  2. **сначала важное.** Что память знает **о нём** (имена, голоса, папки) —
 *     раньше, чем техническое (сколько способов, когда последняя запись);
 *  3. **сказано и то, чего нет.** «Паролей нет», «согласий нет», «ничего не
 *     уезжало» — не пустые строки, а факты: человек не должен гадать, потому что
 *     молчание одинаково похоже на «нет данных» и на «не проверяли».
 *
 * И ещё одно, менее очевидное: отчёт **не** содержит путей и имён целиком. Он
 * показывает, сколько и каких, и оставляет по одному примеру на вид. Иначе
 * «страница про приватность» становится вторым местом, где лежат все адреса, —
 * и уезжает в диагностику вместе с ними.
 */

import { CHANNELS, allows, type Book } from "./grants";
import { NEVER } from "./memoryGuard";
import { counts, type Sourced } from "./factOrigin";
import { KEEP } from "./deedMemory";

/** Что попадает в отчёт: одна строка на вид памяти. */
export interface Row {
  /** Название вида так, как его назвал бы человек. */
  readonly what: string;
  /** Сколько — числом, а не «несколько». */
  readonly many: number;
  /** Один пример, сокращённый: без полного пути. */
  readonly example: string;
  /** Откуда: слово человека, догадка или перенос. */
  readonly origin: string;
}

/** Отчёт целиком: строки и то, чего в памяти нет. */
export interface Report {
  readonly rows: readonly Row[];
  /** Что памяти **не** касается, но человек об этом спросит. */
  readonly absent: readonly string[];
  /** Готовая страница: заголовок и строки. */
  readonly page: string;
}

/**
 * Собрать отчёт.
 *
 * `facts` — факты с происхождением (шаг 273), `book` — согласия (шаг 40): отчёт
 * обязан сказать и про них, потому что «что вы обо мне знаете» включает «что вам
 * разрешено».
 */
export function build(facts: readonly Sourced[], book: Book, deeds: number, now: number): Report {
  const rows: Row[] = [];

  // Сначала люди и места: имена, голоса, папки — то, что человек считает «обо мне».
  const order: readonly { kind: string; what: string }[] = [
    { kind: "voice", what: "голоса" },
    { kind: "folder", what: "папки" },
    { kind: "program", what: "программы" },
    { kind: "volume", what: "громкость" },
    { kind: "method", what: "способы работы" },
  ];

  for (const { kind, what } of order) {
    const mine = facts.filter((fact) => fact.kind === kind);
    if (mine.length === 0) continue;
    rows.push({
      what,
      many: mine.length,
      example: example(mine[0]!),
      origin: counts(mine),
    });
  }

  const absent = [
    NEVER.map((word) => wordWord(word)).join(", ") + " — не хранятся вовсе",
    `намерения и планы — не запоминаются: ${KEEP} последних дел помнятся только как «что вышло»`,
    "согласия — не в памяти: они даются на показанный план и не переносятся",
  ];

  if (facts.length === 0) {
    absent.unshift("фактов нет: память пуста");
  }
  if (deeds === 0) {
    absent.push("дел не было: истории о делах нет");
  }

  const page = [
    "Что память знает обо мне",
    "",
    rows.length === 0
      ? "  • фактов нет — память пуста"
      : rows
          .map((row) => `  • ${row.what}: ${row.many} — например ${row.example} (${row.origin})`)
          .join("\n"),
    "",
    "Чего в памяти нет:",
    ...absent.map((line) => `  • ${line}`),
    "",
    `Согласия сейчас: ${CHANNELS.filter((channel) => allows(book, channel)).length} из ${CHANNELS.length} — они не часть памяти и спрашиваются отдельно`,
    `Дата отчёта: ${stamp(now)}`,
  ].join("\n");

  return { rows, absent, page };
}

/**
 * Пример значения — сокращённый.
 *
 * Отчёт читают, чтобы понять **вид** знания, а не переписать адреса. Поэтому путь
 * обрезается до первой части: `C:\\Users\\Иван\\Отчёты` → «C:\\Users\\…».
 */
export function example(fact: Sourced): string {
  if (fact.kind === "voice") return "имя голоса скрыто в отчёте";
  if (fact.kind === "volume") return fact.value;
  if (fact.kind === "method") return fact.value.slice(0, 20) + (fact.value.length > 20 ? "…" : "");
  const parts = fact.value.split(/[\\/]+/).filter((part) => part !== "");
  const first = parts[0] ?? "";
  if (parts.length <= 1) return fact.value;
  // Один обратный слэш, а не два: отчёт читает человек, и `C:\\…` выглядит как ошибка.
  return `${first}${first.includes(":") ? "\\" : "/"}…`;
}

function wordWord(word: string): string {
  if (word === "password") return "пароли";
  if (word === "token") return "токены";
  if (word === "api-key") return "ключи API";
  if (word === "secret") return "секретные слова";
  if (word === "card") return "данные карт";
  return word;
}

function stamp(now: number): string {
  const date = new Date(now);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}.${month}.${date.getFullYear()}`;
}
