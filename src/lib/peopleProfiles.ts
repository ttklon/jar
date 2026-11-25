/**
 * Шаг 401: профили людей — у каждого своя память и свои разрешения.
 *
 * За одним компьютером не всегда один человек. Раньше память была одна: мама
 * сказала «у меня аллергия на кошек» — и через месяц приложение считает это
 * фактом про всех, включая сына-гостя. А разрешение «удалять файлы», данное
 * одним человеком, работает и для другого — то есть чужое согласие считается
 * моим.
 *
 * Два правила, из которых всё остальное следует:
 *
 *  1. **память отдельного человека не видна другому** — не «помечена как его», а
 *     физически в другом списке: поиск в чужой памяти не должен её находить;
 *  2. **разрешения тоже по человеку** — «можно удалять» это согласие человека, а
 *     не свойство компьютера.
 *
 * Что НЕ разделяется: настройки самой программы, скачанная модель, расписания
 * общих задач. Это про машину, а не про человека. Иначе новый профиль заставит
 * скачивать модель заново — и человек не станет заводить профиль.
 */

import type { Risk } from "./dangerPolicy";

/** Человек. */
export interface Person {
  readonly id: string;
  readonly name: string;
}

/** Профиль целиком. */
export interface Profile {
  readonly person: Person;
  /** Факты памяти — только его. */
  readonly facts: readonly string[];
  /** Что ему разрешено автоматически. */
  readonly allowed: readonly Risk[];
  /** Гость: безопасные руки и ничего больше. */
  readonly guest: boolean;
}

/**
 * Профиль по умолчанию.
 *
 * Второго профиля нет, пока его не завели: «один человек — ничего не выбирает»
 * (шаг 409). Поэтому первый профиль создаётся молча, без экрана «выберите
 * человека».
 */
export function first(name: string): Profile {
  return { person: { id: "me", name: name.trim() === "" ? "я" : name.trim() }, facts: [], allowed: [], guest: false };
}

/**
 * Факт кладётся в память **только своего** профиля.
 *
 * Функция принимает профили и id: так вызывающий код не может «забыть» про
 * разделение — он не знает другого способа записать факт.
 */
export function remember(profiles: readonly Profile[], id: string, fact: string): { profiles: Profile[]; ok: boolean; said: string } {
  const at = profiles.findIndex((profile) => profile.person.id === id);
  if (at === -1) return { profiles: [...profiles], ok: false, said: "такого человека нет: факт не записан никому" };

  const profile = profiles[at]!;
  const clean = fact.trim();
  if (clean === "") return { profiles: [...profiles], ok: false, said: "пустой факт не записываю" };

  const next = { ...profile, facts: [...profile.facts, clean] };
  return { profiles: profiles.map((item, i) => (i === at ? next : item)), ok: true, said: `запомнил для ${profile.person.name}: ${clean}` };
}

/**
 * Поиск в памяти — только по своей.
 *
 * Возвращает ещё и **сколько нашлось у других**: не сами факты (это была бы
 * утечка), а число. «У другого человека есть 2 записи по этому слову» — честно и
 * полезно: человек поймёт, почему приложение не отвечает, и что можно спросить
 * у владельца профиля.
 */
export function find(profiles: readonly Profile[], id: string, query: string): { mine: string[]; elsewhere: number } {
  const needle = query.trim().toLowerCase();
  if (needle === "") return { mine: [], elsewhere: 0 };

  const mine = profiles.find((profile) => profile.person.id === id)?.facts ?? [];
  const elsewhere = profiles
    .filter((profile) => profile.person.id !== id)
    .reduce((count, profile) => count + profile.facts.filter((fact) => fact.toLowerCase().includes(needle)).length, 0);

  return { mine: mine.filter((fact) => fact.toLowerCase().includes(needle)), elsewhere };
}

/**
 * Разрешения — по человеку.
 *
 * Чужое согласие не считается моим: разрешение одного человека не действует для
 * другого, даже если это тот же компьютер и та же папка.
 */
export function may(profile: Profile, risk: Risk): { ok: boolean; said: string } {
  if (profile.guest) {
    // Гость — только безопасные руки (шаг 405): список разрешений у него пуст.
    const safe = risk === "read";
    return { ok: safe, said: safe ? "гостю можно: это чтение" : "гостю нельзя: это опасное дело, а гость без разрешений" };
  }
  const ok = profile.allowed.includes(risk);
  return { ok, said: ok ? `можно: ${profile.person.name} разрешил это` : `нельзя: ${profile.person.name} этого не разрешал` };
}

/**
 * Что не разделяется между людьми.
 *
 * Список нужен, чтобы новый профиль не оказался «пустым приложением»: модель,
 * настройки и общие расписания принадлежат машине.
 */
export function shared(): string[] {
  return [
    "скачанная модель: она про компьютер, а не про человека",
    "настройки программы: язык, тема, размер шрифта",
    "общие расписания, которые ведут к общим папкам",
  ];
}

/**
 * Что разделяется.
 *
 * Три вещи, и все — про человека: что он сказал, что он разрешил, и что он
 * попросил.
 */
export function personal(): string[] {
  return ["факты памяти", "разрешения на опасные руки", "журнал его дел"];
}
