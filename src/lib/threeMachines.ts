/**
 * Шаг 492: живая приёмка на трёх машинах разной силы — единственный настоящий экзамен.
 *
 * Тесты гоняются в одной среде. Настоящая жизнь — три разные:
 *
 *  * **слабая** — 4 ГБ, старый процессор, HDD: тут видно, что медленно и что падает;
 *  * **средняя** — обычный ноутбук: на ней живёт большинство людей;
 *  * **сильная** — 32 ГБ, много мониторов: тут видно, что ломается от изобилия
 *    (несколько экранов, длинные пути, огромные папки).
 *
 * И правило приёмки: **принимается то, что прошло на всех трёх**. Прошло на средней и
 * упало на слабой — не принято: половина людей работает именно на слабой.
 *
 * Это не «тестирование», это **экзамен**: заранее известны три машины, три сценария
 * и что считается пройденным.
 */

/** Класс машины. */
export type Class_ = "слабая" | "средняя" | "сильная";

/** Машина. */
export interface Machine {
  readonly name: string;
  readonly class: Class_;
  /** Память, ГБ. */
  readonly ram: number;
  /** Свободно на диске, ГБ. */
  readonly disk: number;
}

/** Результат сценария на машине. */
export interface Outcome {
  readonly machine: string;
  readonly scenario: string;
  /** Прошло ли. */
  readonly ok: boolean;
  /** Что видел человек, если не прошло. */
  readonly saw?: string;
}

/**
 * Проверить набор машин.
 *
 * Три класса, и все три — обязательны: набор из трёх средних не проверяет слабую.
 */
export function checkMachines(machines: readonly Machine[]): string[] {
  const problems: string[] = [];
  const classes = new Set(machines.map((machine) => machine.class));

  for (const need of ["слабая", "средняя", "сильная"] as Class_[]) {
    if (!classes.has(need)) problems.push(`нет машины класса «${need}»: приёмка на остальных её не заменяет`);
  }

  for (const machine of machines) {
    if (machine.ram <= 0) problems.push(`«${machine.name}»: память ${machine.ram} ГБ — так не бывает`);
    if (machine.disk < 10) problems.push(`«${machine.name}»: свободно ${machine.disk} ГБ — приёмка не про установку`);
  }

  return problems;
}

/**
 * Приёмка.
 *
 * `ok` только если **каждая** машина прошла **каждый** сценарий. Возвращает не
 * «нет», а список провалов: «слабая: не прошло — что видел человек».
 */
export function accept(machines: readonly Machine[], outcomes: readonly Outcome[]): { ok: boolean; failed: string[]; said: string } {
  const failed: string[] = [];

  for (const machine of machines) {
    for (const scenario of [...new Set(outcomes.map((outcome) => outcome.scenario))]) {
      const got = outcomes.find((outcome) => outcome.machine === machine.name && outcome.scenario === scenario);
      if (got === undefined) failed.push(`${machine.name} (${machine.class}): сценарий «${scenario}» не запускали`);
      else if (!got.ok) failed.push(`${machine.name} (${machine.class}): «${scenario}» — ${got.saw ?? "не сказано, что видел человек"}`);
    }
  }

  return {
    ok: failed.length === 0,
    failed,
    said: failed.length === 0
      ? `принято: ${machines.length} машин × ${new Set(outcomes.map((outcome) => outcome.scenario)).size} сценариев прошли`
      : `не принято: ${failed.join("; ")}`,
  };
}

/**
 * Что проверяет каждая машина.
 *
 * Три класса и то, что именно ловится только на нём.
 */
export function whyThree(): { class: Class_; catches: string }[] {
  return [
    { class: "слабая", catches: "что медленно и падает: 4 ГБ, HDD, старый процессор" },
    { class: "средняя", catches: "что вы увидит большинство: обычный ноутбук" },
    { class: "сильная", catches: "что ломается от изобилия: несколько мониторов, огромные папки, длинные пути" },
  ];
}

/**
 * Чего приёмка не делает.
 *
 * Три запрета; главный — не «примем, если на средней прошло».
 */
export function notDo(): string[] {
  return [
    "не принимает по средней машине: половина людей на слабой",
    "не пропускает сценарий, который «не запускали»: молчание не равно успеху",
    "не пишет «упало»: называет, что видел человек",
  ];
}

/**
 * Что проверяет тест.
 *
 * Три проверки — по классам машин.
 */
export function checks(): string[] {
  return [
    "в приёмке три машины: слабая, средняя и сильная",
    "сценарий, который не запускали, — провал, а не успех",
    "провал называет машину и то, что видел человек",
  ];
}
