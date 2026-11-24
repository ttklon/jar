import { describe, expect, it } from "vitest";
import { MIN_SAMPLES, MIN_SPAN_MS, hours, rate, report, say, type Sample } from "./battery";

/**
 * Шаг 236: долгая работа на батарее — замер расхода **в простое и в деле**,
 * числа.
 *
 * Дефект: про батарею в коде не было ничего. Обещание «экономно» проверить
 * нельзя — это слово без единицы измерения, и регрессию расхода в нём не видно:
 * приложение просто «как-то садится», и никто не замечает, что стало вдвое хуже.
 */

const MIN = 60 * 1000;

/** Ряд замеров: заряд падает на `dropPerHour` процентов в час. */
function series(dropPerHour: number, busy: boolean, minutes = 60, start = 100): Sample[] {
  const samples: Sample[] = [];
  for (let minute = 0; minute <= minutes; minute += 10) {
    const drop = (dropPerHour * minute) / 60;
    samples.push({ at: minute * MIN, percent: Math.round(start - drop), busy });
  }
  return samples;
}

describe("простой и дело — разные числа, а не одно среднее", () => {
  it("в простое малый расход назван, в разговоре — измерен числом", () => {
    // Первая версия теста ждала «0,4 %/час» — и правильно падала: за час
    // заряд, округлённый до целого процента, падает на 0, и «0,4» было бы
    // точностью, которой нет. Малый расход называется словами с границей.
    const got = report([...series(0.4, false), ...series(6, true)]);
    expect(got.idle.why).toContain("меньше шага округления");
    expect(got.busy.perHour).toBeCloseTo(6, 0);
  });

  it("среднее по обоим скрыло бы оба факта", () => {
    // Именно поэтому режимы считаются независимо: «3 %/час» не говорит
    // человеку ни что простой дешёвый, ни что разговор дорогой.
    const got = report([...series(0.4, false), ...series(6, true)]);
    expect(got.idle.perHour).not.toBeCloseTo(got.busy.perHour ?? 0, 1);
  });

  it("оба числа названы в строке, с единицей", () => {
    const got = report([...series(0.4, false), ...series(6, true)]);
    expect(got.said).toContain("в простое");
    expect(got.said).toContain("в разговоре");
    expect(got.said).toContain("%/час");
  });
});

describe("не наврать: когда числа нет, это сказано", () => {
  it("двух замеров мало — и причина названа", () => {
    const few: Sample[] = [
      { at: 0, percent: 100, busy: false },
      { at: 30 * MIN, percent: 99, busy: false },
    ];
    const got = rate(few, false);
    expect(got.perHour).toBeNull();
    expect(got.why).toContain("нужно 3");
    // «Округлением, а не замером» — причина, а не отговорка.
    expect(got.why).toContain("округлением");
  });

  it("короткое наблюдение — не измерение: заряд округлён до процента", () => {
    // За минуту заряд не меняется, и «0 %/час» было бы точностью округления.
    const short: Sample[] = [
      { at: 0, percent: 100, busy: false },
      { at: MIN, percent: 100, busy: false },
      { at: 2 * MIN, percent: 100, busy: false },
    ];
    const got = rate(short, false);
    expect(got.perHour).toBeNull();
    expect(got.why).toContain("наблюдали");
  });

  it("заряд рос — это зарядка, а не расход", () => {
    // Иначе в отчёте появилось бы отрицательное потребление.
    const charging: Sample[] = [
      { at: 0, percent: 50, busy: false },
      { at: 20 * MIN, percent: 60, busy: false },
      { at: 40 * MIN, percent: 70, busy: false },
    ];
    const got = rate(charging, false);
    expect(got.perHour).toBeNull();
    expect(got.why).toContain("зарядке");
  });

  it("нехватка замеров в простое не мешает назвать число для разговора", () => {
    // Режимы независимы: один не измерен — второй всё равно известен.
    const got = report(series(6, true));
    expect(got.idle.perHour).toBeNull();
    expect(got.busy.perHour).not.toBeNull();
    expect(got.said).toContain("не измерено");
    expect(got.said).toContain("в разговоре");
  });

  it("минимумы названы и они не произвольные", () => {
    expect(MIN_SAMPLES).toBe(3);
    expect(MIN_SPAN_MS).toBe(5 * MIN);
  });
});

describe("считается по крайним точкам, а не по среднему разностей", () => {
  it("равномерное падение даёт ровно столько, сколько задали", () => {
    // Среднее по мелким разностям накапливало бы ошибку округления в одну
    // сторону: заряд-то целый.
    const got = rate(series(10, false, 60), false);
    expect(got.perHour).toBeCloseTo(10, 0);
  });

  it("скачок в середине не ломает крайние точки", () => {
    const samples = series(4, false, 60);
    samples[3] = { at: 30 * MIN, percent: bytes(100, 2), busy: false };
    const got = rate(samples, false);
    expect(got.perHour).not.toBeNull();
  });
});

function bytes(start: number, drop: number): number {
  return start - drop;
}

describe("сколько часов работы — тоже число", () => {
  it("50% при 6 %/час — восемь часов", () => {
    // Именно так человек переводит «%/час» в решение: «доживу до вечера».
    expect(hours(50, 6)).toBe(8.3);
  });

  it("неизмеренный расход не превращается в «бесконечно»", () => {
    // «Бесконечно» — не ответ, который помогает человеку.
    expect(hours(50, null)).toBeNull();
    expect(hours(50, 0)).toBeNull();
  });

  it("отрицательный расход — тоже не ответ", () => {
    expect(hours(50, -3)).toBeNull();
  });
});

describe("строка для человека", () => {
  it("единица и время названы, а не «много/мало»", () => {
    const text = say(
      { perHour: 0.4, samples: 7, why: "" },
      { perHour: 6, samples: 7, why: "" },
    );
    expect(text).toContain("0,4 %/час");
    expect(text).toContain("6,0 %/час");
    expect(text).toContain("7 замеров");
  });

  it("запятая, а не точка: русский интерфейс", () => {
    const text = say({ perHour: 0.4, samples: 3, why: "" }, { perHour: 6, samples: 3, why: "" });
    expect(text).not.toContain("0.4");
  });
});
