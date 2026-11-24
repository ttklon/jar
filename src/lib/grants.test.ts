import { describe, expect, it } from "vitest";
import {
  allows,
  book,
  CHANNELS,
  count,
  EMPTY,
  give,
  KEY,
  load,
  may,
  onRevoke,
  revoke,
  revokeAll,
  save,
  STALE_MS,
  TITLES,
  type Store,
} from "./grants";

/**
 * Шаги 168 и 169: согласие отдельно по каналам, с датой, отзывается немедленно.
 *
 * Согласие по умолчанию — не согласие.
 */

const NOW = Date.parse("2026-11-20T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

function store(init: Record<string, string> = {}): Store & { data: Record<string, string> } {
  const data = { ...init };
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value;
    },
  };
}

describe("по умолчанию — нет", () => {
  it("пустая книга ничего не разрешает", () => {
    for (const channel of CHANNELS) expect(allows(EMPTY, channel)).toBe(false);
    expect(count(EMPTY)).toBe(0);
  });

  it("и это сказано словами, а не пустым местом", () => {
    const lines = book(EMPTY, NOW);
    expect(lines.map((line) => line.said)).toEqual([
      "микрофон: не разрешён — согласия не давали",
      "сеть: не разрешён — согласия не давали",
      "файлы: не разрешён — согласия не давали",
    ]);
  });

  it("битое хранилище — пустая книга, а не «всё разрешено»", () => {
    const broken = store({ [KEY]: "{это не json" });
    expect(count(load(broken))).toBe(0);
  });
});

describe("три канала — три согласия", () => {
  it("микрофон не разрешает ни сеть, ни файлы", () => {
    const got = give(EMPTY, "mic", NOW);
    expect(allows(got, "mic")).toBe(true);
    expect(allows(got, "net")).toBe(false);
    expect(allows(got, "files")).toBe(false);
    expect(count(got)).toBe(1);
  });

  it("каждый канал называется своим словом", () => {
    expect(TITLES.mic).toBe("микрофон");
    expect(TITLES.net).toBe("сеть");
    expect(TITLES.files).toBe("файлы");
  });
});

describe("у согласия есть дата", () => {
  it("дата выдачи видна в строке", () => {
    const got = give(EMPTY, "net", NOW);
    expect(book(got, NOW).find((line) => line.channel === "net")?.said).toBe("сеть: разрешён 2026-11-20");
  });

  it("согласие старше года — не то же, что вчерашнее", () => {
    const got = give(EMPTY, "mic", NOW - STALE_MS - DAY);
    const line = book(got, NOW).find((item) => item.channel === "mic")!;
    expect(line.stale).toBe(true);
    expect(line.said).toContain("переспрошу");
    expect(may(got, "mic", NOW).ok).toBe(false);
    expect(may(got, "mic", NOW).said).toContain("согласие старше года");
  });

  it("свежее согласие даёт работать", () => {
    const got = give(EMPTY, "files", NOW - DAY);
    expect(may(got, "files", NOW).ok).toBe(true);
  });
});

describe("отзыв — немедленный и видимый", () => {
  it("отзыв закрывает канал сразу", () => {
    const gave = give(EMPTY, "mic", NOW - DAY);
    const revoked = revoke(gave, "mic", NOW);
    expect(allows(revoked, "mic")).toBe(false);
  });

  it("дата выдачи не стирается: иначе «отозвано» не проверить", () => {
    const gave = give(EMPTY, "mic", NOW - DAY);
    const revoked = revoke(gave, "mic", NOW);
    expect(revoked.mic.at).toBe(NOW - DAY);
    expect(revoked.mic.revokedAt).toBe(NOW);
    const line = book(revoked, NOW).find((item) => item.channel === "mic")!;
    expect(line.said).toBe("микрофон: отозван 2026-11-20 — до этого был разрешён 2026-11-19");
  });

  it("отозвать всё — одной кнопкой, и ничего не остаётся", () => {
    let b = give(EMPTY, "mic", NOW);
    b = give(b, "net", NOW);
    b = give(b, "files", NOW);
    const none = revokeAll(b, NOW + 1);
    expect(count(none)).toBe(0);
    expect(onRevoke("net").said).toContain("обрывается");
  });

  it("отзыв раньше выдачи не делает согласие действующим", () => {
    // Так бывает после ручной правки файла: отзыв стоит раньше даты выдачи.
    const weird = { ...EMPTY, mic: { channel: "mic" as const, at: NOW, revokedAt: NOW - DAY } };
    expect(allows(weird, "mic")).toBe(false);
  });
});

describe("отзыв говорит, что именно прекращается", () => {
  it("у каждого канала свои действия, а не общее «запрещено»", () => {
    expect(onRevoke("mic").stop).toContain("выключить поток микрофона");
    expect(onRevoke("net").stop).toContain("оборвать загрузку");
    expect(onRevoke("files").stop).toContain("снять разрешённые папки");
  });

  it("и это не «после перезапуска»", () => {
    for (const channel of CHANNELS) {
      expect(onRevoke(channel).said).toContain("сразу");
    }
  });
});

describe("хранение", () => {
  it("записали — прочитали то же самое", () => {
    const s = store();
    const b = give(give(EMPTY, "mic", NOW), "net", NOW - DAY);
    save(s, b);
    const back = load(s);
    expect(back.mic.at).toBe(NOW);
    expect(back.net.at).toBe(NOW - DAY);
    expect(allows(back, "files")).toBe(false);
  });

  it("чужая запись не выдаёт согласие", () => {
    const s = store({ [KEY]: JSON.stringify({ mic: { at: "вчера" }, net: 42 }) });
    expect(count(load(s))).toBe(0);
  });

  it("хранилище, которое отказывает, не роняет приложение", () => {
    const bad: Store = {
      getItem: () => {
        throw new Error("нет доступа");
      },
      setItem: () => {
        throw new Error("нет места");
      },
    };
    expect(() => save(bad, EMPTY)).not.toThrow();
    expect(count(load(bad))).toBe(0);
  });
});
