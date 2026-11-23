import { describe, expect, it } from "vitest";
import { fits, viewportAt, whyNot, type Visible } from "./zoom";

/**
 * Шаг 185: масштаб 200% ничего не отнимает.
 *
 * Блокер №7 — не «некрасиво», а «недоступно». Каждая проверка здесь — про
 * конкретный способ потерять пункт: спрятать, обрезать, уехать за край, сжать в
 * точку. И про то, что причина называется словом, а не сообщением «не
 * помещается».
 */
const box = (left: number, top: number, width: number, height: number) => ({
  left,
  top,
  right: left + width,
  bottom: top + height,
  width,
  height,
});

const item = (over: Partial<Visible> = {}): Visible => ({
  box: box(10, 10, 120, 44),
  hidden: false,
  clipped: false,
  ...over,
});

describe("всё видно при 200%", () => {
  it("обычный пункт помещается", () => {
    // Окно 1280×720 при 200% — это 640×360 точек вёрстки, как узкий телефон.
    const viewport = viewportAt(2, 1280, 720);
    expect(viewport).toEqual({ width: 640, height: 360 });
    expect(fits(item(), viewport)).toBe(true);
  });

  it("уехавший за правый край — не помещается, и причина названа", () => {
    // Именно так выглядит лента, которая при 200% осталась 240 px шириной:
    // она за краем, и до неё не добраться ни мышью, ни Tab.
    const viewport = viewportAt(2, 1280, 720);
    const moved = item({ box: box(700, 10, 120, 44) });
    expect(fits(moved, viewport)).toBe(false);
    expect(whyNot(moved, viewport)).toBe("уехал по горизонтали");
  });

  it("обрезанный по высоте — не помещается: это потерянный смысл подписи", () => {
    const viewport = viewportAt(2, 1280, 720);
    const clipped = item({ clipped: true });
    expect(fits(clipped, viewport)).toBe(false);
    expect(whyNot(clipped, viewport)).toBe("обрезан по высоте");
  });

  it("спрятанный и нулевой площади — не помещается, хотя в DOM есть", () => {
    // «Элемент существует» — не то же, что «до него можно добраться».
    const viewport = viewportAt(2, 1280, 720);
    expect(fits(item({ hidden: true }), viewport)).toBe(false);
    expect(whyNot(item({ hidden: true }), viewport)).toBe("спрятан");
    const zero = item({ box: box(10, 10, 0, 0) });
    expect(fits(zero, viewport)).toBe(false);
    expect(whyNot(zero, viewport)).toBe("нулевой площади");
  });

  it("элемент, который шире окна, всё равно доступен, если его начало видно", () => {
    // Лента в 700 px при окне 640: правый край за окном, но левая часть и
    // подписи видны, и до пункта можно добраться. Требовать «целиком внутри»
    // значило бы валить вёрстку, которая работает.
    const viewport = viewportAt(2, 1280, 720);
    expect(fits(item({ box: box(0, 10, 700, 44) }), viewport)).toBe(true);
  });

  it("сообщение говорит, что не так, а не «не помещается»", () => {
    const viewport = viewportAt(2, 1280, 720);
    expect(whyNot(item(), viewport)).toBeNull();
    // И масштаб 1 — то же окно: правило одно, а не «частный случай 200%».
    expect(viewportAt(1, 1280, 720)).toEqual({ width: 1280, height: 720 });
  });
});
