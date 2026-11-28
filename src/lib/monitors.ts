/**
 * Шаг 228: мультимонитор, разные DPI — окно и подсказки не уезжают.
 *
 * Почему это частый реальный дефект. Человек ставит ноутбук с масштабом 150%
 * рядом с монитором на 100%. Приложение живёт в **логических** координатах, а
 * Windows отдаёт **физические**, и одно с другим не совпадает по-разному на
 * каждом мониторе. Дальше два следствия, оба видны глазом:
 *
 *  * **окно уезжает** — сохранённая позиция «x = 1600» на мониторе с другим
 *    масштабом оказывается наполовину за краем, а то и вовсе вне всех экранов;
 *  * **подсказка не там** — подсказка к кнопке считается в координатах одного
 *    монитора, а показывается в координатах другого, и появляется на соседнем
 *    экране.
 *
 * Правило модуля: **всё считается в логических координатах того монитора, на
 * котором показывается**, а сохранённое место проверяется на попадание в
 * **объединённую область**. Не попало — окно возвращается на главный монитор, и
 * это говорится, а не делается молча.
 *
 * Чего модуль не делает: не читает систему сам. Мониторы приносит вызывающий:
 * список `{x, y, width, height, scale}` — так правило проверяется без экрана.
 */

/** Один монитор: логическая область и масштаб. */
export interface Monitor {
  /** Логические координаты левого верхнего угла. */
  x: number;
  y: number;
  /** Логические размеры. */
  width: number;
  height: number;
  /** Масштаб: 1 = 100%, 1.5 = 150%. */
  scale: number;
  /** Главный монитор (тот, где панель задач). */
  primary?: boolean;
}

/** Прямоугольник в логических координатах. */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Итог проверки места окна. */
export interface Placed {
  /** Где показывать: всегда влезает в какой-то монитор. */
  box: Box;
  /** Пришлось ли поправить. */
  moved: boolean;
  /** Почему поправили — словами, если поправили. */
  why: string;
}

/**
 * Насколько окно должно быть видно, чтобы считать, что оно «на месте».
 *
 * Не «целиком»: человек вправе сдвинуть окно за край, оставив полосу — это его
 * решение. Но если видно меньше четверти, окно уже не найти, и это не решение,
 * а потеря.
 */
export const VISIBLE_PART = 0.25;

function area(box: Box): number {
  return Math.max(0, box.width) * Math.max(0, box.height);
}

function overlap(a: Box, b: Box): number {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  if (width <= 0 || height <= 0) return 0;
  return width * height;
}

/** Видимая доля окна: сколько его площади попадает хоть на какой-то монитор. */
export function visibleFraction(box: Box, monitors: readonly Monitor[]): number {
  const whole = area(box);
  if (whole === 0) return 0;
  const seen = monitors.reduce((sum, monitor) => sum + overlap(box, monitor), 0);
  // Больше единицы не бывает: мониторы могут перекрываться логически, но окно
  // не может быть видно «на 120%».
  return Math.min(1, seen / whole);
}

/** Главный монитор; если не помечен — первый. */
function primaryOf(monitors: readonly Monitor[]): Monitor | null {
  return monitors.find((monitor) => monitor.primary) ?? monitors[0] ?? null;
}

/**
 * Проверить сохранённое место окна.
 *
 *  * влезает достаточно — оставляем **как есть** (не двигаем чужое решение);
 *  * не влезает — ставим по центру главного монитора и говорим почему.
 *
 * Возврат «как есть» важен: окно, которое двигают при каждом запуске, бесит
 * сильнее, чем окно не там.
 */
export function placeWindow(saved: Box, monitors: readonly Monitor[]): Placed {
  const primary = primaryOf(monitors);
  if (monitors.length === 0) {
    // Мониторов не знаем — не двигаем: догадка о чужих экранах хуже, чем
    // сохранённое место.
    return { box: saved, moved: false, why: "" };
  }
  if (visibleFraction(saved, monitors) >= VISIBLE_PART) {
    return { box: saved, moved: false, why: "" };
  }
  const main = primary!;
  const width = Math.min(saved.width, main.width);
  const height = Math.min(saved.height, main.height);
  return {
    box: {
      x: Math.round(main.x + (main.width - width) / 2),
      y: Math.round(main.y + (main.height - height) / 2),
      width,
      height,
    },
    moved: true,
    why:
      `окно было за пределами экранов (видно ${Math.round(visibleFraction(saved, monitors) * 100)}%) — ` +
      `вернул на главный монитор`,
  };
}

/**
 * Перевести точку **физических** координат в логические для нужного монитора.
 *
 * Windows отдаёт физические координаты рабочего стола, а интерфейс живёт в
 * логических. Ошибка здесь и уводит подсказку на соседний экран: масштаб-то
 * разный.
 */
export function toLogical(point: { x: number; y: number }, monitor: Monitor): { x: number; y: number } {
  const scale = monitor.scale > 0 ? monitor.scale : 1;
  return {
    x: Math.round(monitor.x + (point.x - monitor.x) / scale),
    y: Math.round(monitor.y + (point.y - monitor.y) / scale),
  };
}

/**
 * Куда поставить подсказку, чтобы она не уехала.
 *
 * Подсказка ставится рядом с предметом, но **не выходит за монитор**: у края она
 * переезжает на другую сторону предмета, а не обрезается. И монитор берётся тот,
 * на котором предмет, — иначе она окажется на соседнем экране.
 */
export function hintBox(target: Box, hint: { width: number; height: number }, monitors: readonly Monitor[]): Box {
  if (monitors.length === 0) {
    return { x: target.x, y: target.y + target.height, width: hint.width, height: hint.height };
  }
  // Экран — тот, где цель находится **в основном**, а не первый, с которым она
  // пересекается. Окно у границы мониторов иначе получает подсказку на соседнем
  // экране — ровно тот дефект, ради которого правило и написано.
  const host = monitors.reduce(
    (best, monitor) => (overlap(target, monitor) > overlap(target, best) ? monitor : best),
    primaryOf(monitors)!,
  );
  const right = { x: target.x + target.width, y: target.y };
  const left = { x: target.x - hint.width, y: target.y };
  const below = { x: target.x, y: target.y + target.height };
  const above = { x: target.x, y: target.y - hint.height };

  const fits = (point: { x: number; y: number }): boolean =>
    point.x >= host.x &&
    point.y >= host.y &&
    point.x + hint.width <= host.x + host.width &&
    point.y + hint.height <= host.y + host.height;

  // Порядок предпочтений: справа, слева, снизу, сверху — привычное чтение.
  const found = [right, left, below, above].find(fits) ?? {
    // Никуда не влезает (крошечный монитор): прижимаем внутрь, а не выпускаем.
    x: Math.min(Math.max(target.x, host.x), host.x + host.width - hint.width),
    y: Math.min(Math.max(target.y, host.y), host.y + host.height - hint.height),
  };

  return { x: Math.round(found.x), y: Math.round(found.y), width: hint.width, height: hint.height };
}

/** Строка для журнала: что сделали с окном, если сделали. */
export function describe(placed: Placed): string {
  return placed.moved ? placed.why : "окно на месте";
}
