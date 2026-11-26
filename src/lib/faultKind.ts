/**
 * Шаг 436: ошибки модели отличаются от ошибок политики в отчётах.
 *
 * В отчёте «12 отказов» — это число без смысла, пока не сказано, **каких**. Две
 * группы отказов требуют разного:
 *
 *  * **модель** (таймаут, битый ответ, движок не запущен) — наша проблема. Её
 *    лечат обновлением, повтором, памятью машины. Человеку делать нечего;
 *  * **политика** (опасное без подтверждения, гость без прав, лимит частоты) —
 *    **работает как задумано**. Это не дефект, и «исправлять» тут нечего;
 *  * и третья, которую путают с обеими: **фраза не разобрана** — тут виноваты
 *    оба, и лечится это примером, а не обновлением.
 *
 * Смешать их значит: считать нормальный отказ дефектом («у нас 50 ошибок!»),
 * звать поддержку из-за политики и чинить политикой сломанный движок.
 */

/** Что произошло. */
export type Fault =
  | "timeout"
  | "broken"
  | "engineDown"
  | "refusedDangerous"
  | "guestRights"
  | "rateLimit"
  | "unclear"
  | "secret";

/**
 * Группа.
 *
 * `работает` — третий вариант, а не «ошибка»: отказ политикой — это нормальное
 * поведение, и в отчёте оно должно стоять отдельно.
 */
export function kind(fault: Fault): "модель" | "политика" | "человек" {
  switch (fault) {
    case "timeout":
    case "broken":
    case "engineDown":
      return "модель";
    case "refusedDangerous":
    case "guestRights":
    case "rateLimit":
    case "secret":
      return "политика";
    case "unclear":
      return "человек";
  }
}

/**
 * Считать отказы по группам.
 *
 * «Работает как задумано» — отдельное число, и оно **не** входит в «ошибки».
 */
export function report(faults: readonly Fault[]): {
  model: number;
  policy: number;
  wording: number;
  said: string;
} {
  const model = faults.filter((fault) => kind(fault) === "модель").length;
  const policy = faults.filter((fault) => kind(fault) === "политика").length;
  const wording = faults.filter((fault) => kind(fault) === "человек").length;

  const parts: string[] = [];
  if (model > 0) parts.push(`${model} ${plural(model, "сбой", "сбоя", "сбоев")} модели — наша ошибка`);
  if (policy > 0) parts.push(`${policy} ${plural(policy, "отказ", "отказа", "отказов")} политикой — так и задумано`);
  if (wording > 0) parts.push(`${wording} ${plural(wording, "фраза", "фразы", "фраз")} не разобрана`);

  return { model, policy, wording, said: parts.length === 0 ? "отказов не было" : parts.join("; ") };
}

/**
 * Что делать с каждой группой.
 *
 * Разные адресаты — вот и весь смысл разделения.
 */
export function next(group: "модель" | "политика" | "человек"): string {
  const words = {
    модель: "обновить программу или повторить: поддержке нужен отчёт, человеку делать нечего",
    политика: "ничего: отказ был решением, а не сбоем. Если решение не нравится — менять разрешения, а не «чинить»",
    человек: "показать пример фразы: это не ошибка, а другой язык",
  };
  return words[group];
}

/**
 * Строка отчёта.
 *
 * Одна строка на группу, и группа названа первым словом: «политикой 3 — так и
 * задумано».
 */
export function byGroup(faults: readonly Fault[]): { group: "модель" | "политика" | "человек"; count: number; line: string }[] {
  const groups: ("модель" | "политика" | "человек")[] = ["модель", "политика", "человек"];
  return groups
    .map((group) => {
      const count = faults.filter((fault) => kind(fault) === group).length;
      return { group, count, line: `${group}: ${count}` };
    })
    .filter((row) => row.count > 0);
}

/**
 * Что нельзя делать с группами.
 *
 * Три соблазна, и все — из разряда «починить политикой сломанное».
 */
export function neverMix(): string[] {
  return [
    "не считать отказ политикой ошибкой: «50 ошибок» из них 45 — нормальные отказы",
    "не чинить сбои модели изменением разрешений: причина не в правах",
    "не объяснять «не разобрал фразу» словом «ошибка»: это язык, а не сбой",
  ];
}

/** Склонение по числу. */
function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
