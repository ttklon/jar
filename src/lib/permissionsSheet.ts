/**
 * Кнопка «покажи, что тебе разрешено» — на одном экране (шаг 179).
 *
 * Дефект. Граница прав есть, но она **разрезана на пять мест**:
 *
 *  * согласия по каналам (микрофон, сеть, файлы) — в разделе «Согласия»;
 *  * разрешённые папки — в «Где можно работать»;
 *  * список разрешённых хостов — в `networkAllow` (и там он про шаг, а не про «что
 *    вообще можно»);
 *  * режим «работать без меня» и очередь — на голосовом экране;
 *  * «чего не делаю никогда» — в конце другой секции.
 *
 * Человек, которого спрашивают «а что тебе вообще можно?», должен обойти пять
 * мест и сложить ответ в голове. Сложенное в голове не проверяется: половину
 * забывают.
 *
 * Правила:
 *
 *  1. **один экран, четыре ответа**: что разрешено, что ждёт слова, что
 *     запрещено, чего нет вовсе. Не «список галочек», а именно четыре исхода;
 *  2. **каждое «да» называет срок.** Разрешение без срока — не разрешение, а
 *     «пока не отменили»; поэтому дата рядом с каждым каналом;
 *  3. **каждое «нет» называет, где срабатывает** — `proof`, а не обещание;
 *  4. **незнание — отдельный исход.** «Не спрашивали» — не «нет» и не «да»: если
 *     человек не давал согласия, ответ «нет», а «почему нет» — «согласия не давали»;
 *  5. **пусто — тоже ответ.** Нет выбранных папок — «ни одной: шаг не выйдет за
 *     выбранное»; разрешить «всё» нельзя, потому что такой кнопки нет.
 *
 * Модуль не знает про React и хранилище: он складывает уже известные факты.
 */

/** Что человек разрешил по каналу. */
export interface Grant {
  /** `mic` | `net` | `files`. */
  channel: string;
  /** Название для человека. */
  title: string;
  /** Когда разрешено, мс. `null` — не разрешали. */
  at: number | null;
  /** Когда отозвано, мс. `null` — не отзывали. */
  revokedAt: number | null;
}

/** Что показывать про канал. */
export interface Channel {
  title: string;
  /** `yes` | `no` | `never-given`. */
  state: "yes" | "no" | "never-given";
  /** Строка для экрана. */
  said: string;
}

/** Четыре исхода разрешения. */
export type Kind = "allowed" | "waiting" | "forbidden" | "absent";

/** Одна строка сводки. */
export interface RowLine {
  kind: Kind;
  /** Заголовок группы — «разрешено», «ждёт вашего слова»… */
  group: string;
  /** Что именно. */
  what: string;
  /** Чем это видно или когда кончится. */
  detail: string;
}

function date(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Согласия по каналам — с датой и честным «не давали».
 *
 * Отозванное согласие — не «нет»: важно, что оно **было** и когда кончилось;
 * иначе человек не отличит «я отозвал» от «я не давал».
 */
export function channels(grants: readonly Grant[]): Channel[] {
  return grants.map((grant) => {
    if (grant.revokedAt !== null) {
      return {
        title: grant.title,
        state: "no",
        said: `${grant.title}: отозвано ${date(grant.revokedAt)}${grant.at !== null ? ` — до этого было разрешено ${date(grant.at)}` : ""}`,
      };
    }
    if (grant.at === null) {
      return { title: grant.title, state: "never-given", said: `${grant.title}: не разрешён — согласия не давали` };
    }
    return { title: grant.title, state: "yes", said: `${grant.title}: разрешён ${date(grant.at)}` };
  });
}

/** Что известно про папки. */
export interface Folders {
  /** Разрешённые папки. */
  allow: readonly string[];
  /** Исключения внутри разрешённых. */
  except: readonly string[];
}

/**
 * Сводка «что тебе разрешено» — одним списком из четырёх групп.
 *
 * Порядок групп — от «можно» к «нельзя»: человек чаще спрашивает «что можно», и
 * ответ не должен начинаться с запретов, которые он и так знает.
 */
export function sheet(input: {
  grants: readonly Grant[];
  folders: Folders;
  hosts: readonly string[];
  /** Согласие «на это дело» — действует до, мс. `null` — нет. */
  deed: { key: string; until: number } | null;
  /** Что не делается никогда (из `rights`). */
  never: readonly { what: string; proof: string }[];
  now: number;
}): RowLine[] {
  const rows: RowLine[] = [];

  // 1. Разрешено — с датой и сроком.
  for (const channel of channels(input.grants)) {
    if (channel.state !== "yes") continue;
    rows.push({ kind: "allowed", group: "разрешено", what: channel.title, detail: channel.said });
  }
  for (const host of input.hosts) {
    rows.push({
      kind: "allowed",
      group: "разрешено",
      what: `сеть: ${host}`,
      detail: `разрешено: скачивание только с ${host} и его поддоменов`,
    });
  }
  for (const folder of input.folders.allow) {
    const except = input.folders.except.filter((item) => item.startsWith(folder));
    rows.push({
      kind: "allowed",
      group: "разрешено",
      what: `файлы: ${folder}`,
      detail:
        except.length > 0
          ? `внутри неё закрыто: ${except.join(", ")}`
          : "внутри неё можно; за её пределы шаг не выйдет",
    });
  }
  if (input.deed !== null && input.deed.until > input.now) {
    rows.push({
      kind: "allowed",
      group: "разрешено",
      what: `дело «${input.deed.key}»`,
      detail: `вне списка папок, только это дело и только до ${date(input.deed.until)}`,
    });
  }

  // 2. Ждёт слова — то, что будет спрошено, а не то, что уже можно.
  rows.push({
    kind: "waiting",
    group: "ждёт вашего слова",
    what: "опасное и внешнее",
    detail: "подтверждение на один шаг: `write-local`, `external`, `destructive` — каждое отдельно",
  });

  // 3. Запрещено политикой.
  for (const rule of input.never) {
    rows.push({ kind: "forbidden", group: "не делаю никогда", what: rule.what, detail: rule.proof });
  }

  // 4. Чего нет вовсе — и это не запрет, а отсутствие кнопки.
  if (input.folders.allow.length === 0) {
    rows.push({
      kind: "absent",
      group: "нет вовсе",
      what: "разрешённые папки",
      detail: "ни одной не выбрано: шаг не выйдет за выбранное, а «разрешить всё» кнопки нет",
    });
  }
  const never = channels(input.grants).filter((channel) => channel.state === "never-given");
  for (const channel of never) {
    rows.push({ kind: "absent", group: "нет вовсе", what: channel.title, detail: channel.said });
  }

  return rows;
}

/**
 * Сводка одной строкой — для кнопки и для тех, кто не будет читать список.
 *
 * «Разрешено 2, ждёт слова 1, запрещено 6, нет вовсе 1» — ответ, который можно
 * проверить, в отличие от «всё под контролем».
 */
export function summary(rows: readonly RowLine[]): string {
  const count = (kind: Kind) => rows.filter((row) => row.kind === kind).length;
  const parts: string[] = [];
  if (count("allowed") > 0) parts.push(`разрешено ${count("allowed")}`);
  if (count("waiting") > 0) parts.push(`ждёт вашего слова ${count("waiting")}`);
  if (count("forbidden") > 0) parts.push(`не делаю никогда ${count("forbidden")}`);
  if (count("absent") > 0) parts.push(`нет вовсе ${count("absent")}`);
  return parts.length > 0 ? parts.join(" · ") : "не разрешено ничего и не запрещено ничего — такого не бывает";
}

/**
 * Можно ли считать, что экран отвечает на вопрос.
 *
 * Пустой список — не «всё хорошо»: это значит, что сводка не собралась, и
 * показывать «ничего не разрешено» вместо неё значит врать.
 */
export function filled(rows: readonly RowLine[]): boolean {
  return rows.length > 0 && rows.some((row) => row.kind === "allowed" || row.kind === "forbidden");
}
