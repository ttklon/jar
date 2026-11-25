import { describe, expect, it } from "vitest";
import { antivirusSays, expired, noSignature, verify, type Facts, type Package } from "./signedPackage";

/**
 * Шаг 302: подпись сборки и проверка скачанного пакета — без исключений.
 *
 * Собственный бинарник кажется «своим», и его проверку откладывают первой.
 */

const pkg: Package = { name: "ZShelper-setup.exe", bytes: 41_000_000 };

const facts = (over: Partial<Facts> = {}): Facts => ({
  expectedBytes: 41_000_000,
  hash: "ab12",
  actualHash: "ab12",
  signed: true,
  publisher: "ZShelper",
  us: "ZShelper",
  valid: true,
  ...over,
});

describe("проверка до запуска, по порядку", () => {
  it("всё сошлось — запускаем", () => {
    const got = verify(pkg, facts());
    expect(got.verdict).toBe("run");
    expect(got.said).toContain("хеш совпал");
  });

  it("размер не тот — стоп, даже если хеш «как будто» есть", () => {
    const got = verify(pkg, facts({ expectedBytes: 42_000_000 }));
    expect(got.verdict).toBe("stop");
    expect(got.said).toContain("скачалось не то");
  });

  it("хеш не совпал — файл изменился после публикации", () => {
    const got = verify(pkg, facts({ actualHash: "cd34" }));
    expect(got.verdict).toBe("stop");
    expect(got.said).toContain("изменился после публикации");
  });

  it("подпись недействительна — подмена, а не «мелкое предупреждение»", () => {
    const got = verify(pkg, facts({ valid: false }));
    expect(got.verdict).toBe("stop");
    expect(got.said).toContain("подменён");
  });

  it("подписал чужой — это чужой пакет", () => {
    const got = verify(pkg, facts({ publisher: "Другой установщик" }));
    expect(got.verdict).toBe("stop");
    expect(got.said).toContain("чужой пакет");
  });
});

describe("отсутствие подписи — факт, а не приговор", () => {
  it("не вирус, но и не «всё хорошо»: спрашиваем", () => {
    const got = verify(pkg, facts({ signed: false, publisher: undefined }));
    expect(got.verdict).toBe("ask");
    expect(got.said).toContain("не знаем, кто сделал");
  });

  it("человеку сказано, что делать", () => {
    expect(noSignature("ZShelper-setup.exe")).toContain("Сверьте хеш");
  });
});

describe("просроченный сертификат ≠ подделка", () => {
  it("с меткой времени подпись остаётся действительной", () => {
    const got = expired(true);
    expect(got.ok).toBe(true);
    expect(got.said).toContain("метка времени");
  });

  it("без метки — проверить нечем", () => {
    expect(expired(false).ok).toBe(false);
  });
});

describe("антивирус", () => {
  it("правильный ответ — не «добавьте в исключения»", () => {
    const got = antivirusSays();
    expect(got).toContain("не отключайте");
    expect(got).not.toContain("исключени");
  });
});
