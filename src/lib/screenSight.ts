/**
 * Шаг 282: Windows Copilot — экран-awareness с явным согласием на сессию.
 *
 * Что взято. Copilot умеет смотреть на экран и отвечать про то, что на нём:
 * «что это за ошибка», «где кнопка». Это настоящая помощь — человеку не надо
 * описывать словами то, что он видит.
 *
 * Что **не** взято, и это главное в шаге:
 *
 *  * **постоянное зрение.** У Copilot взгляд включён, пока включено приложение.
 *    Нам это не подходит: человек не думает о том, что его видят, и забывает.
 *    Поэтому зрение — **сессия**: включил, посмотрел, выключил;
 *  * **запись.** Снимок экрана — это документы, переписка, чужие лица. Мы не
 *    храним кадры: смотрим, отвечаем, забываем. Даже «для отладки» — нельзя,
 *    потому что отладка живёт дольше согласия;
 *  * **молчаливое продление.** Сессия кончается сама, и продолжение — новый
 *    вопрос человеку, а не «вы уже разрешали».
 *
 * И ещё одно, чего у Copilot не подсмотреть: **окно называется**. Перед началом
 * человек видит, **что именно** попадёт в кадр — весь экран или одно окно. «Весь
 * экран» и «это окно» — разная приватность, и выбирать должен он.
 */

/** Что попадает в кадр. */
export type Scope = "window" | "screen";

/** Сессия зрения. */
export interface Session {
  /** Что смотрим. */
  readonly scope: Scope;
  /** Когда началась, мс. */
  readonly at: number;
  /** Когда кончится сама, мс. */
  readonly until: number;
  /** Сколько кадров уже посмотрели: числом, а не «несколько». */
  readonly looks: number;
}

/**
 * Сколько живёт сессия.
 *
 * Две минуты — столько нужно, чтобы показать ошибку и получить ответ. Десять
 * минут — это уже «пусть смотрит, вдруг понадобится», то есть забытое согласие.
 */
export const LIFE_MS = 2 * 60 * 1000;

/**
 * Начать сессию.
 *
 * `null` в `until` невозможен: бессрочного согласия на зрение не бывает.
 */
export function begin(scope: Scope, now: number): { session: Session; said: string } {
  const what = scope === "window" ? "это окно" : "весь экран";
  return {
    session: { scope, at: now, until: now + LIFE_MS, looks: 0 },
    said: `смотрю ${what} две минуты. Кадры не сохраняются. Закончить — в любой момент`,
  };
}

/**
 * Можно ли посмотреть ещё раз.
 *
 * Проверяется **перед каждым** кадром, а не один раз в начале: сессия кончается
 * по времени, и «проверили при старте» — это забытое согласие с таймером.
 */
export function mayLook(session: Session | null, now: number): { ok: boolean; said: string } {
  if (session === null) {
    return { ok: false, said: "зрение выключено: чтобы посмотреть на экран, нужно разрешение на сессию" };
  }
  if (now >= session.until) {
    return { ok: false, said: "сессия кончилась — включите ещё раз, если нужно" };
  }
  return { ok: true, said: "" };
}

/** Отметить кадр: считается, чтобы «сколько раз смотрели» было видно. */
export function looked(session: Session): Session {
  return { ...session, looks: session.looks + 1 };
}

/** Сколько осталось — словами, а не числом секунд. */
export function left(session: Session, now: number): string {
  const rest = session.until - now;
  if (rest <= 0) return "сессия кончилась";
  const seconds = Math.ceil(rest / 1000);
  if (seconds <= 15) return `осталось ${seconds} ${secondsWord(seconds)}`;
  const minutes = Math.ceil(seconds / 60);
  return `осталось ${minutes} ${minutes === 1 ? "минута" : "минуты"}`;
}

/**
 * Что будет, если человек закроет окно с вопросом.
 *
 * Сессия кончается сразу, а не «когда истечёт»: закрытый разговор — это конец
 * разговора, и продолжать смотреть после него незачем.
 */
export function end(session: Session | null, now: number): { session: Session | null; said: string } {
  if (session === null) return { session: null, said: "зрение и так выключено" };
  const looked_ = session.looks;
  void now;
  return {
    session: null,
    said:
      looked_ === 0
        ? "зрение выключено: ни одного кадра не смотрели"
        : `зрение выключено: посмотрели ${looked_} ${timesWord(looked_)} и ничего не сохранили`,
  };
}

/**
 * Что сказать до первого кадра.
 *
 * Согласие на зрение — не «ок», а понимание того, что попадёт в кадр. Поэтому
 * текст называет **содержимое** («там могут быть документы и переписка»), а не
 * только механику.
 */
export function warning(scope: Scope): string {
  const what = scope === "window" ? "только это окно" : "весь экран, включая другие окна и уведомления";
  return `в кадр попадёт ${what}. Там могут быть документы, переписка и чужие имена. Кадры не сохраняются, после ответа зрение выключается`;
}

function secondsWord(seconds: number): string {
  const ten = seconds % 100;
  if (ten >= 11 && ten <= 14) return "секунд";
  const unit = seconds % 10;
  if (unit === 1) return "секунду";
  if (unit >= 2 && unit <= 4) return "секунды";
  return "секунд";
}

function timesWord(times: number): string {
  const ten = times % 100;
  if (ten >= 11 && ten <= 14) return "раз";
  const unit = times % 10;
  if (unit === 1) return "раз";
  if (unit >= 2 && unit <= 4) return "раза";
  return "раз";
}
