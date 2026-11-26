import { describe, expect, it } from "vitest";
import { checks, decide, notDo, summary, withDeps, type Feature } from "./cutUnproven";

/**
 * Шаг 494: решить, что вырезать — функция, которая не доказана, это долг.
 */

const feature = (over: Partial<Feature> = {}): Feature => ({ name: "массовое переименование", asserted: false, accepted: false, uses: 0, workaround: "переименовать по одному за две минуты", dependsOn: [], ...over });

describe("три исхода, и все по признакам", () => {
  it("не доказана, не нужна, есть обход — резать", () => {
    const got = decide(feature());
    expect(got.verdict).toBe("резать");
    expect(got.why).toContain("долг с процентами");
  });

  it("есть пользователь — сначала доказать, а не резать", () => {
    expect(decide(feature({ uses: 12 })).verdict).toBe("сначала доказать");
  });

  it("нет обхода — сначала доказать", () => {
    expect(decide(feature({ workaround: null })).verdict).toBe("сначала доказать");
  });

  it("доказана тестом и приёмкой — оставить", () => {
    const got = decide(feature({ asserted: true, accepted: true }));
    expect(got.verdict).toBe("оставить");
    expect(got.why).toContain("доказана тестом и приёмкой");
  });

  it("только тест, без приёмки — ещё не доказана", () => {
    expect(decide(feature({ asserted: true, accepted: false, uses: 5 })).verdict).toBe("сначала доказать");
  });
});

describe("чужую опору не режут", () => {
  it("на неё опирается доказанное — нельзя", () => {
    const got = withDeps([feature(), feature({ name: "пакетная чистка", asserted: true, accepted: true, dependsOn: ["массовое переименование"] })]);
    const cut = got.find((decision) => decision.name === "массовое переименование")!;
    expect(cut.verdict).toBe("сначала доказать");
    expect(cut.why).toContain("на неё опирается «пакетная чистка»");
  });

  it("опирается только то, что само режется — можно", () => {
    const got = withDeps([feature(), feature({ name: "другое", dependsOn: ["массовое переименование"] })]);
    expect(got.find((decision) => decision.name === "массовое переименование")!.verdict).toBe("резать");
  });
});

describe("сводка — действие, а не мнение", () => {
  it("резать называет имена", () => {
    const got = summary([feature(), feature({ name: "вторая", asserted: true, accepted: true })]);
    expect(got).toContain("резать 1: массовое переименование");
    expect(got).toContain("оставить 1");
  });

  it("резать нечего — так и сказано", () => {
    expect(summary([feature({ asserted: true, accepted: true })])).toContain("резать нечего");
  });
});

describe("чего решение не делает", () => {
  it("не оставляет «пока так»", () => {
    expect(notDo()[0]).toContain("у «сначала доказать» есть срок");
    expect(checks()).toHaveLength(3);
  });
});
