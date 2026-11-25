import { describe, expect, it } from "vitest";
import { manifest, postflight, preflight, report, type After, type Baseline } from "./cleanMachine";

/**
 * Шаг 307: проверка целостности после установки на чистой машине.
 *
 * CI ставит в контейнер, где уже есть всё; чистая Windows — другое дело.
 */

const base = (over: Partial<Baseline> = {}): Baseline => ({
  windows: "Windows 10 22H2",
  webView2: true,
  bits: 64,
  user: "anna",
  freeMb: 20_000,
  ...over,
});

const after = (over: Partial<After> = {}): After => ({
  launched: true,
  windowShown: true,
  russianRenders: true,
  dataPath: "%LOCALAPPDATA%\\ZShelper\\data",
  freeMb: 14_000,
  ...over,
});

describe("до установки: то, чего в контейнере не бывает", () => {
  it("готовая машина — проблем нет", () => {
    expect(preflight(base(), 10_000)).toEqual([]);
  });

  it("нет WebView2 — самый частый «не запускается»", () => {
    const got = preflight(base({ webView2: false }), 10_000);
    expect(got[0]?.problem).toContain("WebView2");
    expect(got[0]?.step).toContain("Microsoft");
  });

  it("32-разрядная Windows — прямо сказано", () => {
    expect(preflight(base({ bits: 32 }), 10_000).map((i) => i.step).join()).toContain("64-разрядная версия");
  });

  it("мало места — с шагом, а не «недостаточно ресурсов»", () => {
    const got = preflight(base({ freeMb: 500 }), 10_000);
    expect(got[0]?.step).toContain("другой диск");
  });

  it("кириллица в имени — проверка, а не запрет", () => {
    const got = preflight(base({ user: "Анна Петрова" }), 10_000);
    expect(got[0]?.step).toContain("ничего делать не надо");
  });
});

describe("после установки", () => {
  it("всё работает — проблем нет", () => {
    expect(postflight(after(), base())).toEqual([]);
  });

  it("не запустилось — сказано, где смотреть", () => {
    const got = postflight(after({ launched: false }), base());
    expect(got[0]?.step).toContain("журнал первого запуска");
  });

  it("запустилось, окна нет — это другой факт, не «не запустилось»", () => {
    const got = postflight(after({ windowShown: false }), base());
    expect(got[0]?.problem).toContain("окна нет");
  });

  it("русский не виден — назвать шрифт, а не «поставьте шрифты»", () => {
    const got = postflight(after({ russianRenders: false }), base());
    expect(got[0]?.step).not.toBe("поставьте шрифты");
    expect(got[0]?.step).toContain("шрифт");
  });

  it("кириллица в профиле, а папка легла не туда — ловим", () => {
    const got = postflight(after({ dataPath: "C:\\data" }), base({ user: "Анна" }));
    expect(got.map((i) => i.step).join()).toContain("подстановку пути");
  });
});

describe("целостность — с хешами, а не «файлы на месте»", () => {
  it("манифест сортирован и считает файлы", () => {
    const got = manifest([
      { path: "b.dll", sha256: "22" },
      { path: "a.exe", sha256: "11" },
    ]);
    expect(got.count).toBe(2);
    expect(got.text.split("\n")[0]).toContain("a.exe");
  });
});

describe("отчёт — три строки, ни одной лишней", () => {
  it("версия, пользователь, запуск", () => {
    const got = report(base({ webView2: false }), after({ windowShown: false }));
    expect(got.split("\n").length).toBe(3);
    expect(got).toContain("WebView2: нет");
    expect(got).toContain("окно: нет");
  });
});
