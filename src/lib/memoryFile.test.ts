import { describe, expect, it } from "vitest";
import {
  exportFile,
  inspect,
  merge,
  read,
  report,
  type Portable,
} from "./memoryFile";
import type { Preference } from "./preferences";
import type { Method } from "./methods";
import type { Exception } from "./dontStore";

/**
 * Шаг 266: экспорт/импорт памяти в понятном файле — перенос на новый компьютер.
 *
 * Файл — не транзакция: человек откроет его блокнотом, поправит, понесёт на
 * другой компьютер, где часть данных уже есть. Поэтому три вопроса важнее
 * самого `JSON.stringify`: что если файл правили руками, что если память там уже
 * есть, и что если в файле секрет.
 */

const NOW = 1_800_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

const pref = (over: Partial<Preference> = {}): Preference => ({
  kind: "folder",
  value: "D:\\Отчёты",
  times: 3,
  last: NOW - DAY,
  why: "открывали 3 раза",
  ...over,
});

const method = (over: Partial<Method> = {}): Method => ({
  dayStart: NOW - 2 * DAY,
  said: "переименуй фото",
  steps: ["открыть папку", "выделить", "переименовать"],
  params: { папка: "D:\\Фото" },
  ...over,
});

const exception: Exception = { kind: "folder", value: "D:\\Личное", at: NOW, said: "не запоминай это" };

const file = (over: Partial<Portable> = {}): Portable => ({
  version: 1,
  exportedAt: NOW,
  preferences: [pref()],
  methods: [method()],
  exceptions: [],
  ...over,
});

describe("выгрузка не становится способом вынести пароль", () => {
  it("секрет из старой записи вычищается при выгрузке", () => {
    // Память могла быть записана до правила 269.
    const got = exportFile([pref({ value: "пароль: qwerty123" })], [], [], NOW);
    expect(got.file.preferences[0]!.value).not.toContain("qwerty123");
    expect(got.cleaned).toBe(1);
    expect(got.said).toContain("убрано секретов: 1");
  });

  it("вид, которого в памяти быть не должно, в файл не попадает", () => {
    const got = exportFile([pref({ kind: "password" as Preference["kind"], value: "x" })], [], [], NOW);
    expect(got.file.preferences.length).toBe(0);
  });

  it("исключения переезжают вместе с памятью", () => {
    // Иначе на новом компьютере снова начнут записывать то, что просили не хранить.
    const got = exportFile([pref()], [method()], [exception], NOW);
    expect(got.file.exceptions.length).toBe(1);
    expect(got.said).toContain("не запоминать");
  });

  it("всё выгруженное названо числом", () => {
    const got = exportFile([pref(), pref({ value: "D:\\Фото" })], [method()], [], NOW);
    expect(got.said).toContain("2 факта");
    expect(got.said).toContain("1 способ");
  });
});

describe("слияние не теряет и не удваивает", () => {
  it("замена стёрла бы наработанное — слияние его сохраняет", () => {
    const current = file({ preferences: [pref()], methods: [] });
    const incoming = file({ preferences: [pref({ value: "D:\\Фото", times: 2 })], methods: [] });
    const got = merge(current, incoming);
    expect(got.file.preferences.length).toBe(2);
    expect(got.added).toBe(1);
  });

  it("дубль не удваивает число повторов", () => {
    // Иначе перенос «закаляет» предпочтение, которого человек не подтверждал.
    const got = merge(file({ preferences: [pref({ times: 3 })], methods: [] }), file({ preferences: [pref({ times: 3 })], methods: [] }));
    expect(got.file.preferences.length).toBe(1);
    expect(got.file.preferences[0]!.times).toBe(3);
    expect(got.added).toBe(0);
    expect(got.same).toBe(1);
  });

  it("из двух дублей берётся более свежая дата", () => {
    const got = merge(
      file({ preferences: [pref({ times: 2, last: NOW - 5 * DAY, why: "старое" })], methods: [] }),
      file({ preferences: [pref({ times: 2, last: NOW - DAY, why: "свежее" })], methods: [] }),
    );
    expect(got.file.preferences[0]!.last).toBe(NOW - DAY);
    expect(got.file.preferences[0]!.why).toBe("свежее");
  });

  it("тот же способ не задваивается, другой — добавляется", () => {
    const got = merge(file({ preferences: [], methods: [method()] }), file({ preferences: [], methods: [method(), method({ said: "сожми фото" })] }));
    expect(got.file.methods.length).toBe(2);
    expect(got.added).toBe(1);
  });

  it("исключение остаётся более поздним", () => {
    const older: Exception = { ...exception, at: NOW - DAY, said: "старое" };
    const got = merge(file({ preferences: [], methods: [], exceptions: [older] }), file({ preferences: [], methods: [], exceptions: [exception] }));
    expect(got.file.exceptions.length).toBe(1);
    expect(got.file.exceptions[0]!.at).toBe(NOW);
  });

  it("добавлять нечего — сказано так, а не «успешно»", () => {
    const got = merge(file(), file());
    expect(got.said).toContain("добавлять нечего");
  });
});

describe("файл, поправленный руками", () => {
  it("понятный файл читается и называет число записей", () => {
    const got = read(JSON.stringify(exportFile([pref()], [method()], [], NOW).file));
    expect(got.ok).toBe(true);
    if (got.ok) expect(got.said).toContain("2 записи");
  });

  it("испорченная строка не отменяет остальные и называется", () => {
    // Молча пропустить нельзя: человек увидит «импорт прошёл» и будет искать папку.
    const broken = {
      version: 1,
      exportedAt: NOW,
      preferences: [pref(), { kind: "folder", value: "", times: 1, last: NOW, why: "" }],
      methods: [],
      exceptions: [],
    };
    const got = read(JSON.stringify(broken));
    expect(got.ok).toBe(true);
    if (got.ok) {
      expect(got.file.preferences.length).toBe(1);
      expect(got.said).toContain("пропущено 1");
      expect(got.said).toContain("нет значения");
    }
  });

  it("не JSON — причина, а не падение", () => {
    const got = read("это не файл, а записка");
    expect(got.ok).toBe(false);
    if (!got.ok) expect(got.why).toContain("не читается как JSON");
  });

  it("чужая версия формата не читается вслепую", () => {
    const got = read(JSON.stringify({ ...file(), version: 7 }));
    expect(got.ok).toBe(false);
    if (!got.ok) expect(got.why).toContain("версия файла 7");
  });

  it("пустой файл — не «импорт прошёл»", () => {
    const got = read(JSON.stringify({ version: 1, exportedAt: NOW, preferences: [], methods: [], exceptions: [] }));
    expect(got.ok).toBe(false);
    if (!got.ok) expect(got.why).toContain("пуст");
  });

  it("способ без шагов не берётся", () => {
    // Файл не пуст — в нём одна запись, и она не понята. Сказать «пуст» значило
    // бы, что искать нечего, и человек не узнал бы, что способ не взят.
    const got = read(JSON.stringify({ version: 1, preferences: [], methods: [{ said: "переименуй", steps: [] }], exceptions: [] }));
    expect(got.ok).toBe(false);
    if (!got.ok) {
      expect(got.why).toContain("нечего импортировать");
      expect(got.why).toContain("нет ни одного шага");
    }
  });
});

describe("импорт проверяет так же, как запись", () => {
  it("секрет в файле вычищается, а не переносится", () => {
    // Файл мог приехать с версии до правила или быть отредактирован руками.
    const got = inspect(file({ preferences: [pref({ value: "пароль: qwerty123" })], methods: [] }));
    expect(got.facts[0]!.value).not.toContain("qwerty123");
    expect(got.cleaned).toBe(1);
  });

  it("запрещённый вид отклоняется с причиной", () => {
    const got = inspect(file({ preferences: [pref({ kind: "token" as Preference["kind"], value: "abc" })], methods: [] }));
    expect(got.facts.length).toBe(0);
    expect(got.rejected[0]).toContain("не хранится");
  });

  it("неизвестный вид отклоняется отдельно от запрещённого", () => {
    const got = inspect(file({ preferences: [pref({ kind: "sticker" as Preference["kind"], value: "x" })], methods: [] }));
    expect(got.rejected[0]).toContain("неизвестный вид");
  });

  it("обычная память проходит без изменений", () => {
    const got = inspect(file());
    expect(got.facts.length).toBe(2);
    expect(got.cleaned).toBe(0);
    expect(got.rejected.length).toBe(0);
  });
});

describe("итог импорта говорит, что стало", () => {
  it("добавлено, уже было, не взято", () => {
    const said = report({ added: 3, same: 2 }, ["папка без значения"], 1);
    expect(said).toContain("добавлено 3");
    expect(said).toContain("уже было 2");
    expect(said).toContain("не взято 1");
    expect(said).toContain("убрано секретов: 1");
  });

  it("нечего импортировать — сказано, а не пустая строка", () => {
    expect(report({ added: 0, same: 0 }, [], 0)).toContain("нечего");
  });
});
