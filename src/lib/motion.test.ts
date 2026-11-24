import { describe, expect, it } from "vitest";
import { apply, ATTR, attribute, CSS, NORMAL, said, STILL } from "./motion";

/**
 * Шаг 187: уменьшение движения — не вычислено, а применено.
 *
 * Настройка, которая осталась переменной в `app.tsx`, ничего не меняет: человек
 * включил её в Windows и продолжил смотреть анимации.
 */

describe("один атрибут на корне, а не сорок пропов", () => {
  it("выключено — still, обычно — normal", () => {
    expect(attribute(true)).toEqual({ name: ATTR, value: STILL });
    expect(attribute(false)).toEqual({ name: ATTR, value: NORMAL });
  });

  it("применяется и снимается", () => {
    const attrs: Record<string, string> = {};
    const root = {
      setAttribute: (name: string, value: string) => {
        attrs[name] = value;
      },
      removeAttribute: (name: string) => {
        delete attrs[name];
      },
    };
    const undo = apply(root, true);
    expect(attrs).toEqual({ [ATTR]: STILL });
    undo();
    // Сняли за собой: иначе настройка протекла бы на следующий экран.
    expect(attrs).toEqual({});
  });
});

describe("выключить, а не замедлить", () => {
  it("и анимации, и переходы, и прокрутка — три вещи, а не одна", () => {
    expect(CSS).toContain("animation-duration: 0.01ms");
    expect(CSS).toContain("transition-duration: 0.01ms");
    expect(CSS).toContain("scroll-behavior: auto");
  });

  it("повтор анимации снят: пульсация не должна стать чаще", () => {
    // Быстрая анимация вместо медленной — не «выключает», а ускоряет мигание.
    expect(CSS).toContain("animation-iteration-count: 1 !important");
  });

  it("правило привязано к атрибуту, а не к классу в сорока местах", () => {
    expect(CSS).toContain(`[${ATTR}="${STILL}"]`);
  });
});

describe("человеку сказано, что его услышали", () => {
  it("и что именно выключено, и что это не «замедлено»", () => {
    expect(said(true)).toContain("выключены полностью, а не замедлены");
    expect(said(true)).toContain("плавная прокрутка");
  });

  it("выключенная настройка названа тоже", () => {
    expect(said(false)).toBe("уменьшение движения выключено: анимации как обычно");
  });
});
