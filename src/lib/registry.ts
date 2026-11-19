/**
 * Чистые функции над реестром: поиск, группировка, подписи.
 * Живут отдельно от компонентов, чтобы их можно было проверять тестами
 * и переиспользовать на разных экранах.
 */

import type { Action, Risk } from "../ipc";
import { RISK_ORDER } from "../ipc";

export interface DomainGroup {
  domain: string;
  actions: Action[];
  verbs: string[];
  highestRisk: Risk;
}

/** Риск выше — индекс больше. Используется для «самое опасное в домене». */
export function riskRank(risk: Risk): number {
  const index = RISK_ORDER.indexOf(risk);
  return index === -1 ? 0 : index;
}

export function highestRisk(rows: Action[]): Risk {
  return rows.reduce<Risk>(
    (worst, row) => (riskRank(row.risk) > riskRank(worst) ? row.risk : worst),
    "read",
  );
}

/**
 * Поиск по каталогу. Строка ищется в примере фразы, глаголе, объекте, домене и
 * каналах исполнения — то есть по тем полям, которые человек реально вспоминает.
 * Регистр не важен, лишние пробелы схлопываются.
 */
export function searchActions(rows: Action[], query: string): Action[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return rows;
  const words = needle.split(/\s+/).filter(Boolean);

  return rows.filter((row) => {
    const haystack = [
      row.example,
      row.verb,
      row.object,
      row.domain,
      row.implementation.join(" "),
    ]
      .join(" ")
      .toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}

export function filterByRisk(rows: Action[], risks: Risk[]): Action[] {
  if (risks.length === 0) return rows;
  const allowed = new Set(risks);
  return rows.filter((row) => allowed.has(row.risk));
}

export function groupByDomain(rows: Action[]): DomainGroup[] {
  const buckets = new Map<string, Action[]>();
  for (const row of rows) {
    const bucket = buckets.get(row.domain);
    if (bucket) bucket.push(row);
    else buckets.set(row.domain, [row]);
  }

  return [...buckets.entries()]
    .map(([domain, actions]) => ({
      domain,
      actions,
      verbs: [...new Set(actions.map((a) => a.verb))].sort((a, b) => a.localeCompare(b, "ru")),
      highestRisk: highestRisk(actions),
    }))
    .sort((a, b) => b.actions.length - a.actions.length || a.domain.localeCompare(b.domain, "ru"));
}

/** «1 действие / 2 действия / 5 действий» — без библиотек склонения. */
export function plural(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
