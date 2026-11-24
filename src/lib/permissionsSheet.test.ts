import { describe, expect, it } from "vitest";
import { channels, filled, sheet, summary, type Grant } from "./permissionsSheet";

/**
 * Шаг 179: «что тебе разрешено» — на одном экране.
 *
 * Граница была разрезана на пять мест, и складывать её в голове — работа, которую
 * делают один раз и наполовину.
 */

const NOW = Date.parse("2026-11-20T12:00:00Z");

const grants: Grant[] = [
  { channel: "mic", title: "микрофон", at: NOW - 86_400_000, revokedAt: null },
  { channel: "net", title: "сеть", at: null, revokedAt: null },
  { channel: "files", title: "файлы", at: Date.parse("2023-11-14T22:13:20Z"), revokedAt: NOW - 1000 },
];

const never = [
  { what: "не двигаю деньги", proof: "риск money — отказ политики" },
  { what: "не подписываю за человека", proof: "риск identity — отказ политики" },
];

describe("каналы: дата, отзыв и честное «не давали»", () => {
  it("разрешён — видно когда", () => {
    expect(channels(grants)[0]!.said).toBe("микрофон: разрешён 2026-11-19");
  });

  it("не давали — это не «нет»: так и сказано", () => {
    expect(channels(grants)[1]!.state).toBe("never-given");
    expect(channels(grants)[1]!.said).toContain("согласия не давали");
  });

  it("отозвано — не «не давали»: видно и дату отзыва, и что было разрешено", () => {
    const got = channels(grants)[2]!;
    expect(got.state).toBe("no");
    expect(got.said).toContain("отозвано 2026-11-20");
    expect(got.said).toContain("до этого было разрешено 2023-11-14");
  });
});

describe("четыре исхода, а не список галочек", () => {
  const rows = sheet({ grants, folders: { allow: [], except: [] }, hosts: ["huggingface.co"], deed: null, never, now: NOW });

  it("разрешено — с датой и сроком", () => {
    const allowed = rows.filter((row) => row.kind === "allowed");
    expect(allowed.some((row) => row.what === "сеть: huggingface.co")).toBe(true);
    expect(allowed.find((row) => row.what === "сеть: huggingface.co")!.detail).toContain("и его поддоменов");
  });

  it("ждёт слова — то, о чём спросят, а не то, что уже можно", () => {
    const waiting = rows.filter((row) => row.kind === "waiting");
    expect(waiting).toHaveLength(1);
    expect(waiting[0]!.detail).toContain("каждое отдельно");
  });

  it("запрещено — с местом, где срабатывает, а не с обещанием", () => {
    const forbidden = rows.filter((row) => row.kind === "forbidden");
    expect(forbidden).toHaveLength(2);
    expect(forbidden[0]!.detail).toContain("отказ политики");
  });

  it("пустые папки — «нет вовсе», и это не запрет, а отсутствие предела", () => {
    const absent = rows.filter((row) => row.kind === "absent");
    expect(absent.some((row) => row.what === "разрешённые папки")).toBe(true);
    expect(absent.find((row) => row.what === "разрешённые папки")!.detail).toContain("«разрешить всё» кнопки нет");
  });
});

describe("папки: предел и исключения внутри него", () => {
  it("папка разрешена — названы закрытые места внутри", () => {
    const rows = sheet({
      grants: [],
      folders: { allow: ["C:\\Фото"], except: ["C:\\Фото\\Личное"] },
      hosts: [],
      deed: null,
      never: [],
      now: NOW,
    });
    const folder = rows.find((row) => row.what === "файлы: C:\\Фото")!;
    expect(folder.detail).toBe("внутри неё закрыто: C:\\Фото\\Личное");
  });
});

describe("согласие на одно дело — со сроком, а не «навсегда»", () => {
  it("действует — видно дело и дату конца", () => {
    const rows = sheet({
      grants: [],
      folders: { allow: [], except: [] },
      hosts: [],
      deed: { key: "разобрать фото", until: NOW + 3_600_000 },
      never: [],
      now: NOW,
    });
    const deed = rows.find((row) => row.kind === "allowed" && row.what.startsWith("дело"))!;
    expect(deed.detail).toBe("вне списка папок, только это дело и только до 2026-11-20");
  });

  it("кончилось — не показывается как действующее", () => {
    const rows = sheet({
      grants: [],
      folders: { allow: [], except: [] },
      hosts: [],
      deed: { key: "старое", until: NOW - 1 },
      never: [],
      now: NOW,
    });
    expect(rows.some((row) => row.what.startsWith("дело"))).toBe(false);
  });
});

describe("итог проверяем, а не «всё под контролем»", () => {
  const rows = sheet({ grants, folders: { allow: [], except: [] }, hosts: ["huggingface.co"], deed: null, never, now: NOW });

  it("числа по группам", () => {
    expect(summary(rows)).toBe("разрешено 2 · ждёт вашего слова 1 · не делаю никогда 2 · нет вовсе 2");
  });

  it("пустая сводка — не «ничего не разрешено», а «не собралась»", () => {
    expect(filled([])).toBe(false);
    expect(summary([])).toContain("такого не бывает");
  });

  it("собранная сводка отвечает на вопрос", () => {
    expect(filled(rows)).toBe(true);
  });
});
