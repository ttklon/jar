/**
 * Без сети нет ни одного неуспешного запроса, кроме названного (шаг 220).
 *
 * Дефект. `offline.ts` умеет сказать «этому действию нужна сеть» **до** нажатия.
 * Но обещание строже: при запуске и во время работы без сети не должно быть
 * **ни одного** провалившегося запроса, о котором человек не знал. Запрос,
 * который тихо провалился, — это и есть «приложение куда-то ходило и не
 * сказало»; именно так «работает без сети» превращается в «вроде работает, но
 * иногда подвисает».
 *
 * Правила:
 *
 *  1. **каждый запрос попадает в список** — с адресом и причиной, удачный или
 *     нет. Список без удачных не позволяет ответить на «а оно вообще стучалось?»;
 *  2. **провал обязан быть назван**: либо он про действие, о котором человек
 *     знал (скачивание он сам нажал), либо о нём сказано в интерфейсе. Провал,
 *     которого нет в `named`, — дефект, а не мелочь;
 *  3. **«нет сети» — не ошибка**, а состояние. Поэтому провал по причине
 *     `offline` не считается сбоем, и `verdict` это различает;
 *  4. **свой компьютер — не запрос наружу**: `127.0.0.1` во время работы не
 *     трогаем вовсе, иначе список утонет в локальных пингах и перестанет читаться.
 *
 * Модуль не делает запросов: он учитывает то, что уже случилось.
 */

/** Один запрос — что, куда и чем кончилось. */
export interface Attempt {
  /** Куда: адрес или его хост. */
  where: string;
  /** По чьей воле: запуск приложения, нажатие человека, фон. */
  by: "start" | "press" | "background";
  /** Чем кончилось. */
  result: "ok" | "offline" | "failed";
  /** Что это было — словами для человека. */
  what: string;
}

/** Чем назван провал: действием, о котором человек знал, или строкой на экране. */
export interface Named {
  /** `where` запроса. */
  where: string;
  /** Чем назван: «кнопка Скачать», «строка на экране Модели». */
  how: string;
}

/** Итог разбора. */
export interface Verdict {
  /** Всё ли названо. */
  ok: boolean;
  /** Неназванные провалы — каждый с адресом. */
  silent: Attempt[];
  /** Запросы наружу, сделанные сами, без нажатия. */
  unasked: Attempt[];
  /** Что сказать человеку. */
  said: string;
}

/** Свой компьютер — не «наружу». */
function ours(where: string): boolean {
  return /(^|[/:])(127\.0\.0\.1|localhost|\[::1\])/.test(where);
}

/**
 * Разбор: что осталось неназванным.
 *
 * Отдельно — `unasked`: запрос `start` или `background` **наружу** без сети.
 * Само приложение без сети не должно стучаться вовсе, и если оно стучалось, это
 * не «мелкий провал», а нарушенное обещание «при запуске никуда не ходим».
 */
export function verdict(attempts: readonly Attempt[], named: readonly Named[]): Verdict {
  const outside = attempts.filter((item) => !ours(item.where));
  const failed = outside.filter((item) => item.result !== "ok");
  const keys = new Set(named.map((item) => item.where));

  const silent = failed.filter((item) => !keys.has(item.where));
  const unasked = failed.filter((item) => item.by !== "press");

  if (unasked.length > 0) {
    return {
      ok: false,
      silent,
      unasked,
      said:
        `при запуске и в фоне было ${unasked.length} запросов наружу без нажатия, и они не прошли: ` +
        `${unasked.map((item) => item.where).join(", ")}. Без сети приложение не должно стучаться вовсе`,
    };
  }
  if (silent.length > 0) {
    return {
      ok: false,
      silent,
      unasked,
      said:
        `провалилось ${silent.length} запрос(ов), о которых человеку не сказали: ` +
        `${silent.map((item) => `${item.where} (${item.what})`).join(", ")}. ` +
        "Неназванный провал читается как «всё хорошо» — это и есть тихая ошибка",
    };
  }
  const offline = failed.length;
  if (offline === 0) {
    return { ok: true, silent, unasked, said: "ни одного запроса наружу: без сети приложение не стучалось вовсе" };
  }
  return {
    ok: true,
    silent,
    unasked,
    said:
      `не прошло ${offline} запрос(ов), и каждый назван человеку до нажатия: ` +
      `${named.map((item) => `${item.where} — ${item.how}`).join("; ")}`,
  };
}

/**
 * Список для человека: что, куда, по чьей воле и чем кончилось.
 *
 * Одна строка на запрос. Сортировки нет нарочно: порядок — это порядок
 * случившегося, и перестановка по алфавиту спрятала бы первое, что стукнулось
 * при запуске.
 */
export function lines(attempts: readonly Attempt[]): string[] {
  return attempts.map((item) => {
    const who = item.by === "press" ? "по нажатию" : item.by === "start" ? "при запуске" : "в фоне";
    const result = item.result === "ok" ? "прошёл" : item.result === "offline" ? "не прошёл: нет сети" : "не прошёл";
    return `${who}: ${item.what} → ${item.where} — ${result}`;
  });
}

/**
 * Сбывшееся обещание словами — для экрана.
 *
 * `null`, когда обещание нарушено: показывать «всё хорошо» рядом с нарушением
 * значит учить не читать его.
 */
export function promise(attempts: readonly Attempt[], named: readonly Named[]): string | null {
  const got = verdict(attempts, named);
  return got.ok ? got.said : null;
}

/**
 * Сколько запросов было при запуске.
 *
 * Число, а не фраза: «при запуске никуда не ходим» проверяется нулём, и этот
 * ноль должен быть видно, а не выводиться из отсутствия строк.
 */
export function atStart(attempts: readonly Attempt[]): number {
  return attempts.filter((item) => item.by === "start" && !ours(item.where)).length;
}
