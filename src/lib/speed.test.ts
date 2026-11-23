import { describe, expect, it } from "vitest";
import {
  measure,
  MIN_TOKENS,
  say,
  speedWord,
  stale,
  STALE_MS,
  TOKENS_PER_WORD,
  usable,
  waitMs,
  waitWord,
} from "./speed";

/**
 * Шаг 65: замер на этой машине, а не по паспорту.
 *
 * Человеку нужно знать, сколько ждать, — и ждёт он дважды: до первого токена и
 * пока идёт ответ.
 */
describe("пуск и скорость — разные числа", () => {
  it("меряются оба, а не одно", () => {
    // Пять секунд тишины человек считает зависанием, даже если потом ответ идёт
    // бойко.
    const speed = measure(1500, 3500, 41, 0);
    expect(speed?.firstTokenMs).toBe(1500);
    expect(speed?.perSecond).toBe(20);
  });

  it("замер по событиям движка, а не таймер вокруг вызова", () => {
    // Таймер вокруг включает загрузку модели, и цифра перестаёт быть про счёт.
    expect(measure(0, 1000, 11, 0)?.perSecond).toBe(10);
  });

  it("слишком короткий прогон не выдаётся за замер", () => {
    // Один медленный токен сдвинет всю цифру.
    expect(measure(0, 1000, MIN_TOKENS - 1, 0)).toBeNull();
    expect(measure(0, 0, 50, 0)).toBeNull();
  });
});

describe("сколько ждать — то, что человек хочет знать", () => {
  const speed = measure(1000, 4000, 61, 0)!;

  it("ожидание складывается из пуска и остального", () => {
    // «Сколько ждать» отвечает на вопрос, а «токенов в секунду» — нет.
    const fast = measure(100, 2100, 41, 0)!;
    expect(waitMs(speed, 10)).toBeGreaterThan(waitMs(fast, 10));
  });

  it("короткий ответ меряется пуском, длинный — скоростью", () => {
    // Один токен — почти только пауза.
    expect(waitMs(speed, 1)).toBeLessThan(waitMs(speed, 50));
  });

  it("ожидание называется секундами, а не миллисекундами", () => {
    expect(waitWord(400)).toBe("меньше секунды");
    expect(waitWord(2100)).toContain("2 секунд");
    expect(waitWord(9000)).toContain("долго");
  });

  it("долгое ожидание названо долгим, а не «около»", () => {
    // Притворяться, что всё хорошо, значит потерять доверие.
    expect(waitWord(12_000)).toContain("поменьше");
  });
});

describe("единицы честные: слово — не токен", () => {
  it("скорость переводится в слова", () => {
    // «20 ток/с» звучит быстрее, чем читается: русское слово — это 2–3 токена.
    const speed = measure(0, 1000, 21, 0)!;
    const said = speedWord(speed);
    expect(said).toContain("слов в секунду");
    expect(said).toContain(String(TOKENS_PER_WORD));
  });

  it("пересчёт не выдумывает больше, чем есть", () => {
    const speed = measure(0, 1000, 21, 0)!;
    // 20 ток/с / 2.5 = 8 слов в секунду.
    expect(speedWord(speed)).toContain("8");
  });
});

describe("замер не обещает, что так будет всегда", () => {
  it("первый прогон выбрасывается — он читает модель с диска", () => {
    // Иначе человек получает заниженную цифру и разочарование от неё.
    const cold = measure(5000, 9000, 41, 0);
    expect(usable(cold, false)).toBeNull();
    expect(usable(cold, true)).toBe(cold);
  });

  it("старый замер не про сегодняшний день", () => {
    // Закрыли браузер, включили экономию — машина уже другая.
    const speed = measure(0, 1000, 21, 0)!;
    expect(stale(speed, STALE_MS + 1)).toBe(true);
    expect(stale(speed, STALE_MS - 1)).toBe(false);
  });

  it("сказано, на какой машине и когда", () => {
    // Без этого цифра выглядит обещанием.
    const speed = measure(1200, 3200, 41, 0)!;
    const said = say(speed, 60 * 60 * 1000);
    expect(said).toContain("на этой машине");
    expect(said).toContain("1 ч назад");
    expect(said).toContain("первый токен");
  });
});
