import type { PlanCheck } from "../ipc";

/**
 * Отдельное слово человека на уже показанный план.
 *
 * Это не первая фраза задачи и не слово модели. Лишние слова — новая просьба,
 * а не разрешение. «Да, и удали ещё» сюда не попадает.
 */
const CONSENT_WORDS = ["да", "давай", "разрешаю", "подтверждаю", "делай", "выполняй", "можно"] as const;

const RUNNABLE = new Set(["allow", "allow_with_notice", "confirm"]);

export function normalizeConsent(phrase: string): string {
  return phrase
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[.!?…,;:]+$/u, "")
    .trim();
}

export function isSpokenConsent(phrase: string): boolean {
  return (CONSENT_WORDS as readonly string[]).includes(normalizeConsent(phrase));
}

/**
 * Пока человек набирает разрешение, план не сбрасываем.
 * Пустое поле — тоже: выделение и замена не должны ронять уже показанный план.
 * Чужое слово с первой же буквы план снимает.
 */
export function keepsPendingPlan(phrase: string): boolean {
  const word = normalizeConsent(phrase);
  if (word.length === 0) return true;
  return (CONSENT_WORDS as readonly string[]).some(
    (consent) => consent === word || consent.startsWith(word),
  );
}

/**
 * Можно ли принять отдельное слово как разрешение на уже показанный план.
 *
 * Вопросы и запрет политики словом «да» не закрываются. Пустые ворота — не
 * разрешение. Шаг `confirm` без остальных ворот тоже не закрываем: политика
 * должна назвать каждый шаг.
 */
export function consentCanRun(check: PlanCheck | null): boolean {
  if (!check?.plan || check.plan.steps.length === 0) return false;
  if (check.questions.length > 0 || check.problems.length > 0) return false;
  if (check.gates.length !== check.plan.steps.length) return false;
  if (check.gates.some((gate) => !RUNNABLE.has(gate.decision))) return false;
  return check.gates.some((gate) => gate.decision === "confirm");
}

/** Номера шагов, которые слово человека разрешает. Запрет сюда не входит. */
export function consentPositions(check: PlanCheck): number[] {
  return check.gates.filter((gate) => gate.decision === "confirm").map((gate) => gate.position);
}
