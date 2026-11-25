import { describe, expect, it } from "vitest";
import { ANON, FULL, MARK, hide, usable } from "./anonTransfer";
import type { Portable } from "./memoryFile";
import type { Preference } from "./preferences";
import type { Method } from "./methods";

/**
 * Шаг 276: импорт памяти анонимный — без путей и имён, если так выбрано.
 *
 * Файл памяти — это не только факты: в нём пути, имена программ и голосов, а
 * бывает и имя человека внутри пути. Пока файл дома, это нормально. Но его
 * присылают в диагностику, переносят на рабочий компьютер, кладут в общий профиль.
 */

const NOW = 1_800_000_000_000;

const pref = (over: Partial<Preference> = {}): Preference => ({
  kind: "folder",
  value: "C:\\Users\\Иван\\Отчёты",
  times: 4,
  last: NOW,
  why: "открывали 4 раза",
  ...over,
});

const method = (over: Partial<Method> = {}): Method => ({
  dayStart: NOW,
  said: "переименуй фото",
  steps: ["открыть папку", "выделить", "переименовать"],
  params: { папка: "D:\\Фото", имя: "Иван" },
  ...over,
});

const file = (over: Partial<Portable> = {}): Portable => ({
  version: 1,
  exportedAt: NOW,
  preferences: [pref()],
  methods: [method()],
  exceptions: [],
  ...over,
});

describe("анонимность — выбор, а не навязанное поведение", () => {
  it("по умолчанию файл полный", () => {
    // Человек, переносящий память **для себя**, хочет, чтобы папки остались
    // папками: иначе перенос бесполезен.
    const got = hide(file(), FULL);
    expect(got.file.preferences[0]!.value).toBe("C:\\Users\\Иван\\Отчёты");
    expect(got.hidden).toBe(0);
    expect(got.said).toContain("файл полный");
  });

  it("полный файл не называется анонимным", () => {
    // Пометка «анонимный» на полном файле — ложь в обе стороны.
    expect(hide(file(), FULL).file.preferences[0]!.value).not.toBe(MARK);
  });

  it("пути заменяются видом, а не пустой строкой", () => {
    // Пустая строка неотличима от испорченной записи, а вид — честная замена.
    const got = hide(file(), ANON);
    expect(got.file.preferences[0]!.value).toBe("папка");
    expect(got.file.preferences[0]!.value).not.toBe("");
  });

  it("имя человека из пути не уходит наружу", () => {
    const got = hide(file(), ANON);
    expect(JSON.stringify(got.file)).not.toContain("Иван");
  });
});

describe("виды и счётчики остаются — иначе файл бесполезен", () => {
  it("повторы и дата сохраняются", () => {
    // По ним видно, почему подставлялось именно это, — ради этого файл и шлют.
    const got = hide(file(), ANON);
    expect(got.file.preferences[0]!.times).toBe(4);
    expect(got.file.preferences[0]!.last).toBe(NOW);
    expect(got.file.preferences[0]!.kind).toBe("folder");
  });

  it("программа и голос скрываются по-разному", () => {
    const got = hide(
      file({
        preferences: [pref({ kind: "program", value: "Chrome" }), pref({ kind: "voice", value: "Алла" })],
      }),
      ANON,
    );
    expect(got.file.preferences[0]!.value).toBe("программа");
    expect(got.file.preferences[1]!.value).toBe("голос");
  });

  it("громкость не скрывается: число ничего не выдаёт", () => {
    const got = hide(file({ preferences: [pref({ kind: "volume", value: "30" })] }), ANON);
    expect(got.file.preferences[0]!.value).toBe("30");
  });

  it("сколько скрыто — числом, а не «много»", () => {
    const got = hide(file({ preferences: [pref(), pref({ kind: "program", value: "Chrome" })] }), ANON);
    expect(got.hidden).toBe(2);
    expect(got.said).toContain("скрыто значений: 2");
  });
});

describe("способы: параметры и фраза", () => {
  it("параметр-путь скрывается", () => {
    const got = hide(file(), ANON);
    expect(got.file.methods[0]!.params["папка"]).toBe(MARK);
  });

  it("параметр-имя скрывается", () => {
    const got = hide(file(), ANON);
    expect(got.file.methods[0]!.params["имя"]).toBe(MARK);
  });

  it("шаги остаются: это работа, а не адрес", () => {
    const got = hide(file(), ANON);
    expect(got.file.methods[0]!.steps).toEqual(["открыть папку", "выделить", "переименовать"]);
  });

  it("путь внутри фразы вырезается", () => {
    // Только фраза и ничего больше: если путь попадает в параметр, тест пройдёт
    // и без вырезания — по чужой причине.
    const got = hide(
      file({ methods: [method({ said: "переименуй D:\\Фото\\Иван", params: {} })] }),
      ANON,
    );
    expect(got.file.methods[0]!.said).not.toContain("D:\\Фото");
    expect(got.file.methods[0]!.said).not.toContain("Иван");
    expect(got.file.methods[0]!.said).toContain(MARK);
  });
});

describe("обрезанное видно как обрезанное", () => {
  it("в файле стоит отметка, а не пустая строка", () => {
    // Иначе получатель примет «папку» за настоящее имя и будет искать папку
    // с названием «папка».
    expect(MARK).toBe("[скрыто]");
    const got = hide(file(), ANON);
    expect(got.file.methods[0]!.params["папка"]).toBe(MARK);
  });

  it("файл без путей не годится для разбора — так и сказано", () => {
    // Для вопроса «почему подставляется не то» нужен полный файл.
    const got = hide(file(), ANON);
    expect(usable(got.file).ok).toBe(false);
    expect(usable(got.file).said).toContain("нужен полный файл");
  });

  it("файл со счётчиками, но без путей, всё же что-то значит", () => {
    // Если путей не было вовсе, анонимизация ничего не испортила.
    const got = hide(file({ preferences: [] }), ANON);
    expect(usable(got.file).ok).toBe(true);
  });
});

describe("секрет не прячется за анонимностью, а вычищается", () => {
  it("пароль в значении вычищается даже в полном режиме", () => {
    // Анонимность не отменяет правило 269.
    const got = hide(file({ preferences: [pref({ value: "пароль: qwerty123" })] }), FULL);
    expect(JSON.stringify(got.file)).not.toContain("qwerty123");
  });

  it("секрет вычищается и в анонимном режиме, а не только маскируется видом", () => {
    // Здесь значение — «громкость», а не личное: вид его не скрывает, и
    // единственная защита — проверка на секрет.
    const got = hide(file({ preferences: [pref({ kind: "volume", value: "пароль: qwerty123" })] }), ANON);
    expect(got.file.preferences[0]!.value).not.toContain("qwerty123");
    expect(got.file.preferences[0]!.value).toContain("[секрет]");
  });

  it("причины можно отключить отдельно", () => {
    const got = hide(file(), { paths: true, names: true, why: false });
    expect(got.file.preferences[0]!.why).toBe("");
  });
});

describe("исключения тоже не выдают адреса", () => {
  it("значение исключения скрывается", () => {
    const got = hide(
      file({ exceptions: [{ kind: "folder", value: "D:\\Личное", at: NOW, said: "не запоминай это" }] }),
      ANON,
    );
    expect(got.file.exceptions[0]!.value).toBe("папка");
    expect(got.file.exceptions[0]!.said).toBe("");
  });
});
