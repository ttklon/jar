import { describe, expect, it } from "vitest";
import { RULES, asWhole, harmless, record, replay, say } from "./reproduce";
import type { Report } from "./oneReport";

/**
 * Шаг 243: журнал и воспроизведение — любой отчёт можно повторить.
 *
 * Дефект: журнал хранил **строки** («14:32, переименование, готово»), а не вход
 * отчёта. По строке нельзя ответить, почему шаг 3 упал, что было
 * доказательством и не соврал ли итог. Отчёт, собранный в момент дела, никуда не
 * сохранялся — и через день его было не восстановить.
 *
 * Второе, что здесь важно: «повторить» у нас уже значит «сделать ещё раз»
 * (`repeatDeed.ts`) и касается мира. Воспроизведение отчёта касается **только
 * отчёта**: разбор вчерашнего провала не должен менять сегодняшние файлы.
 */

function step(over: Partial<Report> = {}): Report {
  return {
    position: 1,
    tool: "files|rename|photos",
    ok: true,
    reason: "",
    proof: "проверено повторным чтением: 200 файлов",
    cancelled: false,
    duration_ms: 120,
    conflicts: [],
    ...over,
  };
}

const steps: Report[] = [
  step({ position: 1 }),
  step({ position: 2, ok: false, reason: "файл занят", proof: "" }),
  step({ position: 3, cancelled: true, ok: false, reason: "отменено человеком" }),
];

describe("вход сохраняется целиком, а не пересказом (шаг 243)", () => {
  it("в записи есть фраза, время, шаги и версия правил", () => {
    const got = record(12, "переименуй фото", 1700000000000, steps);
    expect(got.deed).toBe(12);
    expect(got.subject).toBe("переименуй фото");
    expect(got.startedMs).toBe(1700000000000);
    expect(got.steps.length).toBe(3);
    expect(got.rules).toBe(RULES);
  });

  it("запись не делит шаги с вызывающим — копия, а не ссылка", () => {
    // Иначе «воспроизведение» показывало бы то, что уже поменяли на экране.
    const original = [step()];
    const got = record(1, "дело", 1000, original);
    // Массив — отдельный: подмена шага в вызывающем коде не меняет запись.
    expect(got.steps).not.toBe(original);
    original[0]!.ok = false;
    original.push(step({ position: 2 }));
    expect(got.steps.length).toBe(1);
    expect(got.steps[0]!.ok).toBe(true);
  });
});

describe("воспроизведение даёт ровно тот же отчёт", () => {
  it("итог совпадает, шаг в шаг", () => {
    // Здесь все шаги с доказательствами: иначе «без доказательства 1» —
    // настоящий пробел, и разбор честно скажет «с пробелами», а не «совпадает».
    const proven: Report[] = [
      step({ position: 1 }),
      step({ position: 2, ok: false, reason: "файл занят", proof: "проверено: файл занят" }),
      step({ position: 3, cancelled: true, ok: false, reason: "отменено", proof: "журнал отмены" }),
    ];
    const entry = record(12, "переименуй фото", 1700000000000, proven);
    const was = { steps: proven, summary: "сделано 1 из 3, отменено 1" };
    const got = replay(entry, was);
    expect(got.steps.length).toBe(3);
    expect(got.missing).toEqual([]);
    expect(got.summary).toBe(was.summary);
    expect(got.matches).toBe(true);
    expect(say(got)).toContain("совпадает");
  });

  it("подмена шага при том же итоге — замечена", () => {
    // Это и есть проверка на «все поля»: итог «сделано 1 из 3» одинаков, а
    // отчёт другой. Первая версия сравнивала только `summary` и пропускала
    // подмену — регресс показал это (0 упавших вместо 1).
    const entry = record(12, "дело", 1000, [step({ position: 1 }), step({ position: 2, ok: false })]);
    const other = [step({ position: 1 }), step({ position: 2, ok: false, reason: "другое" })];
    const same = replay(entry, {
      steps: [step({ position: 1 }), step({ position: 2, ok: false })],
      summary: "сделано 1 из 2",
    });
    const different = replay(entry, { steps: other, summary: "сделано 1 из 2" });
    // Итог у обоих один — различие только в поле `reason`.
    expect(same.summary).toBe(different.summary);
    expect(same.matches).toBe(true);
    expect(different.matches).toBe(false);
  });

  it("сравниваются все поля, а не только итог", () => {
    // Итог «сделано 1 из 3» совпадёт и тогда, когда упали разные шаги. Первая
    // версия мысли «сравнить summary» пропустила бы подмену.
    const entry = record(12, "переименуй фото", 1700000000000, steps);
    const other = steps.map((item, index) => (index === 2 ? { ...item, reason: "другая причина" } : item));
    // Пробелы здесь настоящие (у шага 2 нет доказательства), поэтому строка —
    // «с пробелами»; но **совпадения нет**, и это главное.
    const got = replay(entry, { steps: other, summary: "сделано 1 из 3, отменено 1" });
    expect(got.matches).toBe(false);
    expect(say(got)).not.toContain("совпадает с тем");
  });

  it("без «как было» совпадение не выдумывается", () => {
    const entry = record(12, "дело", 1000, steps);
    const got = replay(entry);
    expect(got.matches).toBe(false);
    expect(got.summary).toContain("сделано 1 из 3");
  });

  it("пересчёт при разборе не меняет шаги", () => {
    const entry = record(12, "дело", 1000, steps);
    const got = replay(entry, { steps, summary: "что угодно" });
    expect(got.steps.map((item) => item.position)).toEqual([1, 2, 3]);
  });
});

describe("чего не хватило — сказано, а не достроено догадкой", () => {
  it("нет шагов — названо, что восстанавливать нечего", () => {
    const got = replay(record(1, "дело", 1000, []));
    expect(got.missing.some((item) => item.includes("шагов в записи нет"))).toBe(true);
  });

  it("нет фразы человека — названо", () => {
    const got = replay(record(1, "  ", 1000, steps));
    expect(got.missing.some((item) => item.includes("фразы человека нет"))).toBe(true);
  });

  it("нет времени — названо", () => {
    const got = replay(record(1, "дело", 0, steps));
    expect(got.missing.some((item) => item.includes("времени нет"))).toBe(true);
  });

  it("доказательство не придумывается при разборе", () => {
    // Худший вид лжи: разбор читают, чтобы понять, что было на самом деле.
    const got = replay(record(1, "дело", 1000, [step({ proof: "" })]));
    expect(got.steps[0]!.proof).toBe("");
    expect(got.missing.some((item) => item.includes("без доказательства 1"))).toBe(true);
    expect(got.missing.some((item) => item.includes("шаги 1"))).toBe(true);
  });

  it("другая версия правил — названа, и совпадение не обещано", () => {
    const entry = { ...record(1, "дело", 1000, steps), rules: "report-0" };
    const got = replay(entry, { steps, summary: "сделано 1 из 3, отменено 1, без доказательства 1" });
    expect(got.missing.some((item) => item.includes("правила записи"))).toBe(true);
    expect(got.missing.some((item) => item.includes("совпадение не гарантировано"))).toBe(true);
  });

  it("пробелы названы в строке для человека, а не спрятаны", () => {
    const got = replay(record(1, "дело", 1000, [step({ proof: "" })]));
    const text = say(got);
    expect(text).toContain("с пробелами");
    expect(text).toContain("доказательства");
  });
});

describe("воспроизведение не трогает мир", () => {
  it("это чтение журнала, а не повторный запуск", () => {
    const entry = record(1, "дело", 1000, steps);
    expect(harmless(entry)).toBe(true);
    // Шаги при разборе остаются теми же: ни один не «выполняется заново».
    const got = replay(entry, { steps, summary: "сделано 1 из 3, отменено 1, без доказательства 1" });
    expect(harmless({ ...entry, steps: got.steps })).toBe(true);
  });

  it("форма для экранов считается по тем же правилам", () => {
    const got = asWhole(steps);
    expect(got.done).toBe(1);
    expect(got.cancelled).toBe(1);
    expect(got.unproven).toBe(1);
  });
});
