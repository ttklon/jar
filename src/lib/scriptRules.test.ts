import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  answer,
  BANNED,
  check,
  KERNEL,
  limits,
  limitsLine,
  profileAge,
  profileLine,
  STALE_DAYS,
} from "./scriptRules";

/**
 * Шаг 165: внешние скрипты и профили — проверка до запуска, лимиты, таймауты.
 *
 * Правило существовало в ядре и узнавалось человеком **после** нажатия.
 */

describe("запрещённое — по одному списку, и отказ называет кусок", () => {
  it("`iex` ловится и объясняется, а не просто «нельзя»", () => {
    const got = check("iex (Get-Content script.ps1)");
    expect(got).toHaveLength(1);
    expect(got[0]?.why).toBe("выполнение строки как кода");
    expect(answer("iex (1)").said).toContain("выполнение строки как кода");
  });

  it("регистр не помогает обойти проверку", () => {
    expect(check("INVOKE-EXPRESSION $x")).toHaveLength(1);
  });

  it("скачивание и повышение прав — разные причины, а не одна", () => {
    const got = check("Invoke-WebRequest http://x; Start-Process -Verb RunAs cmd");
    const reasons = got.map((item) => item.why);
    expect(reasons).toContain("скачивание из сети");
    expect(reasons).toContain("повышение прав");
  });

  it("чистый скрипт проходит и не говорит лишнего", () => {
    const got = answer("Get-ChildItem C:\\Фото | Measure-Object");
    expect(got.ok).toBe(true);
    expect(got.said).toBe("");
  });

  it("отказ говорит, что ничего не выполнялось — а не «попробуйте ещё»", () => {
    expect(answer("del /s C:\\").said).toContain("ничего не выполнялось");
  });
});

describe("список не разошёлся с ядром", () => {
  it("пары в `hand.rs` и здесь — одни и те же", () => {
    // Правило живёт в двух местах, потому что нужно и в ядре (запуск), и в
    // интерфейсе (показ). Разойтись они не должны — это проверка на данных.
    const rust = readFileSync(new URL("../../src-tauri/src/hand.rs", import.meta.url), "utf8");
    const block = /pub const FORBIDDEN[^=]*= &\[([\s\S]*?)\n\];/.exec(rust)?.[1] ?? "";
    const pairs = [...block.matchAll(/\("((?:[^"\\]|\\.)*)",\s*"((?:[^"\\]|\\.)*)"\)/g)].map((m) => ({
      piece: m[1]!.replace(/\\\\/g, "\\"),
      why: m[2]!.replace(/\\\\/g, "\\"),
    }));
    expect(pairs.length).toBeGreaterThan(20);
    expect(BANNED.map((item) => item.piece)).toEqual(pairs.map((item) => item.piece));
    expect(BANNED.map((item) => item.why)).toEqual(pairs.map((item) => item.why));
  });
});

describe("лимиты — до нажатия и числом", () => {
  it("порог и вывод названы словами, а не подразумеваются", () => {
    expect(limitsLine(limits("cell"))).toBe(
      "в клетке: до 20 с, вывод до 2000 знаков — дольше не дам, больше не покажу",
    );
  });

  it("снаружи клетки — не больше, чем в клетке", () => {
    const got = limits("outside", { seconds: 60, output: 9000, where: "cell" });
    expect(got.seconds).toBe(20);
    expect(got.output).toBe(2000);
  });

  it("профиль не запускается вовсе — и это сказано", () => {
    expect(limitsLine(limits("profile"))).toContain("он описывает шаги, а не выполняет их");
  });

  it("числа по умолчанию — те же, что в ядре", () => {
    expect(KERNEL.seconds).toBe(20);
    expect(KERNEL.output).toBe(2000);
  });

  it("и они совпадают с `trial.rs`, а не с памятью", () => {
    const rust = readFileSync(new URL("../../src-tauri/src/trial.rs", import.meta.url), "utf8");
    expect(rust).toContain(`pub const MAX_OUTPUT: usize = ${KERNEL.output};`);
    expect(rust).toContain(`pub const TIMEOUT: Duration = Duration::from_secs(${KERNEL.seconds});`);
  });
});

describe("старый профиль называется старым", () => {
  const now = Date.parse("2026-11-20T12:00:00Z");

  it("свежий — без предупреждения", () => {
    const got = profileAge("2026-11-19T12:00:00Z", now);
    expect(got.stale).toBe(false);
    expect(got.said).toBe("проверен вчера");
  });

  it("давний — с последствием, а не просто «давно»", () => {
    const got = profileAge("2025-10-16T12:00:00Z", now);
    expect(got.stale).toBe(true);
    expect(got.said).toContain("якоря могли съехать");
  });

  it("непонятная дата — «считайте, что давно», а не «свежий»", () => {
    expect(profileAge("не дата", now).stale).toBe(true);
  });

  it("дата из будущего — разошлись часы", () => {
    expect(profileAge("2027-01-01T00:00:00Z", now).said).toContain("часы машины разошлись");
  });

  it("порог назван числом и русскими падежами", () => {
    expect(STALE_DAYS).toBe(180);
    expect(profileAge("2026-11-17T12:00:00Z", now).said).toBe("проверен 3 дня назад");
    expect(profileAge("2026-11-10T12:00:00Z", now).said).toContain("10 дней назад");
  });

  it("«профиль есть» — не ответ: названы возраст, стек и якоря", () => {
    expect(
      profileLine({ app: "Notepad", verified_at: "2026-11-18T12:00:00Z", ui_stack: "UIA", anchors: 12 }, now),
    ).toBe("Notepad: проверен 2 дня назад, стек UIA, 12 якорей");
  });
});
