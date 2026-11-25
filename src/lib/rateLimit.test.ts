import { describe, expect, it } from "vitest";
import { PER_HOUR, afterLimit, mayRun, notFor, state, type Run } from "./rateLimit";

/**
 * Шаг 335: ограничение частоты — не чаще N раз в час. Защита от петли.
 *
 * Правило «на файл — разложить» не должно раскладывать свои же отчёты десять тысяч раз.
 */

const NOW = 1_000_000;
const run = (minutesAgo: number, selfCaused = false): Run => ({ at: NOW - minutesAgo, selfCaused });

describe("жёсткий предел — предохранитель, а не оптимизация", () => {
  it("шесть в час — предел", () => {
    expect(PER_HOUR).toBe(6);
    const runs = [5, 10, 15, 20, 25, 30].map((m) => run(m));
    const got = mayRun(runs, NOW);
    expect(got.ok).toBe(false);
    expect(got.said).toContain("лимит частоты");
  });

  it("пять в час — можно", () => {
    const runs = [5, 10, 15, 20, 25].map((m) => run(m));
    expect(mayRun(runs, NOW).ok).toBe(true);
  });

  it("старые запуски лимит не держат", () => {
    const runs = [5, 10, 15, 20, 25, 90].map((m) => run(m));
    expect(mayRun(runs, NOW).ok).toBe(true);
  });

  it("в строке видно, сколько израсходовано", () => {
    expect(state([run(5), run(10)], NOW)).toBe("за последний час 2 из 6");
    expect(state([], NOW)).toBe("за последний час не запускалось");
  });
});

describe("петля узнаётся по причине, а не по количеству", () => {
  it("три своих же запуска подряд — петля", () => {
    const runs = [run(5, true), run(3, true), run(1, true)];
    const got = mayRun(runs, NOW);
    expect(got.ok).toBe(false);
    expect(got.said).toContain("это петля, а не работа");
  });

  it("два своих и один чужой — ещё не петля", () => {
    expect(mayRun([run(5, true), run(3, true), run(1, false)], NOW).ok).toBe(true);
  });

  it("петля ставит на паузу и говорит, что проверить", () => {
    const got = afterLimit("раскладка файлов", "loop");
    expect(got).toContain("на паузе");
    expect(got).toContain("в ту же папку");
  });

  it("лимит — не пауза, а пропуск", () => {
    expect(afterLimit("отчёт", "limit")).toContain("пропущено по лимиту");
  });
});

describe("чего лимит не делает", () => {
  it("не мешает редкому и не отключается в ноль", () => {
    const got = notFor().join();
    expect(got).toContain("раз в день");
    expect(got).toContain("«безлимит» — нет");
    expect(got).toContain("виден в журнале");
  });
});
