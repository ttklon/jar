import { describe, expect, it } from "vitest";
import { afterEdit, editAndCheck } from "./editReplaces";
import type { Preference } from "./preferences";
import type { Method } from "./methods";

/**
 * Шаг 280: тест — поправленный факт заменяет старый, а не дублирует.
 *
 * Правка (274) — это две записи, старая и новая, и между ними живёт окно, в
 * котором память знает обе. Здесь проверяется не «функция вернула ok», а что в
 * памяти после правки **не осталось следов** старого факта.
 */

const NOW = 1_800_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

const pref = (over: Partial<Preference> = {}): Preference => ({
  kind: "folder",
  value: "D:\\Отчёты",
  times: 4,
  last: NOW - DAY,
  why: "открывали 4 раза",
  ...over,
});

describe("после правки старого факта нет", () => {
  it("правка заменяет, и проверка это подтверждает", () => {
    const got = editAndCheck("folder:D:\\Отчёты", "D:\\Отчёты 2025", [pref()], []);
    expect(got.edited.ok).toBe(true);
    expect(got.checks.ok).toBe(true);
    expect(got.checks.said).toContain("старый факт заменён");
  });

  it("старое значение отсутствует в списке", () => {
    const got = editAndCheck("folder:D:\\Отчёты", "D:\\Отчёты 2025", [pref()], []);
    const all = got.edited.preferences.map((preference) => preference.value);
    expect(all).not.toContain("D:\\Отчёты");
    expect(all).toContain("D:\\Отчёты 2025");
  });

  it("новое значение ровно одно, а не два", () => {
    const got = editAndCheck("folder:D:\\Отчёты", "D:\\Отчёты 2025", [pref()], []);
    expect(got.checks.checks.find((check) => check.said.includes("оно одно"))!.ok).toBe(true);
  });

  it("в списке для человека одна строка, а не две", () => {
    // Иначе человек удаляет ту, которую уже поправил.
    const got = editAndCheck("folder:D:\\Отчёты", "D:\\Отчёты 2025", [pref()], []);
    expect(got.checks.checks.find((check) => check.said.includes("в списке"))!.ok).toBe(true);
  });

  it("счётчик не ослаб", () => {
    // «Правка» не должна тихо стирать привычку: иначе подсказка пропадёт.
    const got = editAndCheck("folder:D:\\Отчёты", "D:\\Отчёты 2025", [pref()], []);
    expect(got.edited.preferences[0]!.times).toBe(4);
    expect(got.checks.checks.find((check) => check.said.includes("счётчик"))!.ok).toBe(true);
  });
});

describe("правка в уже существующее значение не оставляет двух правд", () => {
  it("старая и новая сливаются в одну запись", () => {
    const list = [pref(), pref({ value: "D:\\Отчёты 2025", times: 2 })];
    const got = editAndCheck("folder:D:\\Отчёты", "D:\\Отчёты 2025", list, []);
    expect(got.checks.ok).toBe(true);
    expect(got.edited.preferences.length).toBe(1);
  });

  it("и обе строки не видны человеку", () => {
    const list = [pref(), pref({ value: "D:\\Отчёты 2025", times: 2 })];
    const got = editAndCheck("folder:D:\\Отчёты", "D:\\Отчёты 2025", list, []);
    const shown = got.checks.checks.find((check) => check.said.includes("в списке"))!;
    expect(shown.ok).toBe(true);
  });
});

describe("проверка не молчит, когда правка не состоялась", () => {
  it("пустое значение — правка не состоялась, и это сказано", () => {
    const got = editAndCheck("folder:D:\\Отчёты", "  ", [pref()], []);
    expect(got.edited.ok).toBe(false);
    expect(got.checks.said).toContain("правка не состоялась");
  });

  it("несуществующий факт — тоже сказано", () => {
    const got = editAndCheck("folder:D:\\Нет", "D:\\Фото", [pref()], []);
    expect(got.edited.ok).toBe(false);
    expect(got.checks.said).not.toBe("");
  });
});

describe("проверка ловит дубль, а не притворяется", () => {
  it("если правка оставит старое — проверка это увидит", () => {
    // Подсовываем результат, в котором старое не убрано: так проверка
    // испытывается сама, а не только «хороший» случай.
    const before = { preferences: [pref()], methods: [] };
    const fake = { preferences: [pref(), pref({ value: "D:\\Отчёты 2025" })], methods: [], ok: true, said: "", merged: false };
    const got = afterEdit(before, fake, "folder:D:\\Отчёты", "D:\\Отчёты 2025");
    expect(got.ok).toBe(false);
    expect(got.said).toContain("старое значение осталось");
  });

  it("если правка потеряет новое — тоже увидит", () => {
    const before = { preferences: [pref()], methods: [] };
    const fake = { preferences: [], methods: [], ok: true, said: "", merged: false };
    const got = afterEdit(before, fake, "folder:D:\\Отчёты", "D:\\Отчёты 2025");
    expect(got.ok).toBe(false);
    expect(got.said).toContain("правка потерялась");
  });

  it("два одинаковых новых значения — названы дублем", () => {
    // Именно этот случай `nowNew.length >= 1` пропускал: факт есть, и «всё хорошо».
    const before = { preferences: [pref()], methods: [] };
    const twin = pref({ value: "D:\\Отчёты 2025" });
    const fake = { preferences: [twin, { ...twin }], methods: [], ok: true, said: "", merged: false };
    const got = afterEdit(before, fake, "folder:D:\\Отчёты", "D:\\Отчёты 2025");
    expect(got.ok).toBe(false);
    expect(got.said).toContain("две записи про одно и то же");
  });

  it("дубль в списке для человека ловится отдельно", () => {
    // Проверка «старое осталось» и «в списке две строки» — не одно и то же:
    // вторая нужна, чтобы дубль был виден даже когда списки расходятся.
    const before = { preferences: [pref()], methods: [] };
    const fake = {
      preferences: [pref(), pref({ value: "D:\\Отчёты 2025" })],
      methods: [],
      ok: true,
      said: "",
      merged: false,
    };
    const got = afterEdit(before, fake, "folder:D:\\Отчёты", "D:\\Отчёты 2025");
    expect(got.said).toContain("человек видит дубль");
  });

  it("счётчик, ставший единицей, называется ослабшим", () => {
    const before = { preferences: [pref()], methods: [] };
    const fake = {
      preferences: [pref({ value: "D:\\Отчёты 2025", times: 1 })],
      methods: [],
      ok: true,
      said: "",
      merged: false,
    };
    const got = afterEdit(before, fake, "folder:D:\\Отчёты", "D:\\Отчёты 2025");
    expect(got.said).toContain("привычка ослабла");
  });
});

describe("способы тоже проверяются", () => {
  it("правка способа не оставляет старой фразы в списке", () => {
    const methods: Method[] = [
      { dayStart: NOW - 2 * DAY, said: "переименуй фото", steps: ["открыть", "переименовать"], params: {} },
    ];
    const got = editAndCheck("folder:D:\\Отчёты", "D:\\Отчёты 2025", [pref()], methods);
    expect(got.checks.ok).toBe(true);
  });
});
