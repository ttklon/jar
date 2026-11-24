/**
 * Проверка версии Windows и WebView2 — **до** первого разговора.
 *
 * Шаг 35. Зачем это здесь, а не в отказе. Самая частая причина «белого окна» —
 * старый WebView2 или не тот Windows, и человек узнаёт об этом не заранее, а
 * когда приложение уже не открылось. Проверка после отказа бесполезна: экрана,
 * который мог бы сказать «вот что не так», в этот момент нет.
 *
 * Что можно проверить честно, а что нельзя:
 *
 *  * **платформу — можно.** `navigator.userAgentData.platform` (или
 *    `navigator.platform`) говорит «Windows» и даёт версию системы в
 *    `getHighEntropyValues`. В WebView2 это доступно;
 *  * **версию WebView2 — можно.** Движок WebView2 — это Chromium, и старшая
 *    цифра в версии UA (`Edg/120.0…` → 120) совпадает с его мажорной версией.
 *    Это не «точная проверка установщика», и называть её так нельзя: наш код
 *    видит тот движок, который уже запущен, а не тот, что будет завтра;
 *  * **что делать — обязательно.** Проверка без действия — это ещё один отказ
 *    текстом. У каждой причины есть путь: обновить Windows, поставить WebView2.
 *
 * Поэтому модуль возвращает **три состояния**, а не «ок/не ок»: `ok`,
 * `unsupported` (с причиной и действием) и `unknown` (не смогли прочитать).
 * `unknown` — не `ok`: «не знаю» и «всё хорошо» — разные вещи, и путать их
 * значит обещать то, чего не проверял.
 */

/** Что известно о машине. Ровно то, что нужно для решения. */
export interface PlatformFacts {
  /** `"windows"`, `"macos"`, `"linux"`, `"android"`, `"ios"` или что-то ещё. */
  os: string;
  /** Версия системы `"10.0.19045"`, если её удалось прочитать. */
  osVersion: string | null;
  /** Старшая цифра движка WebView2 (Chromium), если удалось прочитать. */
  engineMajor: number | null;
  /**
   * Архитектура, если её удалось прочитать: `"x86"` — 64-битная, `"arm64"`,
   * `"arm"`, `"x86-32"`. Шаг 224.
   *
   * Это не любопытство. На Windows ARM64 x86-сборка не «просто работает»: она
   * идёт через эмуляцию, и человек получает приложение, которое запускается и
   * медленно делает вид, что работает. Честнее сказать «на ARM64 в этой сборке
   * не поддерживается» и объяснить, чем это грозит, — тихая неработоспособность
   * хуже отказа.
   */
  arch: string | null;
}

export type PlatformVerdict =
  | { state: "ok"; facts: PlatformFacts }
  | { state: "unsupported"; facts: PlatformFacts; reason: PlatformProblem }
  | { state: "unknown"; facts: PlatformFacts; reason: PlatformProblem };

/** Что не так. Причина — отдельно от текста: текст может меняться, решение — нет. */
export type PlatformProblem =
  | "not-windows"
  | "old-windows"
  | "old-webview"
  | "unreadable"
  /** ARM64: сборка x86 пойдёт через эмуляцию и будет тихо тормозить. Шаг 224. */
  | "unsupported-arch";

/**
 * Архитектуры, на которых эта сборка не поддерживается. x86-сборка под ARM64
 * идёт через эмуляцию: запускается, но медленно и с неработающими частями
 * (движок, голос, горячие клавиши). Лучше сказать словами.
 */
export const UNSUPPORTED_ARCH = new Set(["arm64", "arm"]);

/** Windows 10 — минимум: WebView2 есть начиная с него, а на 7/8 его ставят руками. */
export const MIN_WINDOWS_MAJOR = 10;

/**
 * Минимальный мажор WebView2 (Chromium).
 *
 * 109 — последняя версия Chromium с поддержкой Windows 8.1/7 и одновременно
 * разумная граница для Web Audio и `getUserMedia`, на которых стоит разговор.
 * Более старые движки не гарантируют то, на чём держится экран «Голос».
 */
export const MIN_ENGINE_MAJOR = 109;

/**
 * Прочитать факты из того, что даёт WebView2.
 *
 * Принимает сам `navigator`, а не читает его внутри: так функцию можно
 * проверить без браузера, и это единственный способ проверить «старый движок» —
 * на настоящей машине он один, и он новый.
 */
export function readFacts(nav: unknown): PlatformFacts {
  const source = (nav ?? {}) as {
    userAgent?: string;
    platform?: string;
    userAgentData?: { platform?: string; architecture?: string };
  };

  const ua = typeof source.userAgent === "string" ? source.userAgent : "";
  const rawPlatform =
    (typeof source.userAgentData?.platform === "string" && source.userAgentData.platform) ||
    (typeof source.platform === "string" && source.platform) ||
    "";

  const os = normaliseOs(rawPlatform, ua);
  const osVersion = parseWindowsVersion(ua, os);
  const engineMajor = parseEngineMajor(ua);
  // Архитектура: `userAgentData.architecture` есть не везде; в UA она спрятана
  // в скобках (`Win64; x64`, `ARM64`). Не прочитали — `null`, а не «x86»:
  // догадка о железе — это ровно та тихая неработоспособность, против которой шаг.
  const arch = parseArch(source.userAgentData?.architecture, ua);

  return { os, osVersion, engineMajor, arch };
}

function normaliseOs(raw: string, ua: string): string {
  const value = raw.toLowerCase();
  if (value.includes("win")) return "windows";
  if (value.includes("mac")) return "macos";
  if (value.includes("android")) return "android";
  if (value.includes("ios") || value.includes("iphone") || value.includes("ipad")) return "ios";
  if (value.includes("linux")) return "linux";
  // Пустая платформа — не повод считать, что всё хорошо: пробуем UA, а если и
  // там ничего, оставляем пусто (это `unknown`, а не «подходит»).
  if (/windows/i.test(ua)) return "windows";
  if (/macintosh|mac os x/i.test(ua)) return "macos";
  if (/android/i.test(ua)) return "android";
  if (/iphone|ipad/i.test(ua)) return "ios";
  if (/linux/i.test(ua)) return "linux";
  return "";
}

/**
 * Версия Windows из UA.
 *
 * Две ловушки: Windows 11 в UA по-прежнему пишется как `Windows NT 10.0`
 * (Microsoft так решила ради совместимости), а `Windows NT 6.x` — это 7/8/8.1.
 * Поэтому `10.0` считаем «10 или новее» и не пытаемся отличить 11 от 10: для
 * решения это не важно, а угадывать — врать.
 */
function parseWindowsVersion(ua: string, os: string): string | null {
  if (os !== "windows") return null;
  const nt = /Windows NT (\d+\.\d+)/i.exec(ua);
  if (nt) return nt[1] ?? null;
  // `Windows Phone` и прочее сюда не попадает намеренно: это не наша машина.
  return null;
}

/**
 * Архитектура из `architecture` или UA (шаг 224).
 *
 * Порядок проб важен: `ARM64` в UA идёт **раньше** `x86`/`Win64`, потому что в
 * строке ARM64-машины может встретиться и то и другое (`Windows NT 10.0;
 * ARM64; …`), а путать ARM с x86 — значит пропустить именно отказ.
 */
function parseArch(arch: string | undefined, ua: string): string | null {
  const known = typeof arch === "string" ? arch.toLowerCase() : "";
  if (known === "arm64" || known === "arm" || known === "x86" || known === "x64") {
    return known === "x64" ? "x86" : known;
  }
  if (/arm64|aarch64/i.test(ua)) return "arm64";
  if (/\barm\b/i.test(ua)) return "arm";
  if (/win64|x64|wow64/i.test(ua)) return "x86";
  if (/x86/i.test(ua)) return "x86-32";
  return null;
}

/** Старшая цифра движка: `Chrome/120.0.0.0` или `Edg/120.0.2210.91`. */
function parseEngineMajor(ua: string): number | null {
  const edg = /Edg\/(\d+)/.exec(ua);
  if (edg) return Number(edg[1]);
  const chrome = /Chrome\/(\d+)/.exec(ua);
  if (chrome) return Number(chrome[1]);
  return null;
}

/**
 * Решение по фактам.
 *
 * Порядок важен: «не Windows» раньше «старый Windows», «нет версии движка»
 * раньше «старый движок». Иначе о причине сообщается не та, и человек чинит не
 * то — например, ставит WebView2 на Mac.
 */
export function decide(facts: PlatformFacts): PlatformVerdict {
  if (facts.os === "") return { state: "unknown", facts, reason: "unreadable" };
  if (facts.os !== "windows") return { state: "unsupported", facts, reason: "not-windows" };

  if (facts.osVersion === null) {
    // Платформа Windows, а версии нет: сказать «подходит» было бы догадкой.
    return { state: "unknown", facts, reason: "unreadable" };
  }
  const major = Number(facts.osVersion.split(".")[0]);
  // Windows NT 6.x — это 7/8/8.1. Числа «6» в маркетинге нет, но сравнение по
  // старшей цифре NT даёт верный ответ и без таблицы маркетинговых имён.
  if (Number.isFinite(major) && major < MIN_WINDOWS_MAJOR) {
    return { state: "unsupported", facts, reason: "old-windows" };
  }

  // Архитектура — **до** движка: на ARM64 движок x86-сборки покажется новым, и
  // проверка движка сказала бы «подходит» машине, где приложение еле шевелится.
  if (facts.arch !== null && UNSUPPORTED_ARCH.has(facts.arch)) {
    return { state: "unsupported", facts, reason: "unsupported-arch" };
  }

  if (facts.engineMajor === null) return { state: "unknown", facts, reason: "unreadable" };
  if (facts.engineMajor < MIN_ENGINE_MAJOR) {
    return { state: "unsupported", facts, reason: "old-webview" };
  }

  return { state: "ok", facts };
}

/** Одна строка для журнала: что проверено, а не только «ок». */
export function describe(verdict: PlatformVerdict): string {
  const { facts } = verdict;
  const os =
    facts.os === "" ? "система не прочитана" : facts.os === "windows" ? `Windows ${facts.osVersion ?? "версия не прочитана"}` : facts.os;
  const engine = facts.engineMajor === null ? "движок не прочитан" : `движок ${facts.engineMajor}`;
  const arch = facts.arch === null ? "" : `, ${facts.arch}`;
  switch (verdict.state) {
    case "ok":
      return `${os}, ${engine}${arch} — подходит`;
    case "unsupported":
      return `${os}, ${engine}${arch} — не подходит: ${verdict.reason}`;
    default:
      return `${os}, ${engine}${arch} — проверить не удалось`;
  }
}
