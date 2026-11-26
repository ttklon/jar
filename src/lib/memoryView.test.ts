import { describe, expect, it } from "vitest";
import { canRemove, facts, fromStored, remove, removeAll, summary, willDo, type Fact } from "./memoryView";
import { all as allPreferences, type Preference, type Sighting } from "./preferences";
import { list as listMethods, type Method } from "./methods";
import type { Done } from "./likeYesterday";

/**
 * Шаг 263: просмотр и удаление каждого факта памяти одной кнопкой.
 *
 * Дефект: `forget()` был и в предпочтениях, и в способах — по одной на каждый
 * вид. Но **человек не видел памяти**: папки лежали в одном месте, способы в
 * другом, голос в третьем, и чтобы что-то забыть, надо было знать, где оно
 * живёт и как называется. Память без управления — это хранение чужих привычек
 * без спроса.
 *
 * Правило: один список, каждый факт назван так, как его узнал бы человек, и у
 * каждого ровно одна кнопка. Ни «очистить всё» (стирает нужное вместе с лишним),
 * ни «удалить выбранное» (требует режима выделения).
 */

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-11-20T12:00:00").getTime();

const sighting = (value: string, daysAgo: number, kind: Sighting["kind"] = "folder"): Sighting => ({
  kind,
  value,
  at: NOW - daysAgo * DAY,
});

const done = (daysAgo: number, over: Partial<Done> = {}): Done => ({
  dayStart: NOW - daysAgo * DAY,
  steps: ["files|rename|photos"],
  params: { from: "D:\\Фото" },
  said: "переименуй фото",
  ...over,
});

function build(): { prefs: Preference[]; methods: Method[] } {
  const prefs = allPreferences(
    [
      sighting("D:\\Отчёты", 1),
      sighting("D:\\Отчёты", 2),
      sighting("Code", 1, "program"),
      sighting("Code", 3, "program"),
      sighting("30", 2, "volume"),
      sighting("30", 4, "volume"),
    ],
    NOW,
  );
  const methods = listMethods([done(1), done(3)]);
  return { prefs, methods };
}

describe("один список: вся память видна человеку (шаг 263)", () => {
  it("предпочтения и способы — в одном списке, каждый со своим ключом", () => {
    const { prefs, methods } = build();
    const got = facts(prefs, methods, NOW);
    expect(got.length).toBe(5);
    // Ключи разные: удаление по позиции однажды удалит не то.
    expect(new Set(got.map((fact) => fact.id)).size).toBe(5);
    expect(got.some((fact) => fact.kind === "method")).toBe(true);
    expect(got.some((fact) => fact.kind === "folder")).toBe(true);
  });

  it("факт назван так, как его узнал бы человек", () => {
    // Без путей к базе и внутренних ключей: «файл memory.db, строка 12» —
    // это не ответ человеку.
    const { prefs, methods } = build();
    const got = facts(prefs, methods, NOW);
    const labels = got.map((fact) => fact.label);
    expect(labels).toContain("папка D:\\Отчёты");
    expect(labels).toContain("программа Code");
    expect(labels).toContain("громкость 30%");
    expect(labels.some((label) => label.startsWith("способ: «переименуй фото»"))).toBe(true);
    expect(labels.join(" ")).not.toContain("memory.db");
  });

  it("у каждого факта названо, почему он предлагается", () => {
    const { prefs, methods } = build();
    for (const fact of facts(prefs, methods, NOW)) {
      expect(fact.why.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("удаление одной кнопкой — и сказано, что исчезнет", () => {
  it("до нажатия видно, что произойдёт, и что вернуть нельзя", () => {
    const { prefs, methods } = build();
    const folder = facts(prefs, methods, NOW).find((fact) => fact.kind === "folder")!;
    const text = willDo(folder);
    expect(text).toContain("больше не будет предлагаться");
    // Обещание «можно отменить» было бы ложью: отменить можно только то, что
    // хранится.
    expect(text).toContain("Вернуть нельзя");
  });

  it("удаляется ровно один факт, остальные на месте", () => {
    const { prefs, methods } = build();
    const before = facts(prefs, methods, NOW);
    const folder = before.find((fact) => fact.kind === "folder")!;
    const got = remove(folder, prefs, methods, NOW);
    expect(got.preferences.length).toBe(prefs.length - 1);
    expect(got.methods.length).toBe(methods.length);
    expect(got.after.gone).toEqual(["папка D:\\Отчёты"]);
    expect(got.after.left.length).toBe(before.length - 1);
    expect(got.after.said).toContain("удалено");
    expect(got.after.said).toContain("Осталось фактов: 4");
  });

  it("удаление способа не трогает предпочтения", () => {
    const { prefs, methods } = build();
    const method = facts(prefs, methods, NOW).find((fact) => fact.kind === "method")!;
    const got = remove(method, prefs, methods, NOW);
    expect(got.methods.length).toBe(methods.length - 1);
    expect(got.preferences.length).toBe(prefs.length);
  });

  it("исходная память не мутируется", () => {
    // Иначе «удалить» нельзя ни проверить, ни показать до нажатия.
    const { prefs, methods } = build();
    const folder = facts(prefs, methods, NOW).find((fact) => fact.kind === "folder")!;
    remove(folder, prefs, methods, NOW);
    expect(prefs.length).toBe(3);
    expect(methods.length).toBe(2);
  });

  it("после удаления факт больше не показывается", () => {
    const { prefs, methods } = build();
    const volume = facts(prefs, methods, NOW).find((fact) => fact.kind === "volume")!;
    const got = remove(volume, prefs, methods, NOW);
    expect(got.after.left.some((fact) => fact.kind === "volume")).toBe(false);
  });

  it("удаление уже удалённого — честный ответ, а не ошибка", () => {
    const { prefs, methods } = build();
    const folder = facts(prefs, methods, NOW).find((fact) => fact.kind === "folder")!;
    const first = remove(folder, prefs, methods, NOW);
    const second = remove(folder, first.preferences, first.methods, NOW);
    expect(second.after.gone).toEqual([]);
    expect(second.after.said).toContain("не было в памяти");
  });
});

describe("нет «очистить всё» и нет режима выделения", () => {
  it("удалить можно любой факт поодиночке — и все по одному", () => {
    // «Очистить всё» стирает нужное вместе с лишним: человек, которому не
    // понравился один факт, не должен терять остальные.
    const { prefs, methods } = build();
    const all = facts(prefs, methods, NOW);
    expect(all.every(canRemove)).toBe(true);
    const got = removeAll(all, prefs, methods, NOW);
    expect(got.after.left.length).toBe(0);
    expect(got.after.gone.length).toBe(5);
    expect(got.after.said).toContain("удалено 5 из 5");
  });

  it("удаление нескольких по одному — то же, что по очереди", () => {
    const { prefs, methods } = build();
    const all = facts(prefs, methods, NOW);
    const chosen = [all[0]!, all[2]!];
    const got = removeAll(chosen, prefs, methods, NOW);
    expect(got.after.left.length).toBe(all.length - 2);
  });
});

describe("сводка экрана памяти", () => {
  it("сколько фактов и что каждый удаляется", () => {
    const { prefs, methods } = build();
    expect(summary(facts(prefs, methods, NOW))).toContain("каждый удаляется одной кнопкой");
  });

  it("пустая память — сказано", () => {
    expect(summary([])).toBe("в памяти ничего нет");
  });

  it("один факт — «1 факт», а не «1 фактов»", () => {
    const one: Fact[] = [
      { id: "folder:A", kind: "folder", label: "папка A", why: "два раза", removable: true, because: "" },
    ];
    expect(summary(one)).toBe("1 факт, каждый удаляется одной кнопкой");
  });
});

describe("мост от пар ключ — значение", () => {
  it("ключ разбирается: вид до двоеточия, значение после", () => {
    const got = fromStored([{ key: "folder:D:\\Отчёты", value: "отчёты" }]);
    expect(got.preferences).toHaveLength(1);
    expect(got.preferences[0]?.kind).toBe("folder");
    expect(got.preferences[0]?.value).toBe("D:\\Отчёты");
  });

  it("неизвестный вид не выбрасывается: честнее показать, чем скрыть", () => {
    const got = fromStored([{ key: "city:Рига", value: "Рига" }]);
    expect(got.preferences).toHaveLength(1);
    expect(got.preferences[0]?.value).toBe("Рига");
  });

  it("способ не становится предпочтением", () => {
    const got = fromStored([{ key: "method:отчёт за месяц", value: "3" }]);
    expect(got.preferences).toHaveLength(0);
    expect(got.methods).toHaveLength(1);
  });

  it("из пар получается список, который человек читает без ключей", () => {
    const got = fromStored([
      { key: "voice:Алла", value: "Алла" },
      { key: "volume:40", value: "40" },
    ]);
    const labels = facts(got.preferences, got.methods, 0).map((fact) => fact.label);
    expect(labels).toEqual(["голос Алла", "громкость 40%"]);
  });
});
