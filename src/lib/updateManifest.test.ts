import { describe, expect, it } from "vitest";
import { compare, offer, revocations, switchChannel, type Manifest } from "./updateManifest";

/**
 * Шаг 303: подписанный манифест обновлений, каналы stable/beta, отзыв версии.
 *
 * Если подменят манифест, человек поставит что угодно — подпись установщика не спасёт.
 */

const release = (version: string, channel: "stable" | "beta", over = {}) => ({
  version,
  channel,
  url: `https://example.org/${version}.exe`,
  sha256: "ab12",
  ...over,
});

const manifest = (over: Partial<Manifest> = {}): Manifest => ({
  signatureValid: true,
  releases: [release("1.0", "stable"), release("1.1", "stable"), release("2.0", "beta")],
  ...over,
});

describe("версия сравнивается числами", () => {
  it("2.10 новее 2.9, а не старше", () => {
    // Строковое сравнение даёт обратное.
    expect(compare("2.10", "2.9")).toBe(1);
  });

  it("1.0 и 1.0.0 — одно и то же", () => {
    expect(compare("1.0", "1.0.0")).toBe(0);
  });

  it("младшая цифра решает", () => {
    expect(compare("1.0.1", "1.0.2")).toBe(-1);
  });
});

describe("неподписанный манифест — стоп целиком", () => {
  it("обновление отложено, даже если версия есть", () => {
    const got = offer(manifest({ signatureValid: false }), "1.0", "stable");
    expect(got.version).toBeNull();
    expect(got.said).toContain("даже если в нём есть версия");
  });

  it("канал не меняется по неподписанному манифесту", () => {
    expect(switchChannel(manifest({ signatureValid: false }), "1.0", "beta").ok).toBe(false);
  });
});

describe("каналы не пересекаются молча", () => {
  it("в stable человек не видит 2.0 из beta", () => {
    expect(offer(manifest(), "1.0", "stable").version).toBe("1.1");
  });

  it("в beta видит 2.0", () => {
    expect(offer(manifest(), "1.0", "beta").version).toBe("2.0");
  });

  it("переход на stable с beta назван понижением, а не «обновлением»", () => {
    const got = switchChannel(manifest(), "2.0", "stable");
    expect(got.said).toContain("это понижение версии");
  });

  it("переход на beta — обновление", () => {
    expect(switchChannel(manifest(), "1.0", "beta").said).toContain("а не откат");
  });
});

describe("отзыв важнее обновления", () => {
  it("отозванную версию не предлагают, даже если она новее", () => {
    const got = offer(
      manifest({ releases: [release("1.0", "stable"), release("1.1", "stable", { revoked: true, revokedBecause: "падала на старых видеокартах" })] }),
      "1.0",
      "stable",
    );
    expect(got.version).toBeNull();
    expect(got.said).toContain("падала на старых видеокартах");
  });

  it("если есть неотозванная поновее — предлагают её", () => {
    const got = offer(
      manifest({
        releases: [release("1.0", "stable"), release("1.1", "stable", { revoked: true }), release("1.2", "stable")],
      }),
      "1.0",
      "stable",
    );
    expect(got.version).toBe("1.2");
  });

  it("отзывы видны списком, а не в логе", () => {
    const got = revocations(manifest({ releases: [release("1.1", "stable", { revoked: true, revokedBecause: "потеря памяти" })] }));
    expect(got[0]).toContain("потеря памяти");
  });

  it("отзыв без причины так и называется", () => {
    expect(revocations(manifest({ releases: [release("1.1", "stable", { revoked: true })] }))[0]).toContain("причина не указана");
  });
});

describe("обновлений может не быть — это тоже ответ", () => {
  it("последняя версия — так и говорим", () => {
    const got = offer(manifest(), "1.1", "stable");
    expect(got.version).toBeNull();
    expect(got.said).toContain("последняя в канале stable");
  });
});
