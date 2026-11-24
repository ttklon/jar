import { describe, expect, it } from "vitest";
import {
  VISIBLE_PART,
  describe as describePlaced,
  hintBox,
  placeWindow,
  toLogical,
  visibleFraction,
  type Monitor,
} from "./monitors";

/**
 * Шаг 228: мультимонитор, разные DPI — окно и подсказки не уезжают.
 *
 * Дефект частый и потому обидный: интерфейс живёт в логических координатах, а
 * система отдаёт физические, и расхождение на каждом мониторе своё. Окно
 * оказывается за краем, подсказка — на соседнем экране, и человек видит не
 * ошибку, а «оно куда-то делось».
 */

/** Ноутбук 150% слева, монитор 100% справа. */
const LAPTOP: Monitor = { x: 0, y: 0, width: 1280, height: 800, scale: 1.5, primary: true };
const MONITOR: Monitor = { x: 1280, y: 0, width: 1920, height: 1080, scale: 1 };
const BOTH = [LAPTOP, MONITOR];

describe("окно помнит место и не уезжает", () => {
  it("сохранённое место в пределах экрана — не трогаем", () => {
    // Окно, которое двигают при каждом запуске, бесит сильнее, чем окно не там.
    const saved = { x: 100, y: 100, width: 900, height: 700 };
    const placed = placeWindow(saved, BOTH);
    expect(placed.moved).toBe(false);
    expect(placed.box).toEqual(saved);
    expect(describePlaced(placed)).toBe("окно на месте");
  });

  it("окно монитора, который отключили, возвращается на главный", () => {
    // Классика: работал с внешним монитором, вернулся без него — окно вне всех
    // экранов, и приложение «не запускается».
    const saved = { x: 3000, y: 200, width: 900, height: 700 };
    const placed = placeWindow(saved, [LAPTOP]);
    expect(placed.moved).toBe(true);
    expect(visibleFraction(placed.box, [LAPTOP])).toBe(1);
    expect(placed.why).toContain("за пределами экранов");
  });

  it("и это сказано с числом, а не молча", () => {
    const placed = placeWindow({ x: 3000, y: 0, width: 800, height: 600 }, [LAPTOP]);
    // Молчаливый перенос — сюрприз; человек должен знать, что окно вернули.
    expect(placed.why).toContain("%");
  });

  it("частично видимое окно (четверть) оставляем: это решение человека", () => {
    // Вправе сдвинуть за край, оставив полосу. Двигать — отнимать решение.
    const saved = { x: 1120, y: 0, width: 640, height: 400 }; // 160 из 640 видны = 25%
    expect(visibleFraction(saved, [LAPTOP])).toBeGreaterThanOrEqual(VISIBLE_PART);
    expect(placeWindow(saved, [LAPTOP]).moved).toBe(false);
  });

  it("окно, у которого видно меньше четверти, — уже не найти", () => {
    const saved = { x: 1260, y: 0, width: 800, height: 600 }; // 20 из 800
    expect(placeWindow(saved, [LAPTOP]).moved).toBe(true);
  });

  it("мониторов не знаем — не двигаем: догадка хуже сохранённого", () => {
    const saved = { x: 10, y: 10, width: 800, height: 600 };
    const placed = placeWindow(saved, []);
    expect(placed.moved).toBe(false);
    expect(placed.box).toEqual(saved);
  });

  it("окно больше монитора ужимается, а не вылезает", () => {
    const saved = { x: 5000, y: 5000, width: 4000, height: 3000 };
    const placed = placeWindow(saved, [LAPTOP]);
    expect(placed.box.width).toBeLessThanOrEqual(LAPTOP.width);
    expect(placed.box.height).toBeLessThanOrEqual(LAPTOP.height);
  });
});

describe("подсказка на том же мониторе, что и предмет", () => {
  it("обычное место — справа от предмета", () => {
    const target = { x: 100, y: 100, width: 80, height: 30 };
    const hint = hintBox(target, { width: 200, height: 60 }, BOTH);
    expect(hint.x).toBe(180);
    expect(hint.y).toBe(100);
  });

  it("у правого края подсказка переезжает влево, а не за экран", () => {
    // Это и есть «уехала»: обрезанная подсказка не читается.
    const target = { x: 1200, y: 100, width: 60, height: 30 };
    const hint = hintBox(target, { width: 200, height: 60 }, [LAPTOP]);
    expect(hint.x).toBe(1000); // 1200 - 200
    expect(hint.x + hint.width).toBeLessThanOrEqual(LAPTOP.width);
  });

  it("предмет на втором мониторе — подсказка тоже там", () => {
    // Разные DPI: подсказка, посчитанная в координатах первого монитора,
    // появляется на соседнем экране.
    const target = { x: 1300, y: 100, width: 80, height: 30 };
    const hint = hintBox(target, { width: 200, height: 60 }, BOTH);
    expect(hint.x).toBeGreaterThanOrEqual(MONITOR.x);
    expect(hint.x).toBe(1380);
  });

  it("у нижнего края подсказка уходит наверх", () => {
    const target = { x: 100, y: 760, width: 80, height: 30 };
    const hint = hintBox(target, { width: 200, height: 60 }, [LAPTOP]);
    expect(hint.y + hint.height).toBeLessThanOrEqual(LAPTOP.height);
  });

  it("крошечный монитор: подсказка прижимается внутрь, а не выпускается", () => {
    const tiny: Monitor = { x: 0, y: 0, width: 150, height: 90, scale: 1, primary: true };
    const hint = hintBox({ x: 10, y: 10, width: 40, height: 20 }, { width: 120, height: 50 }, [tiny]);
    expect(hint.x).toBeGreaterThanOrEqual(0);
    expect(hint.y).toBeGreaterThanOrEqual(0);
  });
});

describe("физические координаты не путаются с логическими", () => {
  it("на 150% точка переводится делением, а не как есть", () => {
    // Ошибка здесь и уводит подсказку на соседний экран.
    expect(toLogical({ x: 300, y: 150 }, LAPTOP)).toEqual({ x: 200, y: 100 });
  });

  it("на 100% координаты не меняются", () => {
    expect(toLogical({ x: 1400, y: 300 }, MONITOR)).toEqual({ x: 1400, y: 300 });
  });

  it("отсчёт идёт от начала монитора, а не от нуля", () => {
    // Второй монитор начинается с x = 1280: забыть это — значит сдвинуть всё
    // на ширину первого.
    expect(toLogical({ x: 1480, y: 100 }, MONITOR)).toEqual({ x: 1480, y: 100 });
  });

  it("нулевой масштаб не роняет: делится на единицу", () => {
    // Масштаб 0 — это не «увеличить до бесконечности».
    const broken: Monitor = { x: 0, y: 0, width: 800, height: 600, scale: 0 };
    expect(toLogical({ x: 100, y: 100 }, broken)).toEqual({ x: 100, y: 100 });
  });
});
