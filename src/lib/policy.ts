/**
 * Зеркало политики риска для браузерного режима.
 *
 * В приложении решение принимает Rust (`policy.rs`) — единственное место, где это
 * разрешено. Здесь только повторена таблица для верстки и тестов: dev-адаптер не
 * выполняет инструменты, но должен показывать те же «можно / подтверди / нельзя»,
 * что и ядро. Расхождение ловится тестом (`policy.test.ts`).
 */

import type { Action, Decision, Risk } from "../ipc";

const FORBIDDEN: ReadonlySet<Risk> = new Set<Risk>(["identity", "money"]);

export function decide(action: Pick<Action, "risk" | "status">): Decision {
  if (action.status === "never") return "deny";
  if (FORBIDDEN.has(action.risk)) return "deny";
  if (action.risk === "read") return "allow";
  return "confirm";
}

export function decisionReason(decision: Decision, risk: Risk): string {
  switch (decision) {
    case "allow":
      return "чтение: можно выполнять без подтверждения";
    case "allow_with_notice":
      return "изменение в пределах приложения: выполняем и показываем результат";
    case "confirm":
      return risk === "destructive"
        ? "удаление/перезапись: нужно подтверждение человеком"
        : "нужно подтверждение человеком";
    case "deny":
      return FORBIDDEN.has(risk)
        ? "деньги и учётные данные — только человек"
        : "действие помечено never: система его не выполняет";
  }
}
