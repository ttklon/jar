import { describe, expect, it } from "vitest";
import { offlineReady, tell, verify, whyBefore, type Downloaded, type Expected, type Signature } from "./updateVerify";

/**
 * Шаг 312: проверка подписи и хеша скачанного обновления до запуска.
 *
 * Человек ничего не видел и не выбирал — проверка обязана быть строже.
 */

const file: Downloaded = { bytes: 42_000_000, sha256: "ab12", tempPath: "C:\\Temp\\upd.exe" };
const expected: Expected = { bytes: 42_000_000, sha256: "ab12", publisher: "ZShelper" };
const sig = (over: Partial<Signature> = {}): Signature => ({
  present: true,
  publisher: "ZShelper",
  chainValid: true,
  revoked: false,
  ...over,
});

describe("порядок: размер, хеш, подпись, потом запуск", () => {
  it("всё сошлось — применяем", () => {
    const got = verify(file, expected, sig());
    expect(got.action).toBe("install");
    expect(got.said).toContain("можно применять");
  });

  it("обрыв загрузки ловится размером", () => {
    expect(verify({ ...file, bytes: 41_000_000 }, expected, sig()).said).toContain("оборвалась");
  });

  it("хеш не совпал — не применяем", () => {
    expect(verify({ ...file, sha256: "cd34" }, expected, sig()).said).toContain("подменён");
  });
});

describe("обновление без подписи не применяется вовсе", () => {
  it("даже если хеш сошёлся", () => {
    const got = verify(file, expected, sig({ present: false, publisher: null }));
    expect(got.action).toBe("stop");
    expect(got.said).toContain("некому спросить человека");
  });

  it("цепочка не сходится — стоп", () => {
    expect(verify(file, expected, sig({ chainValid: false })).said).toContain("не нашей цепочкой");
  });

  it("сертификат отозван — ждём нового выпуска", () => {
    expect(verify(file, expected, sig({ revoked: true })).said).toContain("ждём нового выпуска");
  });

  it("подписал чужой — назван по имени", () => {
    expect(verify(file, expected, sig({ publisher: "Другой" })).said).toContain("а ожидали «ZShelper»");
  });
});

describe("проверка работает без сети", () => {
  it("всё на диске — можно применять в самолёте", () => {
    expect(offlineReady(file, expected, sig())).toBe(true);
  });

  it("чего-то не хватает — не «попробуем позже», а нет", () => {
    expect(offlineReady({ ...file, bytes: 1 }, expected, sig())).toBe(false);
  });
});

describe("человеку — одна строка, без хешей", () => {
  it("применяем — сказано, когда", () => {
    expect(tell("install", "")).toContain("после закрытия");
  });

  it("не применяем — программа работает как раньше", () => {
    expect(tell("stop", "хеш не совпал")).toContain("работает как раньше");
  });
});

describe("почему проверять до, а не после", () => {
  it("распакованный файл уже в папке программы", () => {
    expect(whyBefore()).toContain("до проверки");
  });
});
