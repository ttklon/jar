/**
 * Шаг 494: решить, что вырезать — функция, которая не доказана, это долг.
 *
 * Вырезать труднее, чем добавить: жалко уже сделанного. Но функция, которая
 * **не доказана**, — это долг с процентами:
 *
 *  * её надо помнить, чтобы не сломать;
 *  * её надо обходить в документации («работает, но не всегда»);
 *  * она занимает место в интерфейсе, где человек ищет то, что работает;
 *  * и она создаёт ложное впечатление, что это умеется.
 *
 * Поэтому решение принимается **по признакам**, а не по жалости. Функция идёт под
 * вырезание, если у неё:
 *
 *  * нет доказательства: ни теста с утверждением (шаг 487), ни приёмки (шаг 492);
 *  * нет пользователя: ею никто не пользуется, потому что о ней не знают;
 *  * есть обход: человек делает то же руками за две минуты.
 *
 * Но есть и то, что **нельзя** вырезать: то, на что опирается что-то доказанное.
 * Вырезать его — значит вырезать чужую опору.
 */

/** Функция. */
export interface Feature {
  readonly name: string;
  /** Есть тест с утверждением. */
  readonly asserted: boolean;
  /** Прошла приёмку хотя бы на средней машине. */
  readonly accepted: boolean;
  /** Ею пользуются: сколько обращений за месяц. */
  readonly uses: number;
  /** Что делает человек, если её нет. */
  readonly workaround: string | null;
  /** На что она опирается — другие функции. */
  readonly dependsOn: readonly string[];
}

/** Решение. */
export interface Decision {
  readonly name: string;
  /** `резать`, `оставить` или `сначала доказать`. */
  readonly verdict: "резать" | "оставить" | "сначала доказать";
  /** Почему — одной строкой. */
  readonly why: string;
}

/**
 * Решить по одной функции.
 *
 * Три исхода, и «сначала доказать» — не отговорка: у него есть **срок**, иначе это
 * «оставить навсегда».
 */
export function decide(feature: Feature): Decision {
  const proven = feature.asserted && feature.accepted;

  if (!proven && feature.workaround !== null && feature.uses === 0) {
    return { name: feature.name, verdict: "резать", why: "не доказана, никто не пользуется, и есть обход — это долг с процентами" };
  }
  if (!proven) {
    return { name: feature.name, verdict: "сначала доказать", why: "не доказана: либо тест с утверждением, либо приёмка — до следующего пересмотра" };
  }
  return { name: feature.name, verdict: "оставить", why: "доказана тестом и приёмкой" };
}

/**
 * Учесть опоры.
 *
 * Нельзя резать то, на что опирается что-то доказанное: это вырезание чужой опоры.
 */
export function withDeps(features: readonly Feature[]): Decision[] {
  const decisions = features.map(decide);
  const keep = new Set(decisions.filter((decision) => decision.verdict !== "резать").map((decision) => decision.name));

  return decisions.map((decision) => {
    if (decision.verdict !== "резать") return decision;

    const users = features.filter((feature) => feature.dependsOn.includes(decision.name) && keep.has(feature.name));
    if (users.length === 0) return decision;

    return { ...decision, verdict: "сначала доказать" as const, why: `резать нельзя: на неё опирается ${users.map((feature) => `«${feature.name}»`).join(", ")}` };
  });
}

/**
 * Что сказать человеку.
 *
 * Три числа: резать, доказать, оставить. И «резать» — с именами, чтобы это было
 * действие, а не мнение.
 */
export function summary(features: readonly Feature[]): string {
  const decisions = withDeps(features);
  const cut = decisions.filter((decision) => decision.verdict === "резать").map((decision) => decision.name);
  const prove = decisions.filter((decision) => decision.verdict === "сначала доказать").length;
  const keep = decisions.filter((decision) => decision.verdict === "оставить").length;

  const cutPart = cut.length === 0 ? "резать нечего" : `резать ${cut.length}: ${cut.join(", ")}`;
  return `функций ${features.length}: ${cutPart}; сначала доказать ${prove}; оставить ${keep}`;
}

/**
 * Чего решение не делает.
 *
 * Три запрета; главный — не оставлять «пока так».
 */
export function notDo(): string[] {
  return [
    "не оставляет недоказанную функцию «пока так»: у «сначала доказать» есть срок",
    "не режет то, на что опирается доказанное",
    "не решает по жалости: решение по признакам, а не по вложенному труду",
  ];
}

/**
 * Что проверяет тест.
 *
 * Три признака вырезания.
 */
export function checks(): string[] {
  return [
    "недоказанная функция без пользователя и с обходом — режется",
    "недоказанная, но нужная — «сначала доказать» со сроком",
    "доказанная остаётся, даже если обход есть",
  ];
}
