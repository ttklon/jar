/**
 * Шаг 336: автоматизация опасного действия требует подтверждения каждый раз или никогда.
 *
 * Про «каждый раз» понятно. Непонятно про «никогда» — зачем такой вариант? Затем,
 * что он honest: человек может решить, что это дело не должно делаться само
 * **вообще**, и тогда правило нужно не «с подтверждением», а «только по просьбе».
 *
 * Почему нет середины («спросить один раз, потом тихо»): опасное дело, сделанное
 * один раз без человека, — это именно тот случай, ради которого он и создавал
 * правило. А сделанное без вопроса — уже не его решение.
 *
 * Что считается опасным — список, а не догадка: удаление, отправка от имени
 * человека, трата денег, изменение системы, запись в чужую папку. И проверка
 * идёт по **шагу плана**, а не по названию правила: правило «уборка» может
 * содержать и чтение, и удаление.
 */

/** Род действия. */
export type Risk = "delete" | "send" | "pay" | "system" | "foreignWrite" | "read";

/** Рода, которые опасны. */
export const DANGEROUS: readonly Risk[] = ["delete", "send", "pay", "system", "foreignWrite"];

/** Политика человека. */
export type Policy = "always" | "never";

/** Что спрашиваем. */
export function isDangerous(risk: Risk): boolean {
  return DANGEROUS.includes(risk);
}

/**
 * Можно ли выполнить автоматически.
 *
 * Возвращает решение и **что человек увидит**: «подтверждение нужно», «делаю по
 * просьбе, а не по расписанию».
 */
export function decide(risk: Risk, policy: Policy): { runs: boolean; needAsk: boolean; said: string } {
  if (!isDangerous(risk)) return { runs: true, needAsk: false, said: "безопасное дело: идёт по расписанию" };

  if (policy === "never") {
    return {
      runs: false,
      needAsk: false,
      said: "по расписанию не делаю: вы сказали «никогда» — сделаю, только если попросите сами",
    };
  }
  return { runs: true, needAsk: true, said: "по расписанию, но с подтверждением каждый раз — это опасное дело" };
}

/**
 * Проверка плана целиком.
 *
 * Правило «уборка» может содержать и чтение, и удаление: политика принимается по
 * **самому опасному шагу**, а не по названию.
 */
export function planVerdict(risks: readonly Risk[], policy: Policy): { worst: Risk | null; needAsk: boolean; runs: boolean; said: string } {
  const worst = risks.find((risk) => isDangerous(risk)) ?? null;
  if (worst === null) return { worst: null, needAsk: false, runs: true, said: "в плане нет опасных шагов" };

  const verdict = decide(worst, policy);
  return { worst, needAsk: verdict.needAsk, runs: verdict.runs, said: verdict.said };
}

/**
 * Что показывает подтверждение.
 *
 * Не «выполнить автоматизацию?», а **что именно** будет удалено или отправлено:
 * на этот вопрос человек может ответить осознанно.
 */
export function confirmText(what: string, detail: string, risk: Risk): string {
  const verb =
    risk === "delete"
      ? "удалить"
      : risk === "send"
        ? "отправить"
        : risk === "pay"
          ? "оплатить"
          : risk === "system"
            ? "изменить в системе"
            : "записать в чужую папку";
  return `Автоматизация хочет ${verb}: ${what} — ${detail}. Выполнить?`;
}

/**
 * Почему «спросить один раз, потом тихо» не предлагается.
 *
 * Это вопрос, который задают первым, и ответ должен быть готовым.
 */
export function whyNoMiddle(): string {
  return "середины нет: «спросить один раз, потом тихо» — это и есть тихое опасное дело, ради которого правило и не нужно";
}

/**
 * Что говорит человек, который выбрал «никогда».
 *
 * Не «правило удалено»: правило есть, оно ждёт просьбы.
 */
export function neverSaid(what: string): string {
  return `«${what}» по расписанию не делается: скажите словами, и я сделаю сейчас`;
}
