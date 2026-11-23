/**
 * Параметры для показа человеку (шаги 101 и 103).
 *
 * Оставлено здесь ради экранов `Ask.tsx` и `Voice.tsx`, которые уже импортируют
 * эту функцию, но правило теперь **одно на всё приложение**: маскировка по имени
 * поля **и по значению** живёт в `secretPreview.ts` (шаг 103). Две копии правила
 * разошлись бы — и разошлись бы ровно на том поле, которое забыли дописать.
 */
export { params as describePlanParams } from "./secretPreview";
/**
 * План показывает цель, шаги, риск и что будет сделано — до запуска (шаг 101).
 *
 * Дефект. Человек соглашается на **слепой запуск**. На экране написано «могу
 * сделать», а что именно произойдёт — не написано:
 *
 *  * **цель** не названа: «нашёл 5 действий» — это не цель, а список;
 *  * **шаги** показаны кодами реестра: `files|переименовать|массово по правилу` —
 *    это адрес руки, а не действие;
 *  * **риск** не виден там, где решение: опасный шаг стоит в общем списке
 *    наравне с чтением;
 *  * **что изменится** не сказано вовсе: человек нажимает «выполнить» и узнаёт
 *    результат, уже не имея выбора.
 *
 * Правило: **до запуска видно всё, на что соглашаются**.
 *
 *  1. **Цель** — одна строка словами человека, а не коды: «переименовать фото по
 *     дате съёмки».
 *  2. **Шаги** — по порядку, словами действия, с тем, что каждый изменит.
 *  3. **Риск** — у каждого шага, и **самый высокий вынесен наверх**: согласие
 *     дают на самое опасное, а не на среднее.
 *  4. **Необратимость названа отдельно**: «отмена не вернёт» — это другой факт,
 *     чем «риск: запись».
 *  5. **Что будет сделано** — конкретно: «12 файлов в папке Загрузки» вместо
 *     «изменить файлы». Без числа человек соглашается на неизвестный объём.
 *
 * Почему не «показывать по нажатию «подробнее»». Подробности за кнопкой не
 * читают: согласие даётся на то, что видно в момент нажатия.
 */

import type { Risk } from "../ipc";

/** Шаг плана для показа. */
export interface Step {
  /** Что делает — словами: «переименовать 12 файлов». */
  what: string;
  /** Что изменится: «имена станут датами съёмки». */
  changes: string;
  /** Риск этого шага. */
  risk: Risk;
  /** Отменяется ли уже сделанное. */
  undoable: boolean;
}

/** План целиком. */
export interface Preview {
  /** Цель словами человека. */
  goal: string;
  /** Шаги по порядку. */
  steps: Step[];
}

/** Насколько риск высок — порядок для «самого опасного». */
const RANK: Record<Risk, number> = {
  read: 0,
  "write-local": 1,
  external: 2,
  destructive: 3,
  identity: 4,
  money: 5,
};

/**
 * Самый высокий риск плана.
 *
 * Выносится наверх: согласие дают на самое опасное, а не на среднее.
 */
export function worst(preview: Preview): Risk {
  return preview.steps.reduce<Risk>(
    (high, step) => (RANK[step.risk] > RANK[high] ? step.risk : high),
    "read",
  );
}

/**
 * Риск из строки ядра в известное значение.
 *
 * `PlanGate.risk` приходит строкой; незнакомое значение — **самый высокий**
 * риск, а не `read`: неизвестное не должно выглядеть безопасным.
 */
export function riskOf(text: string): Risk {
  const clean = text.trim().toLowerCase();
  const known: Risk[] = ["read", "write-local", "external", "destructive", "identity", "money"];
  return (known.find((risk) => risk === clean) ?? "destructive") as Risk;
}

/** Русские слова для риска — не коды. */
export function riskWord(risk: Risk): string {
  switch (risk) {
    case "read":
      return "только читает";
    case "write-local":
      return "меняет файлы на этом компьютере";
    case "external":
      return "уходит наружу";
    case "destructive":
      return "стирает без возврата";
    case "identity":
      return "действует от вашего имени";
    case "money":
      return "тратит деньги";
  }
}

/**
 * Строки предпросмотра.
 *
 * Цель первой, риск — сразу после неё: остальное человек читает, уже понимая
 * цену.
 */
export function lines(preview: Preview): string[] {
  if (preview.steps.length === 0) {
    return [preview.goal, "шагов нет — делать нечего"];
  }
  const high = worst(preview);
  const irreversible = preview.steps.filter((step) => !step.undoable);
  const out = [
    `цель: ${preview.goal}`,
    `риск: ${riskWord(high)}`,
  ];
  if (irreversible.length > 0) {
    out.push(
      `не отменяется: ${irreversible.map((step) => step.what).join(", ")} — отмена не вернёт уже сделанное`,
    );
  }
  preview.steps.forEach((step, index) => {
    out.push(`${index + 1}. ${step.what} — ${step.changes} (${riskWord(step.risk)})`);
  });
  return out;
}

/**
 * Можно ли запускать без дополнительного подтверждения.
 *
 * Только всё читающее и отменяемое: согласие на слепой запуск — это не согласие.
 */
export function safe(preview: Preview): boolean {
  return preview.steps.every((step) => step.risk === "read" && step.undoable);
}

/**
 * Что будет сделано — числом, если оно есть.
 *
 * «12 файлов в папке Загрузки» вместо «изменить файлы»: без числа человек
 * соглашается на неизвестный объём.
 */
export function scope(count: number | null, where: string): string {
  if (count === null) return `объём не назван — спрошу перед запуском (${where})`;
  return `${count} ${count === 1 ? "изменение" : count < 5 ? "изменения" : "изменений"} в ${where}`;
}

/**
 * Чего в предпросмотре не хватает.
 *
 * Названо, чтобы «пустая строка» не сходила за «ничего не изменится».
 */
export function gaps(preview: Preview): string[] {
  const missing: string[] = [];
  if (preview.goal.trim() === "") missing.push("цель");
  if (preview.steps.length === 0) missing.push("шаги");
  for (const [index, step] of preview.steps.entries()) {
    if (step.changes.trim() === "") missing.push(`что изменит шаг ${index + 1}`);
  }
  return missing;
}

/**
 * Что сказать, если план пуст.
 *
 * Пустой план — не «всё хорошо», а «делать нечего»: молчание тут выглядит как
 * успех.
 */
export function nothing(): string {
  return "план пуст: ничего не будет сделано — это не успех, а отсутствие шагов";
}
