import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { welcome } from "../i18n/ru";
import {
  MIN_ENGINE_MAJOR,
  MIN_WINDOWS_MAJOR,
  decide,
  describe as describeVerdict,
  readFacts,
  type PlatformFacts,
} from "./platform";

/** Настоящий UA WebView2 на Windows 10, как его видит страница. */
const WIN10_EDGE =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.2210.91";
/** Тот же движок на Windows 7: UA пишет NT 6.1, хотя «Windows 10» в marketing — нет. */
const WIN7_EDGE =
  "Mozilla/5.0 (Windows NT 6.1; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36 Edg/109.0.1518.78";
/** Старый движок на свежей системе — так выглядит непереустановленный WebView2. */
const WIN10_OLD_ENGINE =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.164 Safari/537.36 Edg/91.0.864.71";
const MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

function facts(partial: Partial<PlatformFacts> = {}): PlatformFacts {
  // Шаг 224: `arch` — обязательное поле фактов. По умолчанию x86 (обычная
  // машина), чтобы старые проверки не превращались молча в «архитектура не
  // прочитана».
  return { os: "windows", osVersion: "10.0", engineMajor: 120, arch: "x86", ...partial };
}

describe("проверка Windows и WebView2 до первого разговора (шаг 35)", () => {
  it("свежая машина подходит, и это сказано числами, а не словом «ок»", () => {
    const verdict = decide(readFacts({ userAgent: WIN10_EDGE, platform: "Win32" }));
    expect(verdict.state).toBe("ok");
    if (verdict.state !== "ok") throw new Error("ожидалось ok");
    expect(verdict.facts.os).toBe("windows");
    expect(verdict.facts.engineMajor).toBe(120);

    // В журнал идёт что проверено, а не только вердикт.
    const line = describeVerdict(verdict);
    expect(line).toContain("Windows 10.0");
    expect(line).toContain("движок 120");
    expect(line).toContain("подходит");
  });

  it("Windows 7 не считается подходящим, хотя UA пишет NT 6.1", () => {
    const verdict = decide(readFacts({ userAgent: WIN7_EDGE, platform: "Win32" }));
    expect(verdict.state).toBe("unsupported");
    if (verdict.state !== "unsupported") throw new Error("ожидалось unsupported");
    // Причина — версия системы, а не движок: он-то как раз новый для той системы.
    expect(verdict.reason).toBe("old-windows");
  });

  it("старый WebView2 — отдельная причина, а не «сломалось»", () => {
    const verdict = decide(readFacts({ userAgent: WIN10_OLD_ENGINE, platform: "Win32" }));
    expect(verdict.state).toBe("unsupported");
    if (verdict.state !== "unsupported") throw new Error("ожидалось unsupported");
    expect(verdict.reason).toBe("old-webview");
    expect(MIN_ENGINE_MAJOR).toBe(109);
  });

  it("не Windows — сказано прямо, без попытки «всё равно сойдёт»", () => {
    const verdict = decide(readFacts({ userAgent: MAC, platform: "macOS" }));
    expect(verdict.state).toBe("unsupported");
    if (verdict.state !== "unsupported") throw new Error("ожидалось unsupported");
    expect(verdict.reason).toBe("not-windows");
    // И это не то же самое, что «старый Windows»: лечится по-разному.
    expect(verdict.reason).not.toBe("old-windows");
  });

  it("«не прочитал» — не «подходит»: пустая платформа это unknown", () => {
    const verdict = decide(readFacts({ userAgent: "", platform: "" }));
    expect(verdict.state).toBe("unknown");
    if (verdict.state !== "unknown") throw new Error("ожидалось unknown");
    expect(verdict.reason).toBe("unreadable");
  });

  it("Windows без версии — тоже unknown, а не «наверное, ок»", () => {
    const verdict = decide(facts({ osVersion: null }));
    expect(verdict.state).toBe("unknown");
    expect(describeVerdict(verdict)).toContain("проверить не удалось");
  });

  it("без версии движка — unknown: догадываться нельзя", () => {
    const verdict = decide(facts({ engineMajor: null }));
    expect(verdict.state).toBe("unknown");
    if (verdict.state !== "unknown") throw new Error("ожидалось unknown");
    expect(verdict.reason).toBe("unreadable");
  });

  it("порядок причин: не-Windows важнее старого движка", () => {
    // Mac со старым Chromium: сказать «обновите WebView2» было бы бессмысленно.
    const verdict = decide(facts({ os: "macos", engineMajor: 80, osVersion: null }));
    expect(verdict.state).toBe("unsupported");
    if (verdict.state !== "unsupported") throw new Error("ожидалось unsupported");
    expect(verdict.reason).toBe("not-windows");
  });

  it("Windows 10 читается из UA и на русской системе", () => {
    // UA не зависит от языка системы — это и проверяем: не смотрим на locale.
    const facts = readFacts({ userAgent: WIN10_EDGE, platform: "Win32" });
    expect(facts.osVersion).toBe("10.0");
  });

  it("userAgentData важнее platform: так говорит сам движок", () => {
    const facts = readFacts({
      userAgent: WIN10_EDGE,
      platform: "драконий отдел",
      userAgentData: { platform: "Windows" },
    });
    expect(facts.os).toBe("windows");
  });
});

/**
 * Шаг 224: ARM64/GPU — честное «не поддерживается» вместо тихой
 * неработоспособности.
 *
 * Дефект был ровно тихим: `readFacts` читал систему и версию движка, но не
 * архитектуру, и на Windows ARM64 x86-сборка получала вердикт «подходит» —
 * запускалась через эмуляцию и медленно делала вид, что работает. Человек в этот
 * момент думает, что плохое приложение, а не что сборка не та.
 */
describe("ARM64: отказ словами, а не тихая эмуляция (шаг 224)", () => {
  // Реальная строка UA с Windows на ARM64: `ARM64` стоит в скобках платформы.
  const ARM64_UA =
    "Mozilla/5.0 (Windows NT 10.0; ARM64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.2210.91";

  it("архитектура читается из UA, а не угадывается", () => {
    expect(readFacts({ userAgent: ARM64_UA, platform: "Win32" }).arch).toBe("arm64");
    expect(readFacts({ userAgent: WIN10_EDGE, platform: "Win32" }).arch).toBe("x86");
  });

  it("ARM64 не получает «подходит», хотя движок новый", () => {
    // Это и был дефект: движок 120 — свежий, и проверка движка говорила «ок».
    const verdict = decide(readFacts({ userAgent: ARM64_UA, platform: "Win32" }));
    expect(verdict.state).toBe("unsupported");
    if (verdict.state === "unsupported") expect(verdict.reason).toBe("unsupported-arch");
  });

  it("и это сказано словами: что будет и чего не будет", () => {
    const verdict = decide(readFacts({ userAgent: ARM64_UA, platform: "Win32" }));
    const reason = verdict.state === "unsupported" ? verdict.reason : "unreadable";
    const text = welcome.platformProblem(reason);
    expect(text).toContain("ARM64");
    expect(text).toContain("эмуляцию");
    // Почему это хуже отказа: человек должен понять, что дело в сборке, а не в нём.
    expect(text).toContain("сборка под ARM64");
  });

  it("`architecture` из userAgentData важнее UA", () => {
    // UA может врать: в WebView2 на ARM64 иногда остаётся x86-строка.
    const nav = { userAgent: WIN10_EDGE, platform: "Win32", userAgentData: { architecture: "arm64" } };
    expect(readFacts(nav).arch).toBe("arm64");
    expect(decide(readFacts(nav)).state).toBe("unsupported");
  });

  it("не прочитали архитектуру — это не «x86»: вердикт остаётся честным", () => {
    // Догадка о железе — та же тихая неработоспособность с другой стороны.
    expect(readFacts({ userAgent: "Mozilla/5.0", platform: "Win32" }).arch).toBeNull();
  });

  it("обычная x86-машина подходит, и архитектура названа в строке журнала", () => {
    const factsHere = readFacts({ userAgent: WIN10_EDGE, platform: "Win32" });
    expect(decide(factsHere).state).toBe("ok");
    expect(describeVerdict(decide(factsHere))).toContain("x86");
  });
});

/**
 * Шаг 225: WebView2 может отсутствовать **вовсе** — и тогда проверка платформы
 * на JavaScript не запускается ни разу.
 *
 * Здесь проверяется то, что можно проверить без Rust: нативная проверка
 * существует, читает **обе** ветви реестра и не паникует при отсутствии движка.
 * Сам Rust в этой среде не собирается (`cargo` нет), поэтому текстовые проверки
 * ниже — не замена компилятору, а хранитель решений: их нельзя тихо отменить,
 * не заметив.
 */
describe("WebView2 до первого окна (шаг 225)", () => {
  const rust = readFileSync(new URL("../../src-tauri/src/webview2.rs", import.meta.url), "utf8");
  const lib = readFileSync(new URL("../../src-tauri/src/lib.rs", import.meta.url), "utf8");

  it("проверка есть и вызывается **до** Builder, а не после", () => {
    expect(lib).toContain("webview2::check()");
    // Порядок в файле: проверка стоит в `run()` **до** первого `tauri::Builder`.
    // Ищем **вызов**, а не упоминание: `tauri::Builder` встречается и в
    // комментариях, и первое вхождение оказалось комментарием — проверка
    // ловила бы не то, что называет.
    const firstBuilder = lib.indexOf("tauri::Builder::default()");
    expect(lib.indexOf("webview2::check()")).toBeLessThan(firstBuilder);
  });

  it("при отсутствии движка — выход с кодом 2, а не паника «приложение не собралось»", () => {
    // Именно так выглядел дефект: `.expect("приложение не собралось")` — паника
    // без окна, без причины и без действия.
    //
    // Проверять **наличие** трёх строк мало: первая версия теста была зелёной
    // даже когда условие заменили на `if false` — все слова на месте, связи нет.
    // Поэтому смотрим блок целиком: `should_stop` → окно → выход, по порядку.
    const start = lib.indexOf("if webview2::should_stop(");
    expect(start).toBeGreaterThan(-1);
    const block = lib.slice(start, start + 400);
    const instruction = block.indexOf("show_webview2_instruction()");
    const exit = block.indexOf("std::process::exit(2)");
    expect(instruction).toBeGreaterThan(-1);
    expect(exit).toBeGreaterThan(instruction);
    expect(block).not.toContain("if false");
  });

  it("читаются обе ветви реестра: иначе половина машин с WebView2 получит отказ", () => {
    expect(rust).toContain("WOW6432Node");
    expect(rust).toContain("EdgeUpdate");
    expect(rust).toContain("REGISTRY_KEYS.len(), 2");
  });

  it("«не смог прочитать» — не «нет»: иначе отказ там, где всё в порядке", () => {
    expect(rust).toContain("Present::Unknown");
    expect(rust).toContain("matches!(state, Present::No)");
  });

  it("инструкция называет действие и адрес, а не код ошибки", () => {
    expect(rust).toContain("developer.microsoft.com/microsoft-edge/webview2");
    expect(rust).toContain("Bootstrapper");
    expect(rust).toContain("права администратора");
    // Код ошибки не в инструкции человеку (в комментариях он законен).
    const instructionText = rust.slice(rust.indexOf("pub const INSTRUCTION"), rust.indexOf("/// Итог проверки"));
    expect(instructionText).not.toContain("0x");
  });

  it("текст инструкции безопасен для format!: ни скобок, ни кавычек", () => {
    // `{` в `format!` — подстановка, `"` — конец строки. Текст, который попадает
    // в шаблон окна, обязан быть обычным текстом.
    const instruction = rust.slice(rust.indexOf("pub const INSTRUCTION"), rust.indexOf("/// Итог проверки"));
    expect(instruction).not.toContain("{");
    expect(instruction).not.toContain("}");
  });

  it("без окна остаётся файл: урезанная система не оставит человека без слов", () => {
    expect(lib).toContain("webview2-missing.txt");
  });
});

/**
 * Шаг 238: старые Windows — честное «не поддерживается» вместо тихого отказа.
 *
 * В JavaScript проверка была (шаг 35), и она верная. Дефект нашёлся в **нативном**
 * коде: проверка WebView2 (шаг 225) знала только «движок есть / нет» и версию
 * системы не смотрела вовсе. На Windows 7 с установленным WebView2 приложение
 * уверенно запускалось: «движок есть» ещё не значит «система подходит».
 */
describe("старые Windows: отказ до окна, а не после (шаг 238)", () => {
  const rust = readFileSync(new URL("../../src-tauri/src/webview2.rs", import.meta.url), "utf8");
  const lib = readFileSync(new URL("../../src-tauri/src/lib.rs", import.meta.url), "utf8");

  it("нативная проверка читает версию системы, а не только наличие движка", () => {
    expect(rust).toContain("windows_major");
    expect(rust).toContain("CurrentMajorVersionNumber");
    // До десятки первого ключа не существует: без **второй ветви** любая старая
    // система считалась бы десяткой. Проверяется не упоминание ключа, а то, что
    // при пустом DWORD управление доходит до `CurrentVersion`: первая версия
    // теста была зелёной, когда ветвь убрали.
    // Границы функции — по маркерам, а не по отступу: внутри вложенные скобки,
    // и первый вариант обрезал её на середине.
    const from = rust.indexOf("pub fn windows_major");
    const fn = rust.slice(from, rust.indexOf("pub fn check", from));
    // Ищем **имя значения** (`"/v", "CurrentVersion"`), а не упоминание слова:
    // оно встречается и в пути реестра (`...\\Windows NT\\CurrentVersion`),
    // и первая версия проверки именно на это и наткнулась.
    const fallback = fn.indexOf('"/v",\n                "CurrentVersion"');
    const earlyReturn = fn.indexOf("return major;");
    expect(fallback).toBeGreaterThan(-1);
    // Есть проверка «нашлось — вернуть сразу», а не безусловный `return major`.
    expect(fn).toContain("if major.is_some()");
    expect(earlyReturn).toBeGreaterThan(fn.indexOf("if major.is_some()"));
    // И вторая ветвь идёт **после** этого возврата.
    expect(fallback).toBeGreaterThan(earlyReturn);
  });

  it("минимум — десятая версия, и он назван один раз", () => {
    expect(rust).toContain("MIN_WINDOWS_MAJOR: u32 = 10");
    // Совпадение с JavaScript-проверкой: две правды об одном не должны разойтись.
    expect(MIN_WINDOWS_MAJOR).toBe(10);
  });

  it("отказ — до открытия окна, с кодом 3 и окном-инструкцией", () => {
    // Проверять **наличие** трёх строк мало: первая версия была зелёной, когда
    // условие заменили на `if false`. Смотрим блок целиком: `supported` → окно
    // → выход, по порядку, без `false`.
    const start = lib.indexOf("let major = webview2::windows_major();");
    expect(start).toBeGreaterThan(-1);
    const block = lib.slice(start, start + 400);
    const condition = block.indexOf("if !webview2::supported(major)");
    const shown = block.indexOf("show_old_windows()");
    const exit = block.indexOf("std::process::exit(3)");
    expect(condition).toBeGreaterThan(-1);
    expect(shown).toBeGreaterThan(condition);
    expect(exit).toBeGreaterThan(shown);
    expect(block).not.toContain("if false");
    // И всё это до первого `tauri::Builder`.
    expect(start).toBeLessThan(lib.indexOf("tauri::Builder::default()"));
  });

  it("нечитаемый реестр не превращается в отказ", () => {
    // Отказ должен опираться на факт, иначе приложение не запустится там, где
    // всё в порядке, только реестр закрыт.
    expect(rust).toContain("supported(None)");
    const body = rust.slice(rust.indexOf("pub fn supported"));
    const fn = body.slice(0, body.indexOf("\n}\n"));
    expect(fn).toContain("None => true");
  });

  it("текст отказа называет версии и снимает вину с человека", () => {
    // «Тихий отказ» на 7 выглядит как «запустилось, но половина не работает» —
    // и человек ищет причину в приложении.
    expect(rust).toContain("Windows 10");
    expect(rust).toContain("не ваша вина");
    // Файл пишет `lib.rs` — там, где показывается окно: у урезанной системы окно
    // может не показаться, и слова должны остаться хоть где-то.
    expect(lib).toContain("windows-too-old.txt");
  });

  it("и граница возможного названа: Chromium 109 — последний для 7/8.1", () => {
    // Из этого и следует, что «обновите WebView2» на 7 — совет, который нельзя
    // выполнить дальше 109.
    expect(MIN_ENGINE_MAJOR).toBe(109);
  });

  it("вёрстка окна про старую систему безопасна для format!", () => {
    const text = rust.slice(rust.indexOf("pub const OLD_WINDOWS"), rust.indexOf("/// Итог проверки"));
    expect(text).not.toContain("{");
    expect(text).not.toContain("}");
  });
});
