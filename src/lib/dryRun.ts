/**
 * Отчёт «что бы это сделало» без исполнения — сухой прогон (шаг 180).
 *
 * Дефект. У плана есть предпросмотр (шаг 101): цель, шаги, риск. Но он отвечает
 * «что будет **делаться**», а не «что **станет**»:
 *
 *  * **сколько** — «переименовать фото» и «переименовать 12 000 фото» выглядят
 *    одинаково, а согласие на неизвестный объём — не согласие;
 *  * **что именно** — «файлы в папке Загрузки» вместо «эти 12 имён»;
 *  * **что останется** — «переместить» в предпросмотре не говорит, появится ли
 *    файл в новом месте или исчезнет со старого;
 *  * **не знаю** и **ничего** — разные ответы: «сколько затронется, неизвестно» —
 *    это честный отказ считать, а «0» — утверждение, которого мы не проверяли.
 *
 * Правило сухого прогона:
 *
 *  1. **ничего не делает.** Ни файла, ни сети, ни реестра: считает по тому, что
 *     принесли, и молчит о том, чего не принесли;
 *  2. **«не знаю» не превращается в «0»** и не прячется: `unknown` — отдельный
 *     ответ, и он мешает кнопке «выполнить» выглядеть обычной;
 *  3. **что станет — словами в прошедшем времени**: «на диске `D:` появится
 *     `a.jpg`, на `C:` его не станет» — это описание **результата**, а не шага;
 *  4. **опасное — сначала сухо и с ценой:** сколько объектов, сколько байт, что
 *     нельзя вернуть;
 *  5. **отчёт читается без плана** — человек, которому показали сухой прогон, не
 *     должен сверяться со списком шагов, чтобы понять, что произойдёт.
 *
 * Модуль нарочно не импортирует `ipc`: сухой прогон не имеет права уметь
 * что-либо вызвать.
 */

/** Что известно о шаге — до запуска. */
export interface Step {
  /** Что делает, словами: «переместить». */
  what: string;
  /** Откуда. Пусто — не применимо. */
  from?: string;
  /** Куда. Пусто — не применимо. */
  to?: string;
  /** Сколько объектов затронет. `null` — неизвестно. */
  count: number | null;
  /** Сколько байт. `null` — неизвестно. */
  bytes: number | null;
  /** Можно ли вернуть. `false` — необратимо. */
  undoable: boolean;
  /** Куда уйдёт — «корзина», «на диск D:». Пусто — останется на месте. */
  lands?: string;
}

/** Что станет, по одному шагу. */
export interface Result {
  /** Строка «что станет» — словами, без кодов реестра. */
  said: string;
  /** Сколько объектов: число или `null`. */
  count: number | null;
  /** Сколько байт: число или `null`. */
  bytes: number | null;
  /** Необратимо ли. */
  irreversible: boolean;
}

/** Итог сухого прогона. */
export interface Report {
  steps: Result[];
  /** Сумма объектов. `null` — хоть один шаг неизвестен. */
  count: number | null;
  /** Сумма байт. `null` — хоть один шаг неизвестен. */
  bytes: number | null;
  /** Необратимых шагов. */
  irreversible: number;
  /** Есть ли неизвестное: `false` — считать можно. */
  unknown: boolean;
  /** Итог словами — его и показывают первым. */
  said: string;
}

function human(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} КБ`;
  const mb = kb / 1024;
  if (mb < 1024) return `${Math.round(mb)} МБ`;
  return `${(mb / 1024).toFixed(2)} ГБ`;
}

/** Что станет после одного шага — до того, как он выполнен. */
export function result(step: Step): Result {
  const count = step.count;
  const bytes = step.bytes;
  const what = step.what.trim().length > 0 ? step.what : "шаг без названия";

  // Оба места названы — говорим о **результате**, а не о действии.
  if (step.from && step.to) {
    const moved = step.lands && step.lands.length > 0 ? `, окажется в ${step.lands}` : "";
    return {
      said: `${what}: ${describe(count)} из ${step.from} перейдёт в ${step.to}${moved}${size(bytes)}`,
      count,
      bytes,
      irreversible: !step.undoable,
    };
  }
  if (step.to && !step.from) {
    return {
      said: `${what}: ${describe(count)} появится в ${step.to}${size(bytes)}`,
      count,
      bytes,
      irreversible: !step.undoable,
    };
  }
  if (step.from && !step.to) {
    const gone = step.undoable ? "уйдёт в корзину" : "исчезнет без возврата";
    return {
      said: `${what}: ${describe(count)} в ${step.from} ${gone}${size(bytes)}`,
      count,
      bytes,
      irreversible: !step.undoable,
    };
  }
  return {
    said: `${what}: затронет ${describe(count)}${size(bytes)}`,
    count,
    bytes,
    irreversible: !step.undoable,
  };
}

/**
 * «12 файлов» и «не знаю, сколько» — разные ответы.
 *
 * Ноль называется нулём: «ничего не затронет» — законный итог, и путать его с
 * «не считали» значит обещать пустоту там, где её никто не проверял.
 */
function describe(count: number | null): string {
  if (count === null) return "неизвестно сколько объектов";
  if (count === 0) return "ничего";
  if (count === 1) return "1 объект";
  return `${count} объектов`;
}

function size(bytes: number | null): string {
  return bytes === null ? " (объём неизвестен)" : bytes > 0 ? ` (${human(bytes)})` : "";
}

/**
 * Свести шаги в отчёт.
 *
 * Сумма неизвестна, если неизвестно **хоть одно** слагаемое: «12 + неизвестно»
 * — это «неизвестно», а не «12».
 */
export function report(steps: readonly Step[]): Report {
  const results = steps.map(result);
  const unknownCount = results.some((item) => item.count === null);
  const unknownBytes = results.some((item) => item.bytes === null);
  const count = unknownCount ? null : results.reduce((sum, item) => sum + (item.count ?? 0), 0);
  const bytes = unknownBytes ? null : results.reduce((sum, item) => sum + (item.bytes ?? 0), 0);
  const irreversible = results.filter((item) => item.irreversible).length;
  const unknown = unknownCount || unknownBytes;

  if (results.length === 0) {
    return {
      steps: [],
      count: 0,
      bytes: 0,
      irreversible: 0,
      unknown: false,
      said: "сухой прогон: делать нечего — в плане нет шагов",
    };
  }

  const parts: string[] = [];
  parts.push(count === null ? "затронется неизвестно сколько объектов" : count === 0 ? "не затронется ничего" : `затронется ${count} объектов`);
  if (bytes !== null && bytes > 0) parts.push(`${human(bytes)}`);
  if (bytes === null) parts.push("объём неизвестен");
  if (irreversible > 0) parts.push(`необратимых шагов ${irreversible} из ${results.length}`);
  if (unknown) parts.push("и это не «0»: неизвестное не считалось, а не оказалось пустым");

  return {
    steps: results,
    count,
    bytes,
    irreversible,
    unknown,
    said: `сухой прогон, ничего не выполнено: ${parts.join(" · ")}`,
  };
}

/**
 * Можно ли выполнять сразу по сухому прогону.
 *
 * Опасное — сначала сухо: если шаг необратим или объём неизвестен, обычная
 * кнопка «выполнить» не должна выглядеть так же, как у безопасного чтения.
 */
export function needsDryFirst(got: Report): { first: boolean; why: string } {
  if (got.steps.length === 0) return { first: false, why: "" };
  if (got.irreversible > 0) {
    return {
      first: true,
      why: `сначала сухо: ${got.irreversible} ${got.irreversible === 1 ? "шаг необратим" : "шага необратимы"} — отменить будет нечем`,
    };
  }
  if (got.unknown) {
    return { first: true, why: "сначала сухо: объём или число объектов неизвестно — согласие на неизвестное это не согласие" };
  }
  return { first: false, why: "" };
}
