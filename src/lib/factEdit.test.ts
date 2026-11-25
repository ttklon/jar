import { describe, expect, it } from "vitest";
import { edit, editMethod, editPreference, willDo } from "./factEdit";
import type { Preference } from "./preferences";
import type { Method } from "./methods";

/**
 * Шаг 274: факт можно поправить, а не только удалить.
 *
 * Экран памяти (263) знал одну кнопку — «удалить», и это честно только пока жизнь
 * не меняется. Папка переехала с `D:\Отчёты` на `D:\Отчёты 2025` — и человек либо
 * стирает привычку и ждёт двух повторов, либо правит старую папку руками каждый
 * раз.
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

const method = (over: Partial<Method> = {}): Method => ({
  dayStart: NOW - 2 * DAY,
  said: "переименуй фото",
  steps: ["открыть папку", "выделить", "переименовать"],
  params: { папка: "D:\\Фото" },
  ...over,
});

describe("правка — это тот же факт, а не новый", () => {
  it("счётчик и причина переносятся на новое значение", () => {
    // Человек не начинал заново — он поправил дорогу к той же папке.
    const got = editPreference({ id: "folder:D:\\Отчёты", value: "D:\\Отчёты 2025" }, [pref()]);
    expect(got.ok).toBe(true);
    expect(got.preferences[0]!.value).toBe("D:\\Отчёты 2025");
    expect(got.preferences[0]!.times).toBe(4);
    expect(got.preferences[0]!.why).toBe("открывали 4 раза");
    expect(got.said).toContain("4 повтора сохранены");
  });

  it("исходный список не меняется", () => {
    const list = [pref()];
    editPreference({ id: "folder:D:\\Отчёты", value: "D:\\Фото" }, list);
    expect(list[0]!.value).toBe("D:\\Отчёты");
  });

  it("правка видна до нажатия", () => {
    const got = willDo({ label: "папка D:\\Отчёты", times: 4 }, "D:\\Отчёты 2025");
    expect(got).toContain("станет D:\\Отчёты 2025");
    expect(got).toContain("4 повтора останутся");
  });
});

describe("правка регистра — не повод стирать привычку", () => {
  it("d:\\отчёты — то же самое, что D:\\Отчёты", () => {
    // Иначе наказывается аккуратность: человек поправил регистр и потерял память.
    const got = editPreference({ id: "folder:D:\\Отчёты", value: "d:\\отчёты" }, [pref()]);
    expect(got.ok).toBe(true);
    expect(got.merged).toBe(false);
    expect(got.preferences.length).toBe(1);
    expect(got.preferences[0]!.value).toBe("D:\\Отчёты");
    expect(got.said).toContain("то же самое");
  });

  it("слэш на конце не делает папку другой", () => {
    const got = editPreference({ id: "folder:D:\\Отчёты", value: "D:/Отчёты/" }, [pref()]);
    expect(got.said).toContain("то же самое");
    expect(got.preferences.length).toBe(1);
  });

  it("у программы регистр важен: Chrome и chrome — разные", () => {
    // Имя программы — не путь Windows, и «chrome» может быть другой сборкой.
    const got = editPreference(
      { id: "program:Chrome", value: "chrome" },
      [pref({ kind: "program", value: "Chrome" })],
    );
    expect(got.preferences[0]!.value).toBe("chrome");
  });

  it("громкость сравнивается числом, а не строкой", () => {
    const got = editPreference({ id: "volume:30", value: "30%" }, [pref({ kind: "volume", value: "30" })]);
    expect(got.said).toContain("то же самое");
  });
});

describe("правка не создаёт дублей", () => {
  it("исправление в уже существующее значение объединяет", () => {
    // Два факта про одну папку — вопрос «чему верить» там, где его нет.
    const list = [pref({ value: "D:\\Отчёты", times: 4 }), pref({ value: "D:\\Отчёты 2025", times: 2 })];
    const got = editPreference({ id: "folder:D:\\Отчёты", value: "D:\\Отчёты 2025" }, list);
    expect(got.merged).toBe(true);
    expect(got.preferences.length).toBe(1);
    expect(got.preferences[0]!.value).toBe("D:\\Отчёты 2025");
    expect(got.said).toContain("объединил");
  });

  it("счётчики не складываются: это одно и то же, а не два свидетельства", () => {
    const list = [pref({ value: "D:\\Отчёты", times: 7 }), pref({ value: "D:\\Отчёты 2025", times: 2 })];
    const got = editPreference({ id: "folder:D:\\Отчёты", value: "D:\\Отчёты 2025" }, list);
    expect(got.preferences[0]!.times).toBe(7);
  });

  it("берётся более свежая дата", () => {
    const list = [
      pref({ value: "D:\\Отчёты", last: NOW - 5 * DAY }),
      pref({ value: "D:\\Отчёты 2025", last: NOW - DAY }),
    ];
    const got = editPreference({ id: "folder:D:\\Отчёты", value: "D:\\Отчёты 2025" }, list);
    expect(got.preferences[0]!.last).toBe(NOW - DAY);
  });
});

describe("отказы разные, и каждый назван", () => {
  it("пустое значение — не «забыть», а ошибка", () => {
    // Пустота это «спроси меня», а не «я так сказал».
    const got = editPreference({ id: "folder:D:\\Отчёты", value: "   " }, [pref()]);
    expect(got.ok).toBe(false);
    expect(got.said).toContain("пустота это «спроси меня»");
    expect(got.preferences[0]!.value).toBe("D:\\Отчёты");
  });

  it("громкость вне 0..100 не принимается", () => {
    const got = editPreference({ id: "volume:30", value: "130" }, [pref({ kind: "volume", value: "30" })]);
    expect(got.ok).toBe(false);
    expect(got.said).toContain("не число от 0 до 100");
  });

  it("факта нет — сказано, а не тишина", () => {
    const got = editPreference({ id: "folder:D:\\Нет", value: "D:\\Фото" }, [pref()]);
    expect(got.ok).toBe(false);
    expect(got.said).toContain("нечего править");
  });

  it("неизменённое значение — успех без изменений", () => {
    const got = editPreference({ id: "folder:D:\\Отчёты", value: "D:\\Отчёты" }, [pref()]);
    expect(got.ok).toBe(true);
    expect(got.preferences[0]!.value).toBe("D:\\Отчёты");
  });
});

describe("способ правится по фразе, а не по шагам", () => {
  it("фраза меняется, шаги остаются", () => {
    // Править шаги значит делать другой способ — это добавление, а не правка.
    const got = editMethod(method().dayStart, "переименуй фотографии", [method()]);
    expect(got.ok).toBe(true);
    expect(got.methods[0]!.said).toBe("переименуй фотографии");
    expect(got.methods[0]!.steps).toEqual(["открыть папку", "выделить", "переименовать"]);
    expect(got.said).toContain("Шаги те же");
  });

  it("пустая фраза не принимается", () => {
    const got = editMethod(method().dayStart, "  ", [method()]);
    expect(got.ok).toBe(false);
    expect(got.said).toContain("по ней способ не узнать");
  });

  it("способ с теми же шагами и новой фразой объединяется", () => {
    const twin = method({ dayStart: NOW - 5 * DAY, said: "переименуй фотографии" });
    const got = editMethod(method().dayStart, "переименуй фотографии", [method(), twin]);
    expect(got.merged).toBe(true);
    expect(got.methods.length).toBe(1);
    expect(got.methods[0]!.said).toBe("переименуй фотографии");
  });

  it("способа за этот день нет — сказано", () => {
    const got = editMethod(123, "что угодно", [method()]);
    expect(got.ok).toBe(false);
    expect(got.said).toContain("нечего править");
  });
});

describe("одна точка входа по id", () => {
  it("вид берётся из id, а не из отдельного поля", () => {
    // Вторая правда о том, «что это за факт», разошлась бы с первой.
    const got = edit({ id: "folder:D:\\Отчёты", value: "D:\\Фото" }, [pref()], [method()]);
    expect(got.preferences[0]!.value).toBe("D:\\Фото");
    expect(got.methods.length).toBe(1);
  });

  it("id способа правит способ, а не предпочтение", () => {
    const got = edit({ id: `method:${method().dayStart}`, value: "сожми фото" }, [pref()], [method()]);
    expect(got.methods[0]!.said).toBe("сожми фото");
    expect(got.preferences[0]!.value).toBe("D:\\Отчёты");
  });
});
