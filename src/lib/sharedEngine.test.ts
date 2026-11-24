import { describe, expect, it } from "vitest";
import { collide, decide, nameOf, order, queueNote, ready, together, type Deed } from "./sharedEngine";

/**
 * Шаг 137: два дела на один движок не идут вместе.
 *
 * Вместе — половина процессора каждому и вдвое дольше оба, вместо быстрого первого.
 */
const deed = (what: string, uses: Deed["uses"], at = 0): Deed => ({ what, uses, at });

describe("ресурсы названы, а не «как-нибудь»", () => {
  it("пересечение видно по имени ресурса", () => {
    expect(collide(["engine", "disk"], ["disk"])).toEqual(["disk"]);
    expect(collide(["engine"], ["screen"])).toEqual([]);
  });

  it("ресурс называется словами", () => {
    expect(nameOf("engine")).toBe("движок");
  });
});

describe("второе дело на тот же движок ждёт", () => {
  it("ждёт и говорит, кого", () => {
    const got = decide(deed("сжать фото", ["engine"]), [{ by: "переименовать фото", uses: ["engine"] }]);
    expect(got.start).toBe(false);
    expect(got.said).toBe("«сжать фото» ждёт движок — сейчас их заняло «переименовать фото»");
  });

  it("разные ресурсы — не ждёт: очередь ради очереди замедляет", () => {
    expect(decide(deed("нажать кнопку", ["screen"]), [{ by: "сжать фото", uses: ["engine"] }]).start).toBe(true);
  });
});

describe("порядок очереди честный", () => {
  it("первым идёт тот, кто пришёл первым", () => {
    expect(order([deed("второе", ["engine"], 20), deed("первое", ["engine"], 10)]).map((d) => d.what)).toEqual([
      "первое",
      "второе",
    ]);
  });
});

describe("в один проход на движок выбирается только одно дело", () => {
  it("второе на движок остаётся ждать", () => {
    const got = ready([deed("первое", ["engine"], 1), deed("второе", ["engine"], 2)], []);
    expect(got.start.map((d) => d.what)).toEqual(["первое"]);
    expect(got.wait.map((w) => w.deed.what)).toEqual(["второе"]);
    expect(got.wait[0]?.said).toContain("ждёт движок");
  });

  it("без пересечения идут сразу оба", () => {
    const got = ready([deed("сжать", ["engine"], 1), deed("нажать", ["screen"], 2)], []);
    expect(got.start).toHaveLength(2);
    expect(queueNote(got)).toContain("ресурсы не пересекаются");
  });

  it("всё занято — так и сказано", () => {
    const got = ready([deed("второе", ["engine"], 2)], [{ by: "первое", uses: ["engine"] }]);
    expect(queueNote(got)).toBe("ничего не запускаю: все ждут");
  });
});

describe("почему очередь не хуже — числом", () => {
  it("два дела вместе занимают вдвое дольше каждое", () => {
    expect(together(2000, 2)).toBe(4000);
  });

  it("по очереди первое кончается за своё время", () => {
    // 2 с первое, а не 4 с оба — вот что даёт очередь.
    expect(together(2000, 1)).toBe(2000);
  });
});
