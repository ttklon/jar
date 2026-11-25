/**
 * Шаг 403: разрешения по человеку, а не по машине. Чужое согласие не считается моим.
 *
 * В `peopleProfiles` (шаг 401) разрешения уже лежат в профиле. Здесь —
 * **правило, которое нельзя переписать по невнимательности**: ни одно место
 * программы не должно спрашивать «разрешено ли это на компьютере».
 *
 * Откуда берётся ошибка. Удобно хранить разрешения рядом с делом: «уборка
 * загрузок — разрешена». Один раз согласился один человек — и дело разрешено
 * **всем**, кто им пользуется. Через месяц гость нажимает «повторить» и удаляет
 * чужие файлы, а в журнале «разрешено».
 *
 * Поэтому разрешение — тройка: **кто, какое действие, до каких пор**. Не пара
 * «действие + папка». И у разрешения есть срок: «разрешил один раз» — это не
 * «разрешил навсегда».
 */

import type { Risk } from "./dangerPolicy";
import { isDangerous } from "./dangerPolicy";

/** Выданное разрешение. */
export interface Grant {
  /** Кому выдано — id человека. */
  readonly to: string;
  readonly risk: Risk;
  /** Область: папка или «всё». */
  readonly scope: string;
  /** Когда выдано — миллисекунды. */
  readonly at: number;
  /** На сколько выдано, мс; `0` — до отзыва. */
  readonly forMs: number;
  /** Одноразовое: сгорает после первого выполнения. */
  readonly once: boolean;
}

/**
 * Действует ли разрешение для человека.
 *
 * `now` — миллисекунды. Истёкшее разрешение не действует: срок — часть согласия,
 * а не украшение.
 */
export function holds(grant: Grant, who: string, risk: Risk, scope: string, now: number): boolean {
  if (grant.to !== who) return false;
  if (grant.risk !== risk) return false;
  if (!within(grant.scope, scope)) return false;
  if (grant.forMs > 0 && now >= grant.at + grant.forMs) return false;
  return true;
}

/** Разрешение на папку покрывает вложенные, но не соседние. */
function within(granted: string, asked: string): boolean {
  if (granted === "всё") return true;
  const a = granted.replace(/[\\/]+$/, "");
  const b = asked.replace(/[\\/]+$/, "");
  return b === a || b.startsWith(`${a}/`) || b.startsWith(`${a}\\`);
}

/**
 * Найти действующее разрешение среди выданных.
 *
 * Возвращает **чьё именно** оно — чтобы журнал мог сказать «разрешила Анна», а не
 * безличное «разрешено».
 */
export function find(grants: readonly Grant[], who: string, risk: Risk, scope: string, now: number): Grant | null {
  return grants.find((grant) => holds(grant, who, risk, scope, now)) ?? null;
}

/**
 * Можно ли выполнить без вопроса.
 *
 * Опасное без разрешения — спрашиваем (шаг 336). Безопасное — не спрашиваем
 * никогда: чтение не требует согласия.
 */
export function may(grants: readonly Grant[], who: string, risk: Risk, scope: string, now: number): { ok: boolean; because: string } {
  if (!isDangerous(risk)) return { ok: true, because: "чтение не требует разрешения" };
  const grant = find(grants, who, risk, scope, now);
  if (grant === null) return { ok: false, because: "этого человека никто не разрешал: спрошу у него" };
  return { ok: true, because: `разрешено: ${grant.forMs === 0 ? "до отзыва" : "на время"}${grant.once ? ", один раз" : ""}` };
}

/**
 * Сжечь одноразовое разрешение после выполнения.
 *
 * Не «оставим на всякий случай»: одноразовое, сгоревшее один раз, — это и есть
 * смысл «разрешил один раз».
 */
export function burn(grants: readonly Grant[], used: Grant): Grant[] {
  if (!used.once) return [...grants];
  return grants.filter((grant) => grant !== used);
}

/**
 * Отозвать.
 *
 * Отзыв — по человеку и по действию: «отзову всё у сына» и «отзову удаление у
 * всех» — разные просьбы, и обе законные.
 */
export function revoke(grants: readonly Grant[], who: string | null, risk: Risk | null): { left: Grant[]; removed: number } {
  const left = grants.filter((grant) => !((who === null || grant.to === who) && (risk === null || grant.risk === risk)));
  return { left, removed: grants.length - left.length };
}

/**
 * Почему нельзя «одобрить на этом компьютере».
 *
 * Ответ на законный вопрос: зачем усложнять, это же один и тот же человек.
 */
export function whyPerPerson(): string {
  return "компьютером пользуются разные люди: «на этом компьютере разрешено» — это согласие одного человека, выданное всем, включая гостя";
}
