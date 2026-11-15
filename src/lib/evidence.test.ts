import { describe, expect, it } from "vitest";
import { evidenceText } from "./evidence";

/**
 * Доказательство говорится словами одинаково на всех экранах: «Руки» и «Сценарии»
 * не должны описывать одно и то же по-разному.
 */
describe("доказательство словами", () => {
  it("действие над окном подтверждается изменением, а не надеждой", () => {
    expect(
      evidenceText({ kind: "ui_changed", what: "кнопка «Войти»", changed: true }),
    ).toBe("изменение подтверждено: кнопка «Войти»");

    expect(
      evidenceText({ kind: "ui_changed", what: "поле «Логин»", changed: false }),
    ).toBe("изменения не видно: поле «Логин»");
  });

  it("запись в файл подтверждается чтением обратно, а не «сохранено»", () => {
    expect(evidenceText({ kind: "file_text", path: "C:\\tmp\\заметка.txt", matches: true })).toBe(
      "в файле ровно то, что записали: C:\\tmp\\заметка.txt",
    );
    expect(evidenceText({ kind: "file_text", path: "C:\\tmp\\заметка.txt", matches: false })).toBe(
      "в файле оказалось не то, что записали: C:\\tmp\\заметка.txt",
    );
  });

  it("чтение файла подтверждается числом прочитанных байт", () => {
    expect(evidenceText({ kind: "file_read", path: "C:\\tmp\\заметка.txt", bytes: 42 })).toBe(
      "прочитано 42 байт из файла: C:\\tmp\\заметка.txt",
    );
  });

  it("переименование подтверждается числом имён, а не кодом возврата", () => {
    expect(evidenceText({ kind: "renamed", folder: "C:\\tmp\\фото", count: 7 })).toBe(
      "переименовано файлов: 7 — C:\\tmp\\фото",
    );
  });

  it("остальные виды доказательств не потерялись", () => {
    expect(evidenceText({ kind: "exit_code", code: 0 })).toBe("код возврата 0");
    expect(evidenceText({ kind: "path_exists", path: "C:\\tmp", exists: true })).toContain(
      "существует",
    );
    expect(evidenceText({ kind: "failed", reason: "нет прав" })).toBe("нет прав");
  });
});
