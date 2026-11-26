import { describe, expect, it } from "vitest";
import { broken, kinds, notDo, report, unchecked, type Promise_ } from "./guidePromises";

/**
 * Шаг 462: каждое обещание GUIDE проверяется тестом или ссылкой на реестр.
 */

const promise = (over: Partial<Promise_> = {}): Promise_ => ({ text: "покажет список до удаления", link: "test:src/lib/dangerPolicy.test.ts", ...over });

const known = ["test:src/lib/dangerPolicy.test.ts", "action:clean_downloads"];

describe("обещание без ссылки — нечем проверить", () => {
  it("найдено по тексту", () => {
    expect(unchecked([promise(), promise({ link: null, text: "спросит подтверждение" })])).toEqual(["спросит подтверждение"]);
  });

  it("пустая ссылка — тоже без проверки", () => {
    expect(unchecked([promise({ link: "  " })])).toHaveLength(1);
  });
});

describe("ссылка проверяется по существу", () => {
  it("всё связано и существует — ошибок нет", () => {
    expect(report([promise(), promise({ link: "action:clean_downloads" })], known).ok).toBe(true);
  });

  it("теста нет — обещание устарело", () => {
    const got = broken([promise({ link: "test:src/lib/нет.test.ts" })], known);
    expect(got[0]!.why).toContain("обещание устарело");
  });

  it("действия нет в реестре", () => {
    const got = broken([promise({ link: "action:нет_такого" })], known);
    expect(got[0]!.why).toContain("нет в реестре");
  });

  it("ссылка не по форме", () => {
    const got = broken([promise({ link: "см. где-то" })], known);
    expect(got[0]!.why).toContain("не по форме");
  });

  it("пустая цель", () => {
    expect(broken([promise({ link: "test:" })], known)[0]!.why).toContain("ничего нет");
  });
});

describe("сводка для CI", () => {
  it("всё связано — можно мержить", () => {
    expect(report([promise()], known).said).toContain("все 1 обещаний связаны");
  });

  it("есть несвязанные — перечислены текстом", () => {
    const got = report([promise({ link: null, text: "спросит подтверждение" })], known);
    expect(got.ok).toBe(false);
    expect(got.said).toContain("без проверки: спросит подтверждение");
  });
});

describe("что считается проверкой", () => {
  it("два вида ссылок и третьего нет", () => {
    expect(kinds()).toHaveLength(2);
  });

  it("три запрета про честность ссылок", () => {
    const got = notDo().join();
    expect(got).toContain("только тест или реестр");
    expect(got).toContain("устареет первым");
  });
});
