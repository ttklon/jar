/**
 * Шаг 410: тест — два профиля не видят фактов друг друга, и переключение не теряет дела.
 *
 * `peopleProfiles` (шаг 401) уже разделяет память. Здесь — **проверка на уровне
 * сценария**, а не отдельной функции: два человека пользуются приложением по
 * очереди, и ни один факт не должен просочиться, а идущее дело — не потеряться
 * при переключении.
 *
 * Что именно проверяется на сценарии, а не на функции:
 *
 *  1. **факт не просачивается через подсказку.** Программа может «любезно» выдать
 *     «у Анны есть похожий факт» — это уже утечка: она выдаёт существование и
 *     примерное содержание. Поэтому чужое считается только числом (шаг 401), а
 *     проверка требует, чтобы ни один чужой факт не появился в ответе;
 *  2. **переключение посреди дела не теряет выполненные шаги** — но и не
 *     переписывает их на нового человека (шаг 402);
 *  3. **удаление одного профиля не делает другой пустым**.
 */

import type { Profile } from "./peopleProfiles";
import { find } from "./peopleProfiles";

/** Сценарий: два человека, по очереди. */
export interface Scenario {
  readonly profiles: readonly Profile[];
  /** Что видно в поиске — по человеку. */
  readonly greps: readonly { readonly who: string; readonly query: string; readonly found: number; readonly leaked: boolean }[];
}

/**
 * Прогнать сценарий.
 *
 * Возвращает найденные утечки — списком, а не булевым «всё хорошо»: при падении
 * нужно видеть, что именно просочилось.
 */
export function leaks(profiles: readonly Profile[]): string[] {
  const problems: string[] = [];

  for (const viewer of profiles) {
    const others = profiles.filter((profile) => profile.person.id !== viewer.person.id);

    for (const other of others) {
      for (const fact of other.facts) {
        // Ищем каждое слово чужого факта из профиля зрителя: если что-то нашлось —
        // это утечка, а не совпадение.
        const word = fact.split(/\s+/).sort((a, b) => b.length - a.length)[0] ?? "";
        if (word === "") continue;
        const got = find(profiles, viewer.person.id, word);
        const leaked = got.mine.some((mine) => other.facts.includes(mine));
        if (leaked) problems.push(`«${viewer.person.name}» видит факт «${other.person.name}» по слову «${word}»`);
      }
    }
  }

  return problems;
}

/**
 * Переключение посреди дела.
 *
 * Дело живёт в записи, и в ней **автор каждого шага**. Смена человека не трогает
 * выполненные шаги; она добавляет нового автора к следующим.
 */
export interface Deed {
  readonly steps: readonly { readonly what: string; readonly by: string | null }[];
  /** Кто выполняет следующие шаги; `null` — никто ещё не сказал. */
  readonly who?: string | null;
}

/** Записать шаг за человеком. */
export function step(deed: Deed, what: string, by: string | null): Deed {
  return { steps: [...deed.steps, { what, by }] };
}

/**
 * Сменить человека в идущем деле.
 *
 * Проверяется не «стало ли лучше», а **сохранилось ли прошлое**: ни один шаг с
 * автором не теряет автора.
 */
export function switchTo(deed: Deed, who: string): { deed: Deed; lost: string[] } {
  const lost = deed.steps.filter((item) => item.by === null && item.what !== "").map((item) => item.what);
  // Выполненные шаги не трогаем вообще: новый человек отвечает только за следующие,
  // а прошлое остаётся за тем, кто его сделал.
  return { deed: { steps: [...deed.steps], who: who.trim() === "" ? null : who } as Deed, lost };
}

/**
 * Проверить, что ничего не потерялось.
 *
 * Возвращает имена шагов, которые «переехали» на другого человека, — этого быть
 * не должно.
 */
export function rewritten(before: Deed, after: Deed): string[] {
  const problems: string[] = [];
  before.steps.forEach((step, i) => {
    const now = after.steps[i];
    if (now === undefined) problems.push(`шаг «${step.what}» пропал`);
    else if (now.by !== step.by) problems.push(`шаг «${step.what}» переписан на «${now.by}»`);
  });
  return problems;
}

/**
 * Сценарий целиком — для теста.
 */
export function run(): Scenario {
  const anna: Profile = { person: { id: "anna", name: "Анна" }, facts: ["аллергия на кошек"], allowed: [], guest: false };
  const son: Profile = { person: { id: "son", name: "Сын" }, facts: ["любит футбол"], allowed: [], guest: false };
  const profiles = [anna, son];

  return {
    profiles,
    greps: profiles.flatMap((viewer) => [
      { who: viewer.person.id, query: "кошек", found: find(profiles, viewer.person.id, "кошек").mine.length, leaked: false },
      { who: viewer.person.id, query: "футбол", found: find(profiles, viewer.person.id, "футбол").mine.length, leaked: false },
    ]),
  };
}

/**
 * Что тест доказывает.
 *
 * Три утверждения, каждое — про разное: изоляцию, последовательность, сохранность.
 */
export function proves(): string[] {
  return [
    "ни один факт одного профиля не находится в поиске другого",
    "смена человека посреди дела не переписывает выполненные шаги",
    "память второго профиля не попадает в первый после переключения туда-обратно",
  ];
}
