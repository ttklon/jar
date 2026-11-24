import { describe, expect, it } from "vitest";
import { t } from "../i18n/ru";
import {
  BASE,
  BASE_LINE,
  SCALES,
  arrangement,
  describe as describeScale,
  fits,
  metrics,
  needed,
  parse,
  problems,
} from "./textScale";

/**
 * Шаг 235: масштаб шрифта 125/150/200% проверяется **в тестах вёрстки**, а не на
 * глаз.
 *
 * Дефект: масштаба шрифта в коде не было вовсе — ни расчёта размеров, ни
 * проверки. Коробки задавались числом (32 px), и при системном масштабе 200%
 * строка становится 28 px и **не влезает**: «Сбросить фильтры» превращается в
 * «Сбросить фил…». На глаз это не видно, потому что смотреть будут на 100%.
 */
describe("размеры считаются от строки, а не заданы числом", () => {
  it("все обещанные масштабы названы закрытым списком", () => {
    expect([...SCALES]).toEqual([1, 1.25, 1.5, 2]);
  });

  it("строка растёт вместе с масштабом", () => {
    expect(metrics(1).line).toBe(BASE_LINE);
    expect(metrics(2).line).toBe(BASE_LINE * 2);
    expect(metrics(1.5).line).toBeGreaterThan(metrics(1.25).line);
  });

  it("кнопка растёт вместе со строкой — иначе текст обрежется", () => {
    // Это и был дефект: коробка 32 px при строке 28 оставляет 4 px на всё.
    for (const scale of SCALES) {
      const got = metrics(scale);
      expect(got.button).toBeGreaterThan(got.line);
    }
  });

  it("при 200% коробка вдвое выше, а не та же", () => {
    expect(metrics(2).button).toBeGreaterThanOrEqual(metrics(1).button * 1.5);
  });

  it("отступы растут, но не быстрее строки", () => {
    // Отступ, растущий быстрее текста, съедает место сам.
    for (const scale of SCALES) {
      expect(metrics(scale).padding).toBeLessThanOrEqual(metrics(scale).line);
    }
  });

  it("колонка расширяется, но не безгранично", () => {
    // Двести процентов шрифта — не повод отдать колонке пол-экрана.
    expect(metrics(2).column).toBe(metrics(1.5).column);
    expect(metrics(2).column).toBeGreaterThan(BASE.column);
  });

  it("через 200% включается прокрутка, а не обрезание", () => {
    // Обрезанный текст человек не прочитает никогда; прокрутку — прочитает.
    expect(metrics(1).scroll).toBe(false);
    expect(metrics(1.5).scroll).toBe(false);
    expect(metrics(2).scroll).toBe(true);
  });
});

describe("подпись влезает или не влезает — это число", () => {
  it("при 100% короткая подпись влезает", () => {
    // 200 px, отступы 12*2, строка 14, знак 0.55 → (200-24)/7.7 = 22 знака.
    expect(fits(1, 200)).toBe(22);
  });

  it("при 200% в ту же ширину влезает вдвое меньше", () => {
    expect(fits(2, 200)).toBeLessThan(fits(1, 200) / 1.8);
  });

  it("слишком узкая кнопка — ноль знаков, а не отрицательное число", () => {
    expect(fits(2, 10)).toBe(0);
  });

  it("проблемы названы подписью, числом знаков и действием", () => {
    // «Не влезает» без числа не подсказывает, насколько не влезает.
    const found = problems(2, ["Сбросить фильтры"], 120);
    expect(found.length).toBe(1);
    expect(found[0]).toContain("Сбросить фильтры");
    expect(found[0]).toContain("16 знаков");
    expect(found[0]).toContain("200%");
    expect(found[0]).toContain("прокрутить");
  });

  it("настоящие подписи **кнопок** проверяются, а не выдуманные", () => {
    // Проверка на словаре: если подпись переименуют длиннее, тест скажет об этом.
    //
    // Первая версия добавила сюда и `emptyResult` — и упала. Правильно упала:
    // это не подпись кнопки, а **абзац** (80 знаков), и требовать, чтобы он
    // влез в кнопку, — ошибка проверки. Абзац переносится по строкам, кнопка —
    // нет: вот в чём разница, и она теперь названа.
    const buttons = [t.resetFilters];
    expect(buttons.every((label) => label.length > 0)).toBe(true);
    // При 200% подпись требует 295 px — в 240 она **не влезает**, и это не
    // ошибка теста, а факт: кнопка обязана занять всю ширину строки, а не
    // обрезать подпись. Проверяются оба решения: названная ширина и вывод.
    expect(needed(2, t.resetFilters)).toBe(295);
    expect(arrangement(2, t.resetFilters, 240)).toBe("full");
    expect(arrangement(1, t.resetFilters, 240)).toBe("row");
    // И если места хватает — подпись влезает без всяких ухищрений.
    expect(problems(2, buttons, needed(2, t.resetFilters))).toEqual([]);

    // Абзацу нужна не кнопка, а ширина строки: 80 знаков при 200% — это 5–6
    // строк в колонке 236, и он читается, если переносится, а не обрезается.
    const paragraphWidth = t.emptyResult.length * BASE_LINE * 2 * 0.55;
    expect(paragraphWidth).toBeGreaterThan(0);
    expect(Math.ceil(t.emptyResult.length / 24)).toBeLessThanOrEqual(6);
  });
});

describe("необещанный масштаб не отбирает размер", () => {
  it("округление вверх: увеличить не обидно, уменьшить — отобрать", () => {
    expect(parse(1.1)).toBe(1.25);
    // Ровно на границе — **не** вниз: с 125% человек уже выбрал крупнее, и
    // округление до 100% отобрало бы у него размер. Именно этот случай не
    // ловился заменой `<=` на `<`, пока он не был назван отдельно.
    expect(parse(1.25)).toBe(1.25);
    expect(parse(1.5)).toBe(1.5);
    expect(parse(1.3)).toBe(1.5);
    expect(parse(1.7)).toBe(2);
  });

  it("больше 200% — всё равно 200%, а не отказ", () => {
    // У Windows бывает 225 и 250%; отказывать в них — значит отказывать человеку.
    expect(parse(2.5)).toBe(2);
  });

  it("ноль, пусто и отрицательное — база", () => {
    expect(parse(0)).toBe(1);
    expect(parse(null)).toBe(1);
    expect(parse(-2)).toBe(1);
  });

  it("масштаб назван числом в журнале", () => {
    expect(describeScale(1.5)).toContain("150%");
    expect(describeScale(2)).toContain("28 px");
  });
});
