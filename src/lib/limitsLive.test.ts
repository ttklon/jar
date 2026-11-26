import { describe, expect, it } from "vitest";
import { checks, notDo, stale, summary, uncovered, whenStale, type Limit } from "./limitsLive";

/**
 * Шаг 473: документ «чего приложение не делает» обновляется вместе с кодом.
 */

const have = { hand: ["clean", "find"], screen: ["home"], module: ["src/lib/clean.ts"] };
const item = (over: Partial<Limit> = {}): Limit => ({ what: "не отправляю письма", anchor: "clean", kind: "hand", ...over });

describe("граница держится якорем", () => {
  it("якорь есть — граница держится", () => {
    expect(stale([item()], have)).toEqual([]);
  });

  it("якорь исчез — граница могла появиться", () => {
    const got = stale([item({ anchor: "send" })], have);
    expect(got[0]).toContain("рука send".replace("рука ", "hand:"));
    expect(got[0]).toContain("могла появиться");
  });

  it("экран и модуль — тоже якоря", () => {
    expect(stale([item({ anchor: "home", kind: "screen" }), item({ anchor: "src/lib/clean.ts", kind: "module", what: "не трогаю чужие файлы" })], have)).toEqual([]);
  });
});

describe("опасные руки описаны", () => {
  it("все описаны — пусто", () => {
    expect(uncovered(["clean"], [item()])).toEqual([]);
  });

  it("опасная рука без границы — названа", () => {
    expect(uncovered(["clean", "removeAll"], [item()])).toEqual(["removeAll"]);
  });

  it("якорь другого вида не закрывает руку", () => {
    expect(uncovered(["clean"], [item({ kind: "module", anchor: "clean" })])).toEqual(["clean"]);
  });
});

describe("сводка", () => {
  it("всё держится — одним предложением", () => {
    const got = summary([item()], have, ["clean"]);
    expect(got.ok).toBe(true);
    expect(got.said).toContain("все держатся");
  });

  it("обе беды сразу — обе названы", () => {
    const got = summary([item({ anchor: "gone" })], have, ["removeAll"]);
    expect(got.ok).toBe(false);
    expect(got.said).toContain("устарели");
    expect(got.said).toContain("опасные руки без границы: removeAll");
  });
});

describe("что делать и чего не делать", () => {
  it("снятое ограничение — в changelog", () => {
    expect(whenStale()[0]).toContain("говорят в changelog");
  });

  it("не удалять строку, чтобы стало зелёным", () => {
    expect(notDo()[0]).toContain("чтобы проверка стала зелёной");
    expect(checks()).toHaveLength(3);
  });
});
