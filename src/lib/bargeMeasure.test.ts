import { afterEach, describe, expect, it } from "vitest";
import { LIMIT_MS, record, reset, said, settleAfter, useClock, worst } from "./bargeMeasure";

/**
 * Шаг 80: обещание перебивания — числовое, значит и проверка числовая.
 *
 * Правило `barge` существовало само по себе: оно умело считать, но никто не
 * передавал ему замеров. «Замолкаю быстро» оставалось обещанием, а человек
 * чувствует именно задержку.
 *
 * Здесь проверяется замер: от «человек заговорил» до «стало тихо», и отчёт
 * словами правила. Часы подменяемые — иначе тест мерил бы машину, на которой
 * запущен.
 */

let restore: (() => number) | null = null;
let now = 0;

afterEach(() => {
  if (restore !== null) restore();
  restore = null;
  reset();
  now = 0;
});

function freeze(start = 1000) {
  now = start;
  restore = useClock(() => now);
}

describe("замер перебивания (шаг 80)", () => {
  it("замер идёт от звука до тишины, а не от вызова функции", () => {
    freeze(1000);
    record();
    now = 1080;
    const attempt = settleAfter(80);
    expect(attempt).not.toBeNull();
    expect(attempt?.spokenAt).toBe(1000);
    expect(attempt?.silentAt).toBe(1080);
    // Отчёт — словами правила, с числом и вердиктом: «быстро» ничего не меряет.
    expect(said()).toContain("80 мс");
    expect(said()).toContain("в срок");
  });

  it("медленное перебивание названо медленным, а не спрятано", () => {
    freeze(0);
    record();
    settleAfter(LIMIT_MS + 150);
    expect(said()).toContain("медленно");
    expect(said()).toContain(`обещание: не дольше ${LIMIT_MS}`);
    // И оно же стало худшим: обещание про «никогда дольше».
    expect(worst()?.ok).toBe(false);
  });

  it("худший замер важнее последнего", () => {
    freeze(0);
    record();
    settleAfter(400);
    now = 5000;
    record();
    now = 5050;
    settleAfter(50);
    // Последний — быстрый, худший — 400 мс. Показать последний значит соврать
    // про обещание: человек запоминает медленное.
    expect(said()).toContain("50 мс");
    expect(worst()?.line).toContain("400 мс");
    expect(worst()?.ok).toBe(false);
  });

  it("первое перебивание сразу после запуска тоже замеряется", () => {
    // Настоящий дефект, который поймался тестом: «не говорил» было нулём, а
    // `performance.now()` в начале жизни страницы и есть около нуля. То есть
    // самое первое перебивание — то, которое человек и запомнит, — не
    // замерялось бы вовсе.
    freeze(0);
    record();
    now = 90;
    const attempt = settleAfter(90);
    expect(attempt).not.toBeNull();
    expect(attempt?.silentAt).toBe(90);
    expect(said()).toContain("90 мс");
  });

  it("без «человек заговорил» замера нет", () => {
    // Конец обычной фразы — не перебивание: записывать его в статистику
    // значит выдавать тишину за успех.
    freeze(0);
    expect(settleAfter(30)).toBeNull();
    expect(said()).toBeNull();
    expect(worst()).toBeNull();
  });

  it("всё в срок — худший замер всё равно назван числом", () => {
    freeze(0);
    record();
    settleAfter(120);
    expect(worst()?.ok).toBe(true);
    expect(worst()?.line).toContain("120 мс");
    expect(worst()?.line).toContain("в срок");
  });
});
