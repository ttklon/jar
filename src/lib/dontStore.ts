/**
 * Шаг 267: отдельно — «не запоминай это»; одна фраза становится исключением.
 *
 * Почему отдельно от удаления (шаг 263). Удаление убирает **уже**
 * записанное — это разбор прошлого. Просьба «не запоминай это» смотрит вперёд:
 * человек говорит её в момент, когда память вот-вот запишет, и ждёт, что
 * запись не случится. Перепутать их значит либо записать и стереть (человек
 * увидит факт, который просил не хранить), либо не записать вовсе (но тогда
 * «не запоминай **это**» станет «не запоминай ничего»).
 *
 * Что значит «это». Не «всё»: фраза «не запоминай, что я открывал D:\\Личное»
 * говорит про одну папку, а не про память вообще. Поэтому исключение
 * **привязано к предмету**: вид и значение. И у исключения есть срок: человек
 * сказал про этот случай, а не про все будущие.
 *
 * Правила:
 *
 *  1. **исключение предметно.** «Не запоминай это» относится к тому факту,
 *     который обсуждается, а не ко всей памяти;
 *  2. **исключение проверяется на записи, а не на экране.** Иначе оно работает
 *     только там, где о нём вспомнили;
 *  3. **исключение не молчит.** Человек должен услышать «хорошо, не запомню»,
 *     а не догадываться по отсутствию факта: отсутствие неотличимо от сбоя;
 *  4. **исключение можно снять** — но только явно, а не «через месяц само».
 */

/** Что человек попросил не запоминать. */
export interface Exception {
  /** Вид: `folder`, `program`, `voice`, `method` — как в памяти. */
  readonly kind: string;
  /** Значение; пусто — «ничего этого вида», но такое требует явного слова. */
  readonly value: string;
  /** Когда сказано. */
  readonly at: number;
  /** Что именно человек сказал — для показа, а не для разбора. */
  readonly said: string;
}

/**
 * Куда просьба относится: к предмету обсуждения, а не ко всей памяти.
 *
 * `subject` — то, что приложение собиралось записать прямо сейчас. Без него
 * «не запоминай это» не имеет предмета, и приложение обязано спросить, а не
 * догадываться.
 */
export function hear(phrase: string, subject: { kind: string; value: string } | null, now: number): { exception: Exception | null; ask: string } {
  if (!wantsNoMemory(phrase)) return { exception: null, ask: "" };

  if (subject === null) {
    // «Это» без предмета: записать нечего, но и решать за человека нельзя.
    return {
      exception: null,
      ask: "хорошо, не запомню — что именно: папку, программу или голос?",
    };
  }

  // Просьба без значения («не запоминай эту папку», а значения нет) — это про
  // вид целиком, и так и записывается: значение пустое, но вид назван.
  return {
    exception: { kind: subject.kind, value: subject.value, at: now, said: phrase.trim() },
    ask: `хорошо, не запомню ${label(subject.kind, subject.value)} — это в память не попадёт`,
  };
}

/**
 * Узнать просьбу.
 *
 * Не «содержит слово запоминай»: «запоминай это всегда» содержит его и значит
 * обратное. Отрицание ищется перед глаголом, а не где-то в строке.
 */
export function wantsNoMemory(phrase: string): boolean {
  const clean = phrase.toLowerCase().replace(/ё/g, "е");
  // «Запоминай» без «не» — просьба запоминать. Проверяем отрицание рядом.
  return /(^|[^а-я])(не\s+(запоминай|запомни|сохраняй|держи в памяти|записывай))/.test(clean);
}

/**
 * Просьба запоминать — обратная и тоже возможная.
 *
 * Нужна, чтобы «запоминай это всегда» не считалось исключением: одна и та же
 * подстрока в обеих фразах, и различие — только в отрицании.
 */
export function wantsMemory(phrase: string): boolean {
  const clean = phrase.toLowerCase().replace(/ё/g, "е");
  return /(^|[^а-я])(запоминай|запомни|сохраняй|записывай)/.test(clean) && !wantsNoMemory(phrase);
}

function label(kind: string, value: string): string {
  if (!value) return `все ${kind}`;
  if (kind === "folder") return `папку ${value}`;
  if (kind === "program") return `программу ${value}`;
  if (kind === "voice") return `голос ${value}`;
  if (kind === "method") return "этот способ";
  return `${kind} ${value}`;
}

/**
 * Можно ли записать факт при таких исключениях.
 *
 * Проверка стоит **на записи**: иначе исключение работает только там, где о нём
 * вспомнили, — то есть нигде.
 */
export function allowed(
  fact: { kind: string; value: string },
  exceptions: readonly Exception[],
): { ok: boolean; because: string } {
  for (const exception of exceptions) {
    if (exception.kind !== fact.kind) continue;
    // Пустое значение — исключение на весь вид (сказано «не запоминай папки»).
    if (exception.value === "" || exception.value === fact.value) {
      return {
        ok: false,
        because: `вы просили не запоминать ${label(exception.kind, exception.value)}`,
      };
    }
  }
  return { ok: true, because: "" };
}

/** Снять исключение — по виду и значению, явным действием. */
export function lift(exceptions: readonly Exception[], kind: string, value: string): Exception[] {
  return exceptions.filter((exception) => !(exception.kind === kind && exception.value === value));
}

/**
 * Сколько исключений и какие — для экрана памяти.
 *
 * Исключения показываются **рядом** с фактами: человек, который забыл, что
 * просил не запоминать, будет искать причину в сбое.
 */
export function summary(exceptions: readonly Exception[]): string {
  if (exceptions.length === 0) return "исключений нет: запоминается всё, что обычно";
  const word = exceptions.length === 1 ? "исключение" : exceptions.length < 5 ? "исключения" : "исключений";
  // В списке сразу видно, что это **запрет**, а не факт: иначе человек прочтёт
  // «папка D:\Личное» и решит, что память её всё-таки хранит — и будет искать
  // сбой там, где всё правильно.
  return `${exceptions.length} ${word}: не запоминать ${exceptions
    .map((exception) => label(exception.kind, exception.value))
    .join(", ")}`;
}

/**
 * Исключение не вечное.
 *
 * Человек говорил про случай, а не про все будущие. Но и «само снимется через
 * месяц» — плохо: тогда причину снова искать. Поэтому срок есть, и о нём
 * сказано заранее.
 */
export const LIFE_MS = 90 * 24 * 60 * 60 * 1000;

/** Действует ли исключение сейчас. */
export function active(exception: Exception, now: number): boolean {
  return now - exception.at <= LIFE_MS;
}

/** Действующие исключения — то, что применяется на записи. */
export function live(exceptions: readonly Exception[], now: number): Exception[] {
  return exceptions.filter((exception) => active(exception, now));
}
