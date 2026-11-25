import { describe, expect, it } from "vitest";
import { ALLOWED, allowed, audit, offlinePromise, tradeoffs, type Part } from "./localOnly";

/**
 * Шаг 289: Whisper.cpp/Piper — офлайн, бесплатно, предсказуемо.
 *
 * Не взято: компоненты с лицензией, несовместимой с бесплатным распространением.
 */

const part = (over: Partial<Part> = {}): Part => ({
  id: "x",
  name: "Компонент",
  role: "speech-to-text",
  license: "free",
  offline: true,
  ...over,
});

describe("лицензия решает до сборки, а не после", () => {
  it("несовместимая не берётся, и сказано почему", () => {
    const got = allowed(part({ license: "incompatible" }));
    expect(got.ok).toBe(false);
    expect(got.said).toContain("условно-бесплатным");
  });

  it("ограниченная тоже не идёт в сборку", () => {
    const got = allowed(part({ license: "restricted" }));
    expect(got.ok).toBe(false);
    expect(got.said).toContain("распространять");
  });

  it("свободная и без сети — берётся", () => {
    expect(allowed(part()).ok).toBe(true);
  });
});

describe("локальность проверяется, а не обещается", () => {
  it("компонент, который ходит в сеть, — не локальный", () => {
    // У «локальной» библиотеки бывает телеметрия по умолчанию.
    const got = allowed(part({ offline: false }));
    expect(got.ok).toBe(false);
    expect(got.said).toContain("телеметрией");
  });

  it("у каждого разрешённого признак «без сети» есть", () => {
    expect(ALLOWED.every((entry) => entry.offline)).toBe(true);
  });

  it("в разрешённых нет несвободных", () => {
    expect(ALLOWED.every((entry) => entry.license === "free")).toBe(true);
  });
});

describe("контур проверяется целиком", () => {
  it("оба конца разговора нужны", () => {
    const got = audit([part({ id: "stt", role: "speech-to-text" })]);
    expect(got.ok).toBe(false);
    expect(got.said).toContain("разговор не заработает целиком");
  });

  it("полный контур проходит", () => {
    expect(audit(ALLOWED).ok).toBe(true);
    expect(audit(ALLOWED).said).toContain("все без сети");
  });

  it("проблема одного компонента не скрывает другую", () => {
    const got = audit([
      part({ id: "a", role: "speech-to-text", license: "incompatible" }),
      part({ id: "b", role: "text-to-speech", offline: false }),
    ]);
    // Три проблемы, а не две: оба компонента невалидны, значит ни одна роль не
    // покрыта — и это отдельный, третий факт, а не следствие первых двух.
    expect(got.problems.length).toBe(3);
    expect(got.said).toContain("несовместима");
    expect(got.said).toContain("телеметрией");
  });
});

describe("цена локальности названа честно", () => {
  it("медленнее и хуже на редких языках — сказано", () => {
    // Молчать об этом значит обещать то, чего нет.
    const all = tradeoffs().join(" ");
    expect(all).toContain("медленнее");
    expect(all).toContain("редких языках");
  });

  it("обещание офлайна говорит и о постоянстве", () => {
    expect(offlinePromise()).toContain("ни одного байта");
    expect(offlinePromise()).toContain("одинаково каждый раз");
  });
});
