import { describe, expect, it } from "vitest";
import dataJson from "../../data/licenses.json";
import { UNKNOWN, agrees, copyleft, elsewhere, rows, source, unknownNote, type LicenseData } from "./licenses";

/**
 * Шаг 217: лицензии всего встроенного — одной таблицей.
 *
 * Проверяется не «функция вернула массив», а что таблица **сходится** и что
 * «неизвестно» названо, а не спрятано.
 */

const data = dataJson as unknown as LicenseData;

// Регрессия D-015: этот файл — тест, названный номером дефекта (шаг 254).
describe("таблица сходится", () => {
  it("сумма по группам равна общему числу в настоящих данных", () => {
    expect(agrees(data)).toEqual({ ok: true, why: "" });
  });

  it("расхождение названо числом, а не «ошибка»", () => {
    const broken = { ...data, total: data.total + 1 };
    const got = agrees(broken);
    expect(got.ok).toBe(false);
    expect(got.why).toContain(String(data.total + 1));
  });

  it("npm и Cargo вместе дают общее число", () => {
    expect(Object.values(data.kinds).reduce((a, b) => a + b, 0)).toBe(data.total);
  });
});

describe("сортировка по числу: искать начинают с большого", () => {
  it("убывание", () => {
    const list = rows(data);
    const counts = list.map((row) => row.count);
    for (let index = 1; index < counts.length; index += 1) {
      expect(counts[index - 1]!).toBeGreaterThanOrEqual(counts[index]!);
    }
  });

  it("первая строка — самая большая группа", () => {
    expect(rows(data)[0]?.count).toBe(Math.max(...data.groups.map((row) => row.count)));
  });
});

describe("«неизвестно» — категория, а не пустая клетка", () => {
  it("крейты не додуманы: их лицензия — «не объявлено в lock»", () => {
    const cargo = data.packages.filter((pack) => pack.kind === "cargo");
    expect(cargo.length).toBeGreaterThan(0);
    expect(cargo.every((pack) => pack.license === UNKNOWN)).toBe(true);
  });

  it("у npm лицензия объявлена у всех", () => {
    const npm = data.packages.filter((pack) => pack.kind === "npm");
    expect(npm.every((pack) => pack.license !== UNKNOWN)).toBe(true);
  });

  it("пояснение говорит и причину, и что это НЕ значит", () => {
    const note = unknownNote(data);
    expect(note).toContain("не объявлено здесь");
    // Главное: «нет в lock» ≠ «нет лицензии».
    expect(note).toContain("а не «лицензии нет»");
  });

  it("когда неизвестных нет — молчим, а не объясняем пустое", () => {
    expect(unknownNote({ ...data, unknown: 0 })).toBe("");
  });
});

describe("копилефт назван громко", () => {
  it("сейчас его нет, и это сказано прямо", () => {
    expect(copyleft(data)).toEqual([]);
  });

  it("если появится — попадёт в список", () => {
    const withGpl = {
      ...data,
      packages: [...data.packages, { name: "x", version: "1", license: "GPL-3.0", kind: "npm" }],
    };
    expect(copyleft(withGpl).map((pack) => pack.name)).toEqual(["x"]);
  });
});

describe("источник и то, чего в таблице нет", () => {
  it("источник называет блокировки", () => {
    expect(source(data)).toContain("Из блокировок");
    expect(source(data)).toContain("npm");
  });

  it("скачиваемое отдельно названо: иначе таблица выглядит полной", () => {
    expect(elsewhere()).toContain("скачиваются отдельно");
  });
});
