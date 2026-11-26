import { describe, expect, it } from "vitest";
import { broken, checks, malformed, notDo, parse, summary, type Have } from "./linksInCi";

/**
 * Шаг 478: ссылки и обещания проверяются в CI.
 */

const have: Have = { files: ["docs/GUIDE.md", "src/lib/clean.test.ts"], steps: [452, 478], actions: ["clean"] };

describe("ссылки собираются из текста", () => {
  it("четыре вида", () => {
    const got = parse("см. `file:docs/GUIDE.md`, `step:452`, `action:clean`, `test:src/lib/clean.test.ts`", "docs/A.md");
    expect(got.map((link) => link.to)).toEqual(["file", "step", "action", "test"]);
    expect(got[0]!.where).toBe("docs/A.md");
  });

  it("обычный текст — не ссылка", () => {
    expect(parse("просто текст без ссылок", "docs/A.md")).toEqual([]);
  });

  it("шаг без числа — битая форма", () => {
    expect(malformed({ to: "step", value: "шаг", where: "x" })).toBe(true);
    expect(malformed({ to: "step", value: "452", where: "x" })).toBe(false);
  });
});

describe("битые ссылки называют место", () => {
  it("все существуют — пусто", () => {
    const links = parse("`file:docs/GUIDE.md` `step:452` `action:clean` `test:src/lib/clean.test.ts`", "docs/A.md");
    expect(broken(links, have)).toEqual([]);
  });

  it("файл переименовали — ссылка битая", () => {
    const got = broken([{ to: "file", value: "docs/OLD.md", where: "docs/A.md" }], have);
    expect(got[0]).toBe("docs/A.md → file:docs/OLD.md не существует");
  });

  it("шаг перенумеровали — битая", () => {
    expect(broken([{ to: "step", value: "999", where: "docs/A.md" }], have)[0]).toContain("step:999");
  });

  it("действие удалили — битая", () => {
    expect(broken([{ to: "action", value: "rmAll", where: "docs/A.md" }], have)[0]).toContain("rmAll");
  });

  it("тест есть — ок, нет — битая", () => {
    expect(broken([{ to: "test", value: "src/lib/clean.test.ts", where: "x" }], have)).toEqual([]);
    expect(broken([{ to: "test", value: "src/lib/gone.test.ts", where: "x" }], have)).toHaveLength(1);
  });
});

describe("сводка для CI", () => {
  it("всё на месте — одним предложением", () => {
    const got = summary([{ to: "action", value: "clean", where: "x" }], have);
    expect(got).toContain("все ведут туда, куда обещают");
  });

  it("битые — числом и с указанием, что править", () => {
    const got = summary([{ to: "action", value: "gone", where: "x" }], have);
    expect(got).toContain("битых ссылок 1 из 1");
    expect(got).toContain("правьте документ, а не проверку");
  });
});

describe("чего проверка не делает", () => {
  it("не удаляет ссылку ради зелёного", () => {
    expect(notDo()[0]).toContain("чтобы проверка стала зелёной");
    expect(checks()).toHaveLength(3);
  });
});
