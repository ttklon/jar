import { describe, expect, it } from "vitest";
import {
  MIN_ENGINE_MAJOR,
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
  return { os: "windows", osVersion: "10.0", engineMajor: 120, ...partial };
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
