/**
 * Аудит опасных рук: что **реально** проверено (шаг 166, блокер №6).
 *
 * Дефект. Журнал (`audit.rs`) писал каждое событие — запрос, подтверждение,
 * запуск, итог — и был честным построчно. Но на вопрос «эта опасная рука
 * действительно работает?» он не отвечал никак: чтобы узнать это, человек листал
 * двадцать строк и складывал в голове. А между «проверено» и «пробовали» лежит
 * вся разница:
 *
 *  * **запросили и отказали** — не проверка. Политика не дала запустить, значит
 *    рука не работала и мы о ней ничего не знаем;
 *  * **спросили человека и не нажали** — тоже не проверка;
 *  * **запустили и получили `ok`** — проверка;
 *  * **запустили и упали** — проверка, и её результат «не работает», а не «не
 *    проверяли»: это разные факты, и второй прячет первый;
 *  * **запустили и получили отказ уже внутри** (`denied`) — тоже факт: рука
 *    отказала, и это надо увидеть, а не списать в «нет данных».
 *
 * Правила:
 *
 *  1. **«проверено» = был запуск**, а не «было событие»: журнал полон событий,
 *     которые ничего не проверяют;
 *  2. **числом:** «запускали 5 раз, из них 4 удачно, последний — вчера»;
 *  3. **опасное — отдельно.** Сначала руки с риском `destructive`, `money`,
 *     `identity`, `external`: именно про них вопрос «а это работает?» важнее
 *     всего;
 *  4. **никогда не запускали — так и сказать**, а не показать пустое место:
 *     «не проверено» и «проверено и работает» — разные обещания;
 *  5. **устаревшее называется устаревшим.** Проверка месячной давности на
 *     сегодняшней программе — не проверка.
 *
 * Модуль не читает файл: события приносит вызывающий. Поэтому правило
 * проверяется без диска и без запусков.
 */

/** Риск — как в реестре. */
export type Risk = "read" | "write-local" | "external" | "destructive" | "identity" | "money";

/** Одно событие журнала — только то, что нужно аудиту. */
export interface Event {
  /** Ключ реестра `domain|verb|object`. */
  subject: string;
  risk: string;
  /** `requested` | `confirmed` | `started` | `finished` | `denied` … */
  kind: string;
  /** `ok`, `error: …`, `denied: …`. */
  outcome: string;
  at_ms: number;
}

/** Что известно про одну руку. */
export interface HandAudit {
  subject: string;
  risk: string;
  /** Сколько раз запускали (событие `started`). */
  started: number;
  /** Сколько запусков закончились удачно. */
  ok: number;
  /** Сколько закончились иначе. */
  failed: number;
  /** Сколько раз политика отказала — это не проверка. */
  denied: number;
  /** Сколько раз просили подтверждение. */
  asked: number;
  /** Когда был последний запуск. `null` — не запускали ни разу. */
  lastRunMs: number | null;
  /** Последний итог: `ok` или текст. */
  lastOutcome: string;
}

/** Что считается запуском: только эти события проверяют руку. */
const RUNS = new Set(["started", "finished"]);

/**
 * Свести события по рукам.
 *
 * Событие `finished` без `started` тоже считается запуском: журнал мог быть
 * обрезан, и «есть итог — значит работало» честнее, чем потерять факт из-за
 * отсутствия начала.
 */
export function audit(events: readonly Event[]): HandAudit[] {
  const map = new Map<string, HandAudit>();

  for (const event of events) {
    const subject = event.subject.trim();
    if (subject.length === 0) continue;
    let row = map.get(subject);
    if (!row) {
      row = {
        subject,
        risk: event.risk,
        started: 0,
        ok: 0,
        failed: 0,
        denied: 0,
        asked: 0,
        lastRunMs: null,
        lastOutcome: "",
      };
      map.set(subject, row);
    }
    // Риск берём самый высокий из встреченных: занизить опасность хуже, чем
    // завысить — от неё зависит, что показывать первым.
    row.risk = higher(row.risk, event.risk);

    if (event.kind === "requested" || event.kind === "confirmed") {
      row.asked += 1;
      continue;
    }
    if (event.kind === "denied" || event.outcome.toLowerCase().startsWith("denied")) {
      // Отказ политики — это не проверка руки.
      row.denied += 1;
      continue;
    }
    if (!RUNS.has(event.kind)) continue;

    // `started` и `finished` — один запуск, а не два: считаем по `started`, а
    // если начало потерялось — по `finished`.
    if (event.kind === "started") row.started += 1;
    if (event.kind === "finished" && row.started === 0) row.started += 1;

    if (event.kind === "finished") {
      if (event.outcome.trim() === "ok") row.ok += 1;
      else row.failed += 1;
      row.lastOutcome = event.outcome;
    }
    if (row.lastRunMs === null || event.at_ms > row.lastRunMs) row.lastRunMs = event.at_ms;
  }

  return [...map.values()];
}

const ORDER: readonly Risk[] = ["read", "write-local", "external", "destructive", "identity", "money"];

function higher(left: string, right: string): string {
  const a = ORDER.indexOf(left as Risk);
  const b = ORDER.indexOf(right as Risk);
  if (a < 0) return right;
  if (b < 0) return left;
  return b > a ? right : left;
}

/** Опасные руки: те, о которых вопрос «работает ли» важнее всего. */
export function dangerous(rows: readonly HandAudit[]): HandAudit[] {
  const risky = rows.filter(
    (row) =>
      row.risk === "destructive" || row.risk === "money" || row.risk === "identity" || row.risk === "external",
  );
  // Сперва те, что действительно пробовали, потом — риск выше, потом — имя.
  return risky.sort((left, right) => {
    const ran = (row: HandAudit) => (row.started > 0 ? 0 : 1);
    if (ran(left) !== ran(right)) return ran(left) - ran(right);
    const risk = ORDER.indexOf(right.risk as Risk) - ORDER.indexOf(left.risk as Risk);
    if (risk !== 0) return risk;
    return left.subject.localeCompare(right.subject);
  });
}

/** Проверка устарела — когда прошло больше этого. */
export const STALE_MS = 30 * 24 * 60 * 60 * 1000;

/** Была ли рука проверена по-настоящему: запуск и известный итог. */
export function checked(row: HandAudit): boolean {
  return row.started > 0 && row.ok + row.failed > 0;
}

/**
 * Одна строка про руку — то, что читается в списке.
 *
 * Порядок: сколько запускали, чем кончилось, когда. «Не проверено» и «проверено»
 * — разные первые слова, потому что это разные обещания.
 */
export function line(row: HandAudit, now: number, stale = STALE_MS): string {
  if (row.started === 0) {
    if (row.denied > 0) {
      return `${row.subject}: не проверено — политика отказала ${row.denied} раз, рука не запускалась`;
    }
    return `${row.subject}: не проверено — запусков не было`;
  }
  const parts: string[] = [`запускали ${row.started} раз`];
  if (row.ok > 0) parts.push(`удачно ${row.ok}`);
  if (row.failed > 0) parts.push(`с ошибкой ${row.failed}`);
  if (row.lastRunMs !== null) {
    const ago = days(row.lastRunMs, now);
    parts.push(`последний — ${ago}`);
    if (now - row.lastRunMs > stale) {
      // Устаревшая проверка — не проверка: программа с тех пор менялась.
      parts.push("проверка старая: с тех пор прошло больше месяца");
    }
  }
  return `${row.subject}: ${parts.join(", ")}`;
}

function days(then: number, now: number): string {
  const ms = Math.max(0, now - then);
  const d = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (d === 0) return "сегодня";
  if (d === 1) return "вчера";
  if (d < 31) return `${d} ${dayWord(d)} назад`;
  const m = Math.floor(d / 30);
  return `${m} ${monthWord(m)} назад`;
}

function dayWord(n: number): string {
  const tail = n % 100;
  if (tail >= 11 && tail <= 14) return "дней";
  const last = n % 10;
  if (last === 1) return "день";
  if (last >= 2 && last <= 4) return "дня";
  return "дней";
}

function monthWord(n: number): string {
  const tail = n % 100;
  if (tail >= 11 && tail <= 14) return "месяцев";
  const last = n % 10;
  if (last === 1) return "месяц";
  if (last >= 2 && last <= 4) return "месяца";
  return "месяцев";
}

/** Сводка: сколько опасных рук проверено, сколько нет. */
export interface Summary {
  risky: number;
  checked: number;
  never: number;
  failed: number;
  said: string;
}

export function summary(rows: readonly HandAudit[]): Summary {
  const risky = dangerous(rows);
  const good = risky.filter((row) => checked(row));
  const never = risky.filter((row) => row.started === 0);
  const failed = good.filter((row) => row.ok === 0);
  if (risky.length === 0) {
    return { risky: 0, checked: 0, never: 0, failed: 0, said: "опасных рук в журнале нет — проверять нечего" };
  }
  return {
    risky: risky.length,
    checked: good.length,
    never: never.length,
    failed: failed.length,
    said: `опасных рук: ${risky.length}, проверено запуском: ${good.length}, ни разу не запускали: ${never.length}`,
  };
}
