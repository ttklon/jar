import { describe, expect, it } from "vitest";
import { GONE_MS, lastSeen, line, markSeen, missed, notDo, when } from "./missedWhileAway";
import type { RunRecord } from "../ipc/types";

/**
 * Шаг 81: «пока вас не было».
 *
 * Дефект: автономное дело заканчивалось молча. Человек уходил, возвращался и
 * не знал, было ли что-то. Журнал это помнит — но журнал надо пойти открыть, а
 * повод идти не известен.
 *
 * Здесь проверяется сводка: что считается, как называется и когда молчит.
 */

function run(subject: string, outcome: string, finished: number | null): RunRecord {
  return {
    id: 1,
    kind: "plan",
    subject,
    started_ms: 0,
    finished_ms: finished,
    outcome,
    steps: [],
    session: "",
  };
}

const HOUR = 60 * 60 * 1000;

describe("что человек пропустил (шаг 81)", () => {
  it("считаются только дела, закончившиеся без него", () => {
    const seen = 10 * HOUR;
    const got = missed(
      [
        run("раскладка папки", "ok", seen + 1000), // после — пропустил
        run("проверка диска", "ok", seen - 5000), // до — видел
        run("старый отчёт", "ok", null), // не закончилось — не считается
      ],
      seen,
    );
    expect(got.done).toBe(1);
    expect(got.names).toEqual(["раскладка папки"]);
    expect(got.failed).toBe(0);
  });

  it("не получившееся не прячется за успехами", () => {
    // «2 дела» без оговорки читается как «оба получились».
    const got = missed(
      [run("уборка", "ok", 2000), run("отчёт", "failed", 3000)],
      1000,
    );
    const said = line(got);
    expect(said).toContain("уборка");
    expect(said).toContain("не получилось");
    expect(got.failed).toBe(1);
  });

  it("только провалы — названы провалами, а не «делами»", () => {
    const got = missed([run("отчёт", "failed", 2000)], 1000);
    expect(line(got)).toContain("одно дело не получилось");
    expect(line(got)).not.toContain("Сделано");
  });

  it("отменённые человеком не считаются: он и так знает", () => {
    const got = missed([run("уборка", "cancelled", 2000)], 1000);
    expect(got.done + got.failed).toBe(0);
    expect(line(got)).toBe("");
  });

  it("несколько дел — одна строка со списком, а не поток", () => {
    const got = missed(
      [run("уборка", "ok", 2000), run("отчёт", "ok", 3000), run("бэкап", "ok", 4000)],
      1000,
    );
    const said = line(got);
    expect(said.split("\n")).toHaveLength(1);
    expect(said).toContain("Сделано 3 дела");
  });
});

describe("когда говорить, а когда молчать", () => {
  it("ошибка показывается даже при коротком отсутствии", () => {
    // Ошибка не должна ждать, пока человек «достаточно долго» отсутствовал.
    const got = missed([run("отчёт", "failed", 2000)], 1000);
    const verdict = when(1000, got);
    expect(verdict.say).toBe(false);
    // Но при этом она не теряется: правило считает её делом, а не шумом.
    expect(got.failed).toBe(1);
  });

  it("смотрел на экран — сообщения нет", () => {
    const got = missed([run("уборка", "ok", 2000)], 1000);
    const verdict = when(GONE_MS - 1000, got);
    expect(verdict.say).toBe(false);
    expect(verdict.why).toContain("были рядом");
  });

  it("вернулся после долгого отсутствия — сказано, и причина названа", () => {
    const got = missed([run("уборка", "ok", 2000)], 1000);
    const verdict = when(GONE_MS + 1, got);
    expect(verdict.say).toBe(true);
    expect(verdict.why).toContain("закончились без вас");
  });

  it("нечего сказать — не говорим даже «ничего нового»", () => {
    const got = missed([], 1000);
    expect(when(GONE_MS * 10, got).say).toBe(false);
    expect(line(got)).toBe("");
    expect(notDo().join(" ")).toContain("ничего нового");
  });
});

describe("отметка «прочитано»", () => {
  function storage(initial: Record<string, string> = {}) {
    const data: Record<string, string> = { ...initial };
    return {
      getItem: (key: string): string | null => data[key] ?? null,
      setItem: (key: string, value: string) => {
        data[key] = value;
      },
    };
  }

  it("сводка показывается один раз, а не на каждом переходе", () => {
    const store = storage();
    expect(lastSeen(store)).toBeNull();
    markSeen(store, 12345);
    expect(lastSeen(store)).toBe(12345);
    // Второй раз она считается от новой отметки — то же дело не всплывает.
    const got = missed([run("уборка", "ok", 12345)], 12345);
    expect(got.done).toBe(0);
  });

  it("мусор в отметке — «не видел», а не сбой", () => {
    expect(lastSeen(storage({ "zshelper.missed.at": "вчера" }))).toBeNull();
    expect(lastSeen(storage({ "zshelper.missed.at": "-5" }))).toBeNull();
    expect(lastSeen(null)).toBeNull();
  });

  it("без хранилища отметка не падает", () => {
    expect(() => markSeen(null, 1)).not.toThrow();
    expect(lastSeen(null)).toBeNull();
  });
});
