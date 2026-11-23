import { describe, expect, it } from "vitest";
import { audit, boundary, heard, mask, MASKED, params, say, text } from "./secretPreview";

/**
 * Шаг 103: секреты маскируются в предпросмотре и журнале.
 *
 * Маскировка смотрела только на имя поля — `path: C:\keys\sk-…` показывался
 * целиком, а журнал получал фразы как есть.
 */
const KEY = "sk-abcdefghijklmnopqrstuvwxyz";

describe("секрет в «безопасном» поле больше не виден", () => {
  it("поле path с ключом маскируется по значению", () => {
    // Раньше имя path не считалось секретным, и ключ уезжал на экран.
    const shown = params({ path: `C:\\keys\\${KEY}` });
    expect(shown).not.toContain(KEY);
    expect(shown).toContain(MASKED);
  });

  it("поле password маскируется по имени, даже если шаблон его не узнаёт", () => {
    // «hunter2» не совпал бы ни с одним шаблоном и уехал открытым.
    expect(params({ password: "hunter2" })).not.toContain("hunter2");
  });

  it("обычный путь остаётся видимым", () => {
    // Маска на всём ломает согласие: человек должен видеть, на что соглашается.
    expect(params({ path: "D:\\Отчёты" })).toContain("D:\\Отчёты");
  });
});

describe("маска называет размер", () => {
  it("видно, тот же ключ или другой, но ни одного символа", () => {
    // Три [скрыто] подряд не говорят, один это ключ или три разных.
    // Длина — длина **секрета**, а не всего поля: иначе «тот же ключ?» не
    // проверить.
    const shown = mask("note", `вставь ${KEY}`);
    expect(shown).not.toContain(KEY);
    expect(shown).toContain(`${Array.from(KEY).length} симв`);
  });

  it("сказано человеку, что значение скрыто", () => {
    expect(say(mask("note", KEY), KEY)).toContain("скрыта");
    expect(say("D:\\Отчёты", "D:\\Отчёты")).toBe("");
  });
});

describe("журнал получает вычищенное до записи", () => {
  it("пароль, названный вслух, не попадает в строку", () => {
    const row = heard("сохрани пароль: hunter2 в файл");
    expect(row).not.toContain("hunter2");
    expect(row).toContain("пароль");
  });

  it("ошибка цитирует фразу — тоже вычищено", () => {
    // Ошибка уходит наружу, и фраза в ней бывает с ключом.
    expect(text(`не понял «вставь ${KEY}»`)).not.toContain(KEY);
  });
});

describe("граница названа и проверяема", () => {
  it("перечислены места, где маскировка обязательна", () => {
    const places = boundary().map((item) => item.where).join(", ");
    expect(places).toContain("предпросмотр");
    expect(places).toContain("журнал");
    expect(places).toContain("ошибк");
  });

  it("audit находит утечку и называет место", () => {
    // Не обещание, а проверка: берём то, что собирались показать.
    const leaks = audit([
      { where: "журнал", value: `вставь ${KEY}` },
      { where: "предпросмотр", value: params({ path: "D:\\Отчёты" }) },
    ]);
    expect(leaks).toHaveLength(1);
    expect(leaks[0]).toContain("журнал");
  });

  it("чистый набор не даёт утечек", () => {
    expect(audit([{ where: "предпросмотр", value: params({ path: "D:\\Отчёты" }) }])).toEqual([]);
  });

  it("пустые параметры — прежняя шапка", () => {
    expect(params(undefined)).toBe("параметров нет");
  });
});
