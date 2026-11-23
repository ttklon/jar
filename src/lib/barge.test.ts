import { describe, expect, it } from "vitest";
import { BARGE_LIMIT_MS, bargeDelay, bargeLine, slowest, withinLimit } from "./barge";

/**
 * Шаг 42: перебивание в пределах 200 мс.
 *
 * Обещание числовое, поэтому и проверка числовая. Без числа «замолчало быстро»
 * ничем не отличается от «замолчало когда-нибудь».
 */
describe("перебивание", () => {
  it("порог назван — это часть обещания, а не настроение", () => {
    expect(BARGE_LIMIT_MS).toBe(200);
  });

  it("считается время от звука до тишины, а не длина вызова", () => {
    // Именно это человек ощущает. Замер одного вызова показывает меньше: звук
    // уже был в буфере, и его надо было выбросить.
    expect(bargeDelay({ spokenAt: 1000, silentAt: 1150 })).toBe(150);
    expect(withinLimit({ spokenAt: 1000, silentAt: 1150 })).toBe(true);
  });

  it("200 мс ровно — в срок, 201 — уже нет", () => {
    // Граница включительная: обещание «не дольше 200».
    expect(withinLimit({ spokenAt: 0, silentAt: 200 })).toBe(true);
    expect(withinLimit({ spokenAt: 0, silentAt: 201 })).toBe(false);
  });

  it("не замолчало — это не «быстро»", () => {
    // Обещание про тишину: тишины не было — обещание не выполнено.
    expect(bargeDelay({ spokenAt: 0, silentAt: null })).toBeNull();
    expect(withinLimit({ spokenAt: 0, silentAt: null })).toBe(false);
    expect(bargeLine({ spokenAt: 0, silentAt: null })).toContain("не замолчало");
  });

  it("сломанный замер не считается успехом", () => {
    // Тишина раньше звука — ошибка в замере, а не «мгновенно». Принять её за
    // успех значит поверить прибору, который врёт.
    expect(bargeDelay({ spokenAt: 500, silentAt: 400 })).toBeNull();
    expect(withinLimit({ spokenAt: 500, silentAt: 400 })).toBe(false);
    expect(bargeLine({ spokenAt: 500, silentAt: 400 })).toContain("замер сломан");
  });

  it("обещание проверяется по худшему случаю, а не по среднему", () => {
    // Среднее скрывает одно медленное перебивание за девятью быстрыми — а
    // человек запоминает именно медленное.
    const attempts = [
      { spokenAt: 0, silentAt: 50 },
      { spokenAt: 0, silentAt: 60 },
      { spokenAt: 0, silentAt: 900 },
      { spokenAt: 0, silentAt: 40 },
    ];
    expect(slowest(attempts)?.silentAt).toBe(900);
    // И незамолчавшее считается хуже любого числа.
    expect(slowest([...attempts, { spokenAt: 0, silentAt: null }])?.silentAt).toBeNull();
  });

  it("в журнале назван факт и число, а не «сработало»", () => {
    expect(bargeLine({ spokenAt: 0, silentAt: 120 })).toBe(
      "замолчало через 120 мс — в срок (обещание: не дольше 200)",
    );
    expect(bargeLine({ spokenAt: 0, silentAt: 400 })).toContain("медленно");
  });
});
