import { describe, expect, it } from "vitest";
import { attachments, line, reproducible, sbomProblems, vulnerable, type Build, type Component } from "./sbom";

/**
 * Шаг 309: сборка воспроизводима и SBOM на каждый релиз.
 *
 * Человек должен иметь возможность проверить, что мы ему дали.
 */

const build = (over: Partial<Build> = {}): Build => ({
  hash: "aaa111",
  at: 1_700_000_000_000,
  path: "C:\\build\\agent1",
  ...over,
});

const comp = (over: Partial<Component> = {}): Component => ({
  name: "serde",
  version: "1.0.193",
  license: "MIT",
  direct: true,
  ...over,
});

describe("воспроизводимость: две сборки — один хеш", () => {
  it("совпали побайтно", () => {
    const got = reproducible(build(), build({ at: 1_700_000_100_000 }));
    expect(got.ok).toBe(true);
    expect(got.said).toContain("побайтно");
  });

  it("время в бинарнике — названная причина, а не «не воспроизводится»", () => {
    const got = reproducible(build(), build({ hash: "bbb222", at: 1_700_000_100_000 }));
    expect(got.ok).toBe(false);
    expect(got.said).toContain("время сборки");
  });

  it("путь сборки назван целиком", () => {
    const got = reproducible(build(), build({ hash: "bbb222", path: "D:\\other" }));
    expect(got.said).toContain("путь сборки");
  });

  it("разница не в метаданных — тоже факт", () => {
    expect(reproducible(build(), build({ hash: "bbb222" })).said).toContain("порядок файлов");
  });
});

describe("SBOM отвечает на настоящие вопросы", () => {
  it("только прямые — уязвимость приходит с транзитивной", () => {
    const got = sbomProblems([comp()]);
    expect(got.join()).toContain("только прямые");
  });

  it("полный список проходит", () => {
    expect(sbomProblems([comp(), comp({ name: "libc", direct: false })])).toEqual([]);
  });

  it("без лицензии — список назван по именам", () => {
    const got = sbomProblems([comp({ license: "unknown" }), comp({ name: "z", direct: false })]);
    expect(got.join()).toContain("без лицензии 1");
    expect(got.join()).toContain("serde");
  });

  it("без версии компонент не найти в базе уязвимостей", () => {
    expect(sbomProblems([comp({ version: "" }), comp({ name: "z", direct: false })]).join()).toContain("не найти в базе");
  });

  it("пустой SBOM — его не собирали", () => {
    expect(sbomProblems([])[0]).toContain("не собирали");
  });

  it("строка для «О программе» читается глазами", () => {
    expect(line(comp({ direct: false }))).toBe("serde 1.0.193 — MIT, транзитивная");
  });
});

describe("уязвимость — что человеку делать", () => {
  it("задет используемый путь — обновляем в ближайшем релизе", () => {
    expect(vulnerable(comp(), true)).toContain("обновляем в ближайшем релизе");
  });

  it("не задет — плановый порядок, без паники", () => {
    expect(vulnerable(comp(), false)).toContain("не используем");
  });
});

describe("к релизу приложено", () => {
  it("четыре вещи, без «и так далее»", () => {
    const got = attachments();
    expect(got.length).toBe(4);
    expect(got.join()).toContain("SBOM");
    expect(got.join()).not.toContain("так далее");
  });
});
