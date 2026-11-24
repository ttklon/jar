/**
 * Внешние скрипты и профили: проверка до запуска, лимиты, таймауты (шаг 165).
 *
 * Что уже было. В ядре проверка есть и серьёзная: `hand::scan` держит список
 * запрещённых кусков (`iex`, `downloadstring`, `runas`, `remove-item -recurse`,
 * `credential`…), проба идёт в клетке с лимитом вывода `MAX_OUTPUT = 2000` и
 * таймаутом `TIMEOUT = 20 с`, а рукой черновик становится только после успешной
 * пробы. Профили приложений тоже проверяются — но в CI (`tools/profiles.py`).
 *
 * Где был разрыв. Правило существовало **на стороне ядра** и узнавалось человеком
 * **после** нажатия:
 *
 *  * **лимиты не названы заранее.** Приложение снимет пробу через 20 секунд — а
 *    человек этого не знает и ждёт, читая код, будто тот может висеть вечно;
 *  * **два списка запрещённого разошлись бы.** `hand.rs` — для черновиков, CI —
 *    для профилей. Завтра третий вход (свой скрипт руками) получил бы третью
 *    проверку или никакой;
 *  * **«профиль проверен» не говорило, когда.** `verified_at` есть в данных, но
 *    старый профиль (проверен год назад) выглядел так же, как свежий;
 *  * **контекст вызова не назван.** Один и тот же скрипт в клетке и снаружи
 *    клетки — разные риски, а назывались одинаково;
 *  * **лимит вывода и таймаут — разные обещания.** «Обрежу вывод» и «сниму через
 *    20 секунд» — не одно и то же, и человеку нужно знать оба.
 *
 * Правила:
 *
 *  1. **проверка до запуска и до показа** — по одному списку, и отказ называет
 *     кусок и причину, а не «нельзя»;
 *  2. **лимиты названы числом** — «до 20 с, вывод до 2000 знаков» — до нажатия;
 *  3. **порог = лимит ядра**, и расхождение ловится тестом на данных, а не на
 *     памяти: правило, отставшее от `hand.rs`, хуже его отсутствия;
 *  4. **старый профиль называется старым** — «проверен 400 дней назад» вместо
 *     одинаковой галочки;
 *  5. **контекст назван**: в клетке / снаружи, и снаружи — только по слову.
 *
 * Модуль ничего не запускает: он отвечает, что можно, чего нельзя и с какими
 * пределами — до того, как что-то произойдёт.
 */

/** Куда идёт скрипт. */
export type Where = "cell" | "outside" | "profile";

/** Запрещённый кусок и почему. */
export interface Banned {
  /** Что ищем в тексте — без учёта регистра, как и ядро. */
  piece: string;
  /** Почему нельзя: словами, а не кодом. */
  why: string;
}

/**
 * Тот же список, что в ядре (`hand::scan`).
 *
 * Скопирован намеренно: проверка до показа нужна в интерфейсе, а звать ядро ради
 * подсветки значило бы ждать ответа. Расхождение ловится тестом: он читает
 * `src-tauri/src/hand.rs` и сверяет пары.
 */
export const BANNED: readonly Banned[] = [
  { piece: "invoke-expression", why: "выполнение строки как кода" },
  { piece: "iex ", why: "выполнение строки как кода" },
  { piece: "iex(", why: "выполнение строки как кода" },
  { piece: "| iex", why: "выполнение строки как кода" },
  { piece: "downloadstring", why: "скачивание из сети" },
  { piece: "downloadfile", why: "скачивание из сети" },
  { piece: "invoke-webrequest", why: "скачивание из сети" },
  { piece: "invoke-restmethod", why: "сеть" },
  { piece: "start-bitstransfer", why: "скачивание из сети" },
  { piece: "net.webclient", why: "скачивание из сети" },
  { piece: "curl ", why: "сеть" },
  { piece: "wget ", why: "сеть" },
  { piece: "start-process -verb runas", why: "повышение прав" },
  { piece: "set-executionpolicy", why: "отключение защиты" },
  { piece: "add-mppreference", why: "отключение защиты" },
  { piece: "netsh advfirewall", why: "отключение защиты" },
  { piece: "reg add", why: "правка реестра в обход" },
  { piece: "schtasks", why: "задачи в обход" },
  { piece: "runas", why: "повышение прав" },
  { piece: "convertto-securestring", why: "секреты" },
  { piece: "credential", why: "секреты" },
  { piece: "password", why: "секреты" },
  { piece: "remove-item -recurse", why: "необратимое удаление" },
  { piece: "del /s", why: "необратимое удаление" },
  { piece: "rmdir /s", why: "необратимое удаление" },
  { piece: "format ", why: "необратимое удаление" },
  { piece: "shutdown", why: "остановка машины" },
];

/** Лимиты, с которыми идёт проба. Числа — из ядра, а не «около того». */
export interface Limits {
  /** Сколько секунд даётся скрипту. */
  seconds: number;
  /** Сколько знаков вывода доходит до человека. */
  output: number;
  /** Куда идёт скрипт. */
  where: Where;
}

/** Пределы из ядра (`trial::TIMEOUT`, `trial::MAX_OUTPUT`). */
export const KERNEL: Limits = { seconds: 20, output: 2000, where: "cell" };

/**
 * Лимиты по контексту.
 *
 * Снаружи клетки — не дольше и не больше, чем в клетке: если снаружи нужно
 * больше, это повод не расширять предел, а спросить, зачем.
 */
export function limits(where: Where, kernel: Limits = KERNEL): Limits {
  if (where === "cell") return { ...kernel, where };
  if (where === "outside") {
    return { ...kernel, where, seconds: Math.min(kernel.seconds, 20), output: Math.min(kernel.output, 2000) };
  }
  // Профиль — не запуск, а описание: времени ему не даётся вовсе.
  return { seconds: 0, output: kernel.output, where };
}

/**
 * Проверка текста до запуска.
 *
 * Возвращает найденное: кусок и причину. Пусто — чисто. Формулировка — «что
 * именно не так», а не «нельзя»: человек, которому не сказали про `iex`, не
 * поймёт, чем его скрипт плох.
 */
export function check(code: string): Banned[] {
  const lower = code.toLowerCase();
  return BANNED.filter((item) => lower.includes(item.piece));
}

/** Итог проверки — как он звучит на экране. */
export interface Verdict {
  ok: boolean;
  /** Что сказать. Пусто, только если `ok`. */
  said: string;
  /** Что нашли: для подсветки, а не для решения. */
  found: Banned[];
}

export function answer(code: string): Verdict {
  const found = check(code);
  if (found.length === 0) return { ok: true, said: "", found };
  const list = found.map((item) => `«${item.piece.trim()}» — ${item.why}`).join("; ");
  return {
    ok: false,
    said: `в скрипте есть то, чего нельзя: ${list}. Чужой текст без забора не запускается — ничего не выполнялось`,
    found,
  };
}

/**
 * Строка пределов до нажатия: сколько времени и сколько вывода.
 *
 * Именно до нажатия: «снимается через 20 секунд» после запуска — это факт, а до
 * запуска — обещание, по которому человек решает, пробовать ли.
 */
export function limitsLine(got: Limits): string {
  if (got.where === "profile") {
    return `профиль не запускается: он описывает шаги, а не выполняет их`;
  }
  const place = got.where === "cell" ? "в клетке" : "снаружи клетки";
  return `${place}: до ${got.seconds} с, вывод до ${got.output} знаков — дольше не дам, больше не покажу`;
}

/**
 * Насколько стар профиль — и когда это уже «давно».
 *
 * Профиль, проверенный год назад, и профиль, проверенный вчера, — разные
 * обещания: приложение за это время обновилось, и якоря могли съехать.
 */
export const STALE_DAYS = 180;

export function profileAge(verifiedAt: string, now: number): { days: number | null; stale: boolean; said: string } {
  const stamp = Date.parse(verifiedAt);
  if (Number.isNaN(stamp)) {
    return { days: null, stale: true, said: "когда проверяли — не понять: считайте, что давно" };
  }
  const days = Math.floor((now - stamp) / (24 * 60 * 60 * 1000));
  if (days < 0) {
    return { days, stale: true, said: "проверен позже, чем сейчас на часах, — часы машины разошлись" };
  }
  if (days === 0) return { days, stale: false, said: "проверен сегодня" };
  if (days === 1) return { days, stale: false, said: "проверен вчера" };
  if (days < STALE_DAYS) return { days, stale: false, said: `проверен ${days} ${daysWord(days)} назад` };
  return {
    days,
    stale: true,
    said: `проверен ${days} ${daysWord(days)} назад — программа с тех пор могла измениться, якоря могли съехать`,
  };
}

function daysWord(n: number): string {
  const tail = n % 100;
  if (tail >= 11 && tail <= 14) return "дней";
  const last = n % 10;
  if (last === 1) return "день";
  if (last >= 2 && last <= 4) return "дня";
  return "дней";
}

/**
 * Что человеку говорят про профиль до запуска: возраст и стек.
 *
 * «Профиль есть» — не ответ. Ответ — «проверен 40 дней назад, стек UIA, 12 якорей».
 */
export function profileLine(
  profile: { app: string; verified_at: string; ui_stack: string; anchors: number },
  now: number,
): string {
  const age = profileAge(profile.verified_at, now);
  const anchors = profile.anchors === 1 ? "1 якорь" : `${profile.anchors} якорей`;
  return `${profile.app}: ${age.said}, стек ${profile.ui_stack}, ${anchors}`;
}
