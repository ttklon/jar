/**
 * Масштаб 200%: ничего не обрезается, не уезжает и не прячется (шаг 185).
 *
 * Зачем правило, а не «посмотреть глазами». При 200% на экране 1280 px остаётся
 * 640 px ширины — это уже узкий телефон, при котором боковая лента экранов не
 * помещается рядом с содержимым. Дефект проявляется не как «некрасиво», а как
 * **недоступно**: пункт уехал за край и до него не добраться ни мышью, ни Tab
 * (фокус уводит страницу, но человек этого не видит), а подпись обрезалась так,
 * что пропал смысл.
 *
 * Поэтому проверяемое здесь — измеримое:
 *
 *  * **не шире экрана**. Элемент, чья правая граница дальше ширины окна, при
 *    200% уезжает; это `scrollWidth > clientWidth` на уровне страницы, и по
 *    нему видно переполнение без картинки;
 *  * **не обрезано по высоте** — `scrollHeight > clientHeight` при скрытом
 *    переполнении значит, что текст обрезан, а не «сжат»;
 *  * **не спрятано** — `display: none`, `visibility: hidden`, нулевая площадь:
 *    элемент как будто есть, но его нет;
 *  * **до каждого пункта можно добраться** — пункт, уехавший за край, формально
 *    в DOM есть, и тест «элемент существует» его пропустит. Здесь проверяется,
 *    что рамка элемента **пересекается** с окном.
 *
 * Почему это отдельный модуль, а не код в тесте. Тест в jsdom не считает
 * вёрстку: `getBoundingClientRect` там всегда нули, и «уехал за край» не видно.
 * Настоящая проверка идёт в Chromium (e2e), а здесь — **решение**, которое можно
 * проверить на числах: какие прямоугольники считаются попавшими в окно при
 * заданном масштабе.
 */

/** Прямоугольник в пикселях окна. Как у `DOMRect`, но без лишнего. */
export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

/** Что известно об элементе для решения «доступен ли он при этом масштабе». */
export interface Visible {
  box: Box;
  /** `display: none` или `visibility: hidden` — по вычисленному стилю. */
  hidden: boolean;
  /** `scrollHeight > clientHeight` при `overflow: hidden` — текст обрезан. */
  clipped: boolean;
}

/** Окно, в котором всё должно помещаться. */
export interface Viewport {
  width: number;
  height: number;
}

/**
 * Помещается ли элемент в окно.
 *
 * Пересечение, а не «целиком внутри»: элемент, который шире окна на два пикселя,
 * тоже недоступен справа, но элемент, начавшийся за левым краем, недоступен
 * слева. Достаточно, чтобы видимая часть была **и** пересекалась с окном.
 */
export function fits(item: Visible, viewport: Viewport): boolean {
  if (item.hidden) return false;
  if (item.clipped) return false;
  // Нулевая площадь: точки нет, до неё не добраться.
  if (item.box.width <= 0 || item.box.height <= 0) return false;
  const intersects =
    item.box.right > 0 &&
    item.box.left < viewport.width &&
    item.box.bottom > 0 &&
    item.box.top < viewport.height;
  return intersects;
}

/** Что именно не так — чтобы сообщение называло причину, а не «не помещается». */
export function whyNot(item: Visible, viewport: Viewport): string | null {
  if (item.hidden) return "спрятан";
  if (item.clipped) return "обрезан по высоте";
  if (item.box.width <= 0 || item.box.height <= 0) return "нулевой площади";
  if (item.box.right <= 0 || item.box.left >= viewport.width) return "уехал по горизонтали";
  if (item.box.bottom <= 0 || item.box.top >= viewport.height) return "уехал по вертикали";
  return null;
}

/**
 * Каким становится окно при масштабе.
 *
 * `zoom` — это `1` или `2` (200%). Ширина и высота делятся на масштаб: при 200%
 * в том же физическом окне помещается вдвое меньше точек вёрстки. Это ровно то,
 * что делает браузер, и ровно то, чего не видно в jsdom.
 */
export function viewportAt(zoom: number, width: number, height: number): Viewport {
  const scale = zoom > 0 ? zoom : 1;
  return { width: width / scale, height: height / scale };
}
