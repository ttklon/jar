/**
 * Не запускать два дела, которые делят один движок, без очереди (шаг 137).
 *
 * Дефект. Два дела шли **одновременно**, не зная друг о друге:
 *
 *  * **оба медленнее, чем по очереди**: одно ядро на два дела — это половина
 *    процессора каждому и вдвое дольше оба, вместо быстрого первого и второго следом;
 *  * **соревнование за память**: два ядра (или два больших запроса) не помещаются, и
 *    начинается своп — «зависло», хотя работа жива;
 *  * **дело ждёт, но об этом не сказано**: человек видит «идёт», а на деле второе
 *    стоит в невидимой очереди, и «почему так долго» не имеет ответа;
 *  * **разные движки тоже сталкиваются**: модель и распознавание делят диск и
 *    память — это ресурс, а не имя процесса.
 *
 * Правило: **дела, делящие ресурс, идут по очереди, и очередь названа**.
 *
 *  1. **Ресурс назван**: движок, диск, память. Дело берёт ресурсы, а не «запускается
 *     как-нибудь».
 *  2. **Пересечение — значит очередь**, а не «попробуем вместе»: вместе оба медленнее.
 *  3. **Ожидание названо**: «ждёт движок — впереди «переименовать фото»», а не
 *     неподвижный прогресс.
 *  4. **Очередь честная**: первым идёт тот, кто пришёл первым (FIFO), а не «важный».
 *  5. **Незанятый ресурс не ждёт**: если пересечения нет, оба идут сразу — очередь
 *     ради очереди замедляет.
 *
 * Почему не «запускать всё и надеяться на планировщик». Планировщик делит поровну, а
 * человеку нужно, чтобы **первое** дело кончилось; делёж поровну даёт два
 * незаконченных.
 */

/** Что нужно делу для работы. */
export type Resource = "engine" | "disk" | "memory" | "screen" | "network";

/** Дело с ресурсами. */
export interface Deed {
  /** Чем дело называется — словами. */
  what: string;
  /** Что оно занимает на всё время работы. */
  uses: Resource[];
  /** Когда пришло в очередь — для честного порядка. */
  at: number;
}

/** Что сейчас занято. */
export interface Busy {
  /** Кем занято — чтобы назвать ожидание. */
  by: string;
  uses: Resource[];
}

/** Решение о запуске. */
export interface Decision {
  /** Можно ли начинать сейчас. */
  start: boolean;
  /** Почему нет: кого ждём. */
  waitingFor: string | null;
  /** Что сказать; пусто — говорим только при ожидании. */
  said: string;
}

/**
 * Пересекаются ли ресурсы.
 *
 * Пересечение — значит «вместе медленнее», а не «может быть, повезёт».
 */
export function collide(uses: readonly Resource[], busy: readonly Resource[]): Resource[] {
  return uses.filter((resource) => busy.includes(resource));
}

/**
 * Можно ли запустить дело сейчас.
 *
 * `busy` — все идущие дела; ожидание называется по **первому** из тех, что делят
 * ресурс.
 */
export function decide(deed: Deed, busy: readonly Busy[]): Decision {
  for (const other of busy) {
    const shared = collide(deed.uses, other.uses);
    if (shared.length === 0) continue;
    return {
      start: false,
      waitingFor: other.by,
      // Ожидание названо: неподвижный прогресс не отвечает на «почему долго».
      said: `«${deed.what}» ждёт ${shared.map(nameOf).join(", ")} — сейчас их заняло «${other.by}»`,
    };
  }
  return { start: true, waitingFor: null, said: "" };
}

/** Ресурс словами. */
export function nameOf(resource: Resource): string {
  switch (resource) {
    case "engine":
      return "движок";
    case "disk":
      return "диск";
    case "memory":
      return "память";
    case "screen":
      return "экран";
    case "network":
      return "сеть";
  }
}

/**
 * Порядок очереди — честный.
 *
 * Первым идёт тот, кто пришёл первым. «Важное вперёд» звучит хорошо, но кому решать,
 * что важнее — а голодный хвост хуже, чем медленный первый.
 */
export function order<T extends Deed>(deeds: readonly T[]): T[] {
  return [...deeds].sort((left, right) => left.at - right.at);
}

/**
 * Что можно запустить прямо сейчас — с учётом того, что запущенное займёт ресурсы.
 *
 * Это и есть «не два дела на один движок»: второй в этом проходе не выбирается.
 */
export function ready<T extends Deed>(deeds: readonly T[], busy: readonly Busy[]): { start: T[]; wait: { deed: T; said: string }[] } {
  const taken: Busy[] = [...busy];
  const start: T[] = [];
  const wait: { deed: T; said: string }[] = [];
  for (const deed of order(deeds)) {
    const decision = decide(deed, taken);
    if (decision.start) {
      start.push(deed);
      // Выбранное дело сразу занимает ресурсы — иначе следующий проход выберет
      // второе на тот же движок.
      taken.push({ by: deed.what, uses: deed.uses });
    } else {
      wait.push({ deed, said: decision.said });
    }
  }
  return { start, wait };
}

/**
 * Сколько теряется от совместного запуска.
 *
 * Два дела по 2 с вместе при одном движке — примерно 4 с оба (поровну), а по
 * очереди — 2 с первое и 4 с второе. Числа показывают, почему очередь не хуже.
 */
export function together(ms: number, count: number): number {
  return ms * Math.max(1, count);
}

/** Что сказать про очередь — числом. */
export function queueNote(readyIn: ReturnType<typeof ready<Deed>>): string {
  if (readyIn.start.length === 0) return "ничего не запускаю: все ждут";
  if (readyIn.wait.length === 0) return `идут сразу: ${readyIn.start.map((deed) => deed.what).join(", ")} — ресурсы не пересекаются`;
  return `идут: ${readyIn.start.map((deed) => deed.what).join(", ")}; ждут: ${readyIn.wait.length}`;
}
