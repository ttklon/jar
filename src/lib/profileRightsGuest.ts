/**
 * Шаг 413: права по профилю и отдельный «гостевой» режим.
 *
 * Права по человеку уже есть (шаг 403), гость — тоже (шаг 405). Этот шаг
 * соединяет их в **одну настройку экрана**, где видно, кто что может, и где
 * «гостевой режим» — не ярлык на человеке, а отдельное состояние:
 *
 *  * у обычного человека права — перечислены и объяснены: «удаление в Загрузках —
 *    до отзыва, выдано вами же»;
 *  * у гостя **нет своих прав вообще**, и это не «пока нет»: выдавать гостю
 *    опасные руки нельзя, иначе он перестаёт быть гостем;
 *  * **гостевой режим включается и выключается одной кнопкой** — хозяин может
 *    передать ноутбук и забрать обратно, не удаляя профиль гостя;
 *  * и **выключение режима не даёт гостю прав задним числом**: пока режим был,
 *    ничего не выдавалось.
 */

import type { Risk } from "./dangerPolicy";
import { isDangerous } from "./dangerPolicy";
import type { Profile } from "./peopleProfiles";

/** Строка экрана прав. */
export interface Row {
  readonly whom: string;
  readonly risk: Risk;
  readonly ok: boolean;
  readonly line: string;
}

/**
 * Экран прав.
 *
 * Для каждого человека — интересные только опасные руки (чтение можно всем, и
 * писать о нём строку — шум).
 */
export function rows(profiles: readonly Profile[], grants: readonly { to: string; risk: Risk; scope: string }[]): Row[] {
  const out: Row[] = [];
  for (const profile of profiles) {
    for (const risk of ["delete", "send", "pay", "system", "foreignWrite"] as const) {
      const mine = grants.filter((grant) => grant.to === profile.person.id && grant.risk === risk);
      if (profile.guest) {
        out.push({ whom: profile.person.name, risk, ok: false, line: `${profile.person.name}: ${riskWord(risk)} — гостю нельзя, и выдать нельзя` });
        continue;
      }
      if (mine.length === 0) {
        out.push({ whom: profile.person.name, risk, ok: false, line: `${profile.person.name}: ${riskWord(risk)} — не разрешено, спросим` });
        continue;
      }
      out.push({ whom: profile.person.name, risk, ok: true, line: `${profile.person.name}: ${riskWord(risk)} — ${mine.map((grant) => `«${grant.scope}»`).join(", ")}` });
    }
  }
  return out;
}

/** Рода по-русски: «удаление», а не «delete». */
export function riskWord(risk: Risk): string {
  const words: Record<Risk, string> = {
    delete: "удаление",
    send: "отправка",
    pay: "деньги",
    system: "настройки системы",
    foreignWrite: "запись в чужую папку",
    read: "чтение",
  };
  return words[risk];
}

/**
 * Выдать право обычному человеку.
 *
 * Гостю — отказ, и он **не молчаливый**: «у гостя прав нет по устройству, а не
 * по настройке».
 */
export function grant(profile: Profile, risk: Risk, scope: string): { ok: boolean; said: string } {
  if (profile.guest && isDangerous(risk)) {
    return { ok: false, said: `«${profile.person.name}» — гость: у него прав нет по устройству гостевого режима, а не по настройке` };
  }
  if (!isDangerous(risk)) return { ok: false, said: "чтение не требует разрешения: строка не нужна" };
  return { ok: true, said: `разрешено «${profile.person.name}»: ${riskWord(risk)} в «${scope}»` };
}

/**
 * Гостевой режим.
 *
 * Одно действие — один факт. Выключение возвращает хозяина, а не «делает гостя
 * хозяином».
 */
export function guestMode(profile: Profile, on: boolean): { profile: Profile; said: string } {
  if (on) {
    return { profile: { ...profile, guest: true, allowed: [] }, said: `«${profile.person.name}» в гостевом режиме: только чтение, опасное нельзя` };
  }
  return { profile: { ...profile, guest: false }, said: `гостевой режим выключен: «${profile.person.name}» снова обычный человек, но права, которые не выдавали, не появились` };
}

/**
 * Что общего у прав по человеческому профилю и у гостя.
 *
 * Три правила — и они же проверки.
 */
export function rules(): string[] {
  return [
    "право выдаётся человеку, а не компьютеру: у одного есть — у другого нет",
    "гостю опасное не выдаётся вовсе, а не «с подтверждением»",
    "выход из гостевого режима не выдаёт права задним числом",
  ];
}
