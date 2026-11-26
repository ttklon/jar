import { describe, expect, it } from "vitest";
import { build, checks, count, fromCommit, notDo, PREFIXES, type Entry } from "./changelogGen";

/**
 * Шаг 474: changelog генерируется из реестра и коммитов.
 */

const entry = (over: Partial<Entry> = {}): Entry => ({ what: "новая фраза «почисти загрузки»", from: "registry", kind: "новое", area: "clean", ...over });

describe("из коммитов — только то, что видит человек", () => {
  it("feat/fix/break читаются", () => {
    expect(fromCommit("feat: понимает «почисти загрузки»")?.kind).toBe("новое");
    expect(fromCommit("fix: окно больше не уезжает")?.kind).toBe("исправлено");
    expect(fromCommit("break: горячая клавиша теперь другая")?.kind).toBe("изменилось");
  });

  it("chore/test/docs/refactor — не для человека", () => {
    for (const subject of ["chore: обновил зависимости", "test: добавил тест", "docs: поправил README", "refactor: вынес функцию"]) {
      expect(fromCommit(subject)).toBeNull();
    }
  });

  it("не коммит — null", () => {
    expect(fromCommit("просто текст")).toBeNull();
  });

  it("три префикса, и все с двумя точками", () => {
    expect(Object.keys(PREFIXES)).toEqual(["feat:", "fix:", "break:"]);
  });
});

describe("порядок видов", () => {
  it("новое → изменилось → исправлено → убрано", () => {
    const got = build([
      entry({ what: "убрано старое", kind: "убрано" }),
      entry({ what: "исправлено окно", kind: "исправлено" }),
      entry({ what: "новое дело", kind: "новое" }),
      entry({ what: "изменилось поведение", kind: "изменилось" }),
    ]);
    expect(got.map((line) => line.split(":")[0])).toEqual(["Новое", "Изменилось", "Исправлено", "Убрано"]);
  });
});

describe("дубль реестр+коммит", () => {
  it("остаётся реестр — он точнее", () => {
    // Коммит идёт первым: без отдельного правила остался бы он, а реестр точнее.
    const got = build([
      entry({ what: "понимает «почисти загрузки»", from: "commit", kind: "новое", prefix: "feat:" }),
      entry({ what: "Понимает «почисти загрузки»", from: "registry", kind: "исправлено" }),
    ]);
    expect(got).toHaveLength(1);
    expect(got[0]).toContain("Исправлено:");
  });

  it("два коммита про одно — один остаётся", () => {
    const got = build([
      entry({ what: "почисти загрузки", from: "commit", kind: "новое", prefix: "feat:" }),
      entry({ what: "почисти загрузки", from: "commit", kind: "новое", prefix: "feat:" }),
    ]);
    expect(got).toHaveLength(1);
  });

  it("счёт совпадает с длиной", () => {
    expect(count([entry(), entry({ what: "другое" })])).toBe(2);
  });
});

describe("чего генератор не делает", () => {
  it("не придумывает строк", () => {
    expect(notDo()[0]).toContain("не придумывает");
    expect(checks()).toHaveLength(3);
  });

  it("пустая строка не попадает", () => {
    expect(build([entry({ what: "  " })])).toEqual([]);
  });
});
