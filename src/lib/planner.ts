/**
 * Зеркало поиска по реестру (`src-tauri/src/planner.rs`) для браузерного режима.
 *
 * В приложении фразу разбирает Rust — одно место, где это разрешено. Здесь правила
 * повторены дословно, чтобы экран «Спросить» верстался без ядра и показывал тот же
 * порядок и те же решения. Расхождение ловится тестом (`planner.test.ts`): те же
 * запросы обязаны давать те же первые строки реестра, что и в Rust-тестах модуля
 * `planner`.
 *
 * Правила намеренно простые и объяснимые:
 *  * слово значимо, если в нём ≥ 3 букв; ё считается за е;
 *  * слово запроса совпадает со словом строки, если одно является началом другого;
 *  * веса полей: объект 3, глагол 2, пример 1, домен 1;
 *  * без совпадения по объекту или глаголу строка не считается вовсе;
 *  * при равном счёте выполнимое действие идёт раньше, дальше — по ключу.
 */

import type { Action, Decision, PlanItem, Risk } from "../ipc";

const MIN_TERM = 3;
const WEIGHT_OBJECT = 3;
const WEIGHT_VERB = 2;
const WEIGHT_EXAMPLE = 1;
const WEIGHT_DOMAIN = 1;

export function terms(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/ё/g, "е")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => [...word].length >= MIN_TERM);
}

function matches(query: string, term: string): boolean {
  return term.startsWith(query) || query.startsWith(term);
}

function fieldScore(query: string[], text: string, weight: number): number {
  const words = terms(text);
  const hits = query.filter((needle) => words.some((word) => matches(needle, word))).length;
  return hits * weight;
}

/** Счёт строки реестра. Ноль — «не про это». */
export function score(query: string[], action: Action): number {
  if (query.length === 0) return 0;

  const object = fieldScore(query, action.object, WEIGHT_OBJECT);
  const verb = fieldScore(query, action.verb, WEIGHT_VERB);
  const example = fieldScore(query, action.example, WEIGHT_EXAMPLE);
  const domain = fieldScore(query, action.domain, WEIGHT_DOMAIN);

  // Совпадение только по примеру или домену слишком слабое.
  if (object === 0 && verb === 0) return 0;

  return object + verb + example + domain;
}

export interface PlanContext {
  actions: Action[];
  /** Ключи реестра, для которых уже есть «рука». */
  tools: ReadonlySet<string>;
  decide: (action: Pick<Action, "risk" | "status">) => Decision;
  reason: (decision: Decision, risk: Risk) => string;
}

export function plan(context: PlanContext, query: string, limit: number): PlanItem[] {
  const words = terms(query);
  if (words.length === 0 || limit <= 0) return [];

  // Строки со статусом `never` тоже участвуют: на просьбу оплатить счёт честный
  // ответ — «не делаю», а не «ничего не нашлось».
  return context.actions
    .map((action) => ({ action, score: score(words, action) }))
    .filter((row) => row.score > 0)
    .map((row) => {
      const key = `${row.action.domain}|${row.action.verb}|${row.action.object}`;
      const decision = context.decide(row.action);
      return {
        item: {
          key,
          example: row.action.example,
          risk: row.action.risk,
          decision,
          decision_reason: context.reason(decision, row.action.risk),
          needs_token: decision === "confirm",
          tool: context.tools.has(key) ? key : null,
          score: row.score,
        } satisfies PlanItem,
        executable: context.tools.has(key),
      };
    })
    .sort((left, right) => {
      if (left.item.score !== right.item.score) return right.item.score - left.item.score;
      if (left.executable !== right.executable) return left.executable ? -1 : 1;
      return left.item.key < right.item.key ? -1 : left.item.key > right.item.key ? 1 : 0;
    })
    .slice(0, limit)
    .map((row) => row.item);
}
