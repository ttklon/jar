import { describe, expect, it } from "vitest";
import { allow, check, ok, partial, runnable, say, type Pinned } from "./pinned";
import { networkAddresses } from "../ipc/dev";

/**
 * Шаг 72: скачивание только с закреплённого адреса и с проверкой хеша.
 *
 * Здесь не новый механизм, а общее правило: правила жили в разных местах, и
 * каждый новый файл требовал вспомнить их заново.
 */
const HASH = "a".repeat(64);
const file = (over: Partial<Pinned> = {}): Pinned => ({
  url: "https://example.com/model.gguf",
  sha256: HASH,
  bytes: 1_100_000_000,
  ...over,
});

describe("что не закреплено — то не скачивается", () => {
  it("https и хеш — можно", () => {
    expect(allow(file()).ok).toBe(true);
  });

  it("по http файл можно подменить по дороге", () => {
    // Проверка хеша скажет «файл не тот» уже после загрузки, а это поздно.
    const refused = allow(file({ url: "http://example.com/model.gguf" }));
    expect(refused.ok).toBe(false);
    expect(refused.ok === false ? refused.why : "").toContain("https");
  });

  it("без хеша — отказ, а не «проверка не удалась»", () => {
    // Файл без хеша нельзя проверить в принципе.
    const refused = allow(file({ sha256: "" }));
    expect(refused.ok).toBe(false);
    expect(refused.ok === false ? refused.why : "").toContain("нечем");
  });

  it("хеш не похож на sha256 — видимость проверки, а не проверка", () => {
    expect(allow(file({ sha256: "abc" })).ok).toBe(false);
    expect(allow(file({ sha256: "z".repeat(64) })).ok).toBe(false);
  });

  it("отрицательного размера не бывает", () => {
    expect(allow(file({ bytes: -1 })).ok).toBe(false);
  });
});

describe("после скачивания проверяется всё", () => {
  it("размер ловит недокачанный файл дёшево, до чтения четырёх гигабайт", () => {
    const got = check(file(), { bytes: 1_000, sha256: HASH });
    expect(got.ok).toBe(false);
    expect(got.ok === false ? got.why : "").toContain("недокачан");
  });

  it("хеш ловит подмену, даже если размер сошёлся", () => {
    // Подменить файл того же размера — обычное дело.
    const got = check(file(), { bytes: 1_100_000_000, sha256: "b".repeat(64) });
    expect(got.ok).toBe(false);
    expect(got.ok === false ? got.why : "").toContain("хеш");
  });

  it("регистр хеша не важен", () => {
    expect(check(file(), { bytes: 1_100_000_000, sha256: HASH.toUpperCase() }).ok).toBe(true);
  });

  it("размер неизвестен — проверяем то, что есть", () => {
    // `bytes: 0` значит «размер не закреплён», и это не отказ: хеш всё равно
    // поймает подмену.
    expect(check(file({ bytes: 0 }), { bytes: 999, sha256: HASH }).ok).toBe(true);
  });
});

describe("недокачанное не занимает место настоящего", () => {
  it("скачивается во временное имя", () => {
    // Без `.part` недокачанный файл занимает место настоящего, и следующая
    // проверка его уже не отличит.
    expect(partial("/модели/model.gguf")).toBe("/модели/model.gguf.part");
  });

  it("временный файл не запускается ни при каких условиях", () => {
    expect(runnable("/модели/model.gguf.part")).toBe(false);
    expect(runnable("/модели/model.gguf")).toBe(true);
  });
});

describe("отказ называет, что именно не так", () => {
  it("причина названа, а не «ошибка загрузки»", () => {
    // «Ошибка загрузки» заставляет искать поломку у себя.
    const refused = allow(file({ url: "http://x/model" }));
    expect(refused.ok).toBe(false);
    expect(say({ why: refused.ok === false ? refused.why : "" })).toContain("не скачиваю");
  });

  it("успех говорит, что проверили", () => {
    // Проверка, которая ничем не отличается от её отсутствия, бесполезна.
    const said = ok(file());
    expect(said).toContain("закреплённого адреса");
    expect(said).toContain("хеш совпал");
    expect(said).toContain("1.1 ГБ");
  });

describe("правило общее: все настоящие адреса закреплены", () => {
  it("ни один адрес приложения не скачивается без закрепления", async () => {
    // Это и есть «сделать общим правилом»: новый файл нельзя добавить в список,
    // не закрепив его адрес и хеш, — тест упадёт.
    const list = await networkAddresses();
    expect(list.length).toBeGreaterThan(0);
    for (const address of list) {
      const verdict = allow({
        url: address.url,
        sha256: address.pinned_sha256,
        bytes: address.bytes,
      });
      expect(verdict.ok, `${address.purpose}: ${verdict.ok === false ? verdict.why : ""}`).toBe(true);
    }
  });
});
});
