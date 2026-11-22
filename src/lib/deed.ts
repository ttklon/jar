/**
 * Дело: одна карточка вместо трёх разных форм отчёта.
 *
 * Зачем отдельный модуль. Об одном и том же запуске приложение рассказывало в
 * трёх местах и тремя способами: в «Спросить» — план с шагами, в «Истории» —
 * строка журнала, в памяти — запуск с итогом. Данные одни, а формы разные, и
 * человек не мог ответить на простой вопрос: **что было сделано**. Здесь одна
 * форма, из которой получаются все три вида:
 *
 *  * **одна строка** — для ленты: что, когда, чем кончилось;
 *  * **детали** — фраза, план, шаги, доказательства, отмена, повтор;
 *  * **текст для другого человека** — чтобы не присылать скриншоты.
 *
 * Правила, которые держит тест:
 *
 *  * **доказательство не выдумывается.** Если его нет, так и написано
 *    «доказательства нет» — потому что враньё здесь дороже пустоты;
 *  * **отменить можно только идущее.** Кнопка «отменить» у законченного дела —
 *    ложь: отменять нечего, а человек будет на неё жать;
 *  * **повторить можно не всё.** Скачивание и распознавание повторяются по
 *    своим правилам, и обещать общий повтор значило бы обещать то, чего нет;
 *  * **провал называет причину.** «Не получилось» без причины — это не отчёт.
 */

/** Один шаг дела в том виде, в каком его отдаёт ядро (`RunStep`/`PlanStepRun`). */
export interface DeedStep {
  position: number;
  /** Ключ инструмента `домен|глагол|объект` либо имя шага плана. */
  tool: string;
  ok: boolean;
  /** Почему не вышло; пусто у успешного шага. */
  reason?: string;
  /** Короткое описание доказательства; пусто, если доказательства нет. */
  evidence?: string;
  /** `skipped` — шаг сделан в прошлый раз и пропущен, а не выполнен сейчас. */
  status?: string;
}

/** Дело целиком — то, что показывает карточка. */
export interface Deed {
  id: number;
  /** Фраза человека или цель плана — то, ради чего всё делалось. */
  subject: string;
  /** `tool` | `flow` | `plan` | `download` | `speech` | `server`. */
  kind: string;
  startedMs: number;
  finishedMs: number | null;
  /** `running` | `ok` | `failed` | `denied` | `cancelled`. */
  outcome: string;
  steps: DeedStep[];
  /** Сессия, в которой шло дело; пусто у старых записей и у скачиваний. */
  session?: string;
}

/** Кнопки, которые у карточки есть. */
export interface DeedActions {
  /** Дело ещё идёт — отменять есть что. */
  canCancel: boolean;
  /** Дело закончилось и его можно повторить тем же планом. */
  canRepeat: boolean;
  /** Почему нельзя повторить. Непусто, когда `canRepeat` ложно и причина есть. */
  repeatWhy: string;
}

/** Причина, по которой повторять нечего. */
export interface DeedVerdict extends DeedActions {
  /** Человеческое «чем кончилось» для одной строки. */
  verdict: string;
  /** Сколько шагов прошло; считается по вычтенным `skipped`, а не по всем. */
  done: number;
  failed: number;
  total: number;
}

const OUTCOME: Record<string, string> = {
  running: "идёт",
  ok: "готово",
  failed: "не вышло",
  denied: "отказано политикой",
  cancelled: "остановлено человеком",
};

/**
 * Виды дел, которые повторяются тем же планом.
 *
 * Список, а не «всё, кроме скачивания»: новое дело без правила должно попадать
 * в «повторить нельзя», а не в «повторим и посмотрим». Молчаливый повтор
 * опаснее отсутствующего.
 */
const REPEATABLE = new Set(["plan", "tool", "flow"]);

/** Чем кончилось и что можно нажать. */
export function judge(deed: Deed): DeedVerdict {
  const steps = deed.steps;
  // Пропущенные шаги — «сделано в прошлый раз»: считать их сделанными сейчас
  // значило бы показывать человеку работу, которой не было.
  const real = steps.filter((step) => step.status !== "skipped");
  const done = real.filter((step) => step.ok).length;
  const failed = real.filter((step) => !step.ok).length;
  const running = deed.outcome === "running" || deed.finishedMs === null;

  const canCancel = running && !deed.outcome.startsWith("cancel");
  let canRepeat = false;
  let repeatWhy = "";
  if (running) {
    repeatWhy = "дело ещё идёт: сначала дождитесь конца или остановите его";
  } else if (!REPEATABLE.has(deed.kind)) {
    repeatWhy = "такое дело не повторяется кнопкой: у него своё правило запуска";
  } else if (steps.length === 0) {
    repeatWhy = "повторять нечего: в деле не было шагов";
  } else {
    canRepeat = true;
  }

  return {
    canCancel,
    canRepeat,
    repeatWhy,
    verdict: OUTCOME[deed.outcome] ?? deed.outcome,
    done,
    failed,
    total: real.length,
  };
}

/** Одна строка для ленты: что, когда, чем кончилось. */
export function oneLine(deed: Deed): string {
  const time = new Date(deed.startedMs).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const verdict = OUTCOME[deed.outcome] ?? deed.outcome;
  // Счёт шагов — только когда они есть: «0 из 0» у скачивания читалось бы
  // как поломка, а там просто нет шагов.
  const steps = deed.steps.filter((step) => step.status !== "skipped").length;
  const progress = steps > 0 ? `, шагов ${steps}` : "";
  // Длительность нужна, чтобы отличить «мгновенно» от «две секунды»: по одному
  // «готово» этого не видно, а жалобы «долго» начинаются с неё.
  const duration =
    deed.finishedMs === null
      ? ", ещё идёт"
      : `, ${Math.max(0, deed.finishedMs - deed.startedMs)} мс`;
  return `${time} · ${deed.subject} · ${verdict}${duration}${progress}`;
}

/**
 * Доказательство шага словами.
 *
 * `null` — доказательства нет. Это не то же самое, что «пусто»: у шага без
 * доказательства человек должен увидеть именно «не проверено», иначе он решит,
 * что проверка прошла молча.
 */
export function evidenceText(step: DeedStep): string | null {
  const text = step.evidence?.trim();
  if (!text) return null;
  // Служебные метки ядра — не доказательства для человека.
  if (text === "previous-run") return null;
  return text;
}

/**
 * Куда из дела есть переход.
 *
 * Оба — не всегда: откат привязан к сессии, и у дела без сессии (старая запись,
 * скачивание) вести некуда. Ложная ссылка хуже её отсутствия: человек нажмёт
 * и увидит чужое.
 */
export interface DeedLinks {
  /** Есть ли что смотреть в журнале: у дела всегда есть строки по времени. */
  journal: boolean;
  /** Есть ли сессия, по которой откат знает своё. */
  undo: boolean;
}

export function links(deed: Deed): DeedLinks {
  return {
    journal: deed.startedMs > 0,
    undo: Boolean(deed.session && deed.session.trim()),
  };
}

/** Отчёт о деле текстом — чтобы человек мог переслать его, а не скриншот. */
export function deedText(deed: Deed): string {
  const verdict = judge(deed);
  const lines: string[] = [];
  lines.push(`Дело: ${deed.subject}`);
  lines.push(`Чем кончилось: ${verdict.verdict}`);
  if (verdict.total > 0) {
    lines.push(`Шагов прошло: ${verdict.done} из ${verdict.total}`);
  }
  if (verdict.failed > 0) {
    lines.push(`Не вышло шагов: ${verdict.failed}`);
  }
  for (const step of deed.steps) {
    const mark = step.status === "skipped" ? "−" : step.ok ? "✓" : "✗";
    const why = step.reason ? ` — ${step.reason}` : "";
    const proof = evidenceText(step);
    lines.push(
      `${mark} ${step.position}. ${step.tool}${why}${proof ? ` [доказательство: ${proof}]` : " [не проверено]"}`,
    );
  }
  if (deed.steps.length === 0) {
    lines.push("Шагов не было.");
  }
  return lines.join("\n");
}
