import { describe, expect, it } from "vitest";
import { after, notSync, pack, type Bundle } from "./profileTransfer";

/**
 * Шаг 407: перенос профиля на новую машину файлом — как в Obsidian.
 */

const bundle = (over: Partial<Bundle> = {}): Bundle => ({
  version: 1,
  person: { id: "anna", name: "Анна" },
  facts: ["аллергия на кошек"],
  grants: [{ risk: "delete", scope: "C:\\Users\\anna\\Загрузки" }],
  from: "старый ноутбук",
  ...over,
});

describe("один файл, который несёшь с собой", () => {
  it("собирается в JSON с версией", () => {
    const got = pack(bundle());
    expect(got.ok).toBe(true);
    expect(JSON.parse(got.text).version).toBe(1);
    expect(got.said).toContain("1 фактов, 1 разрешений");
  });

  it("без имени — не собираем и говорим почему", () => {
    const got = pack({ ...bundle(), person: { id: "x", name: "  " } });
    expect(got.ok).toBe(false);
    expect(got.said).toContain("станет «я»");
  });
});

describe("новая машина другая", () => {
  it("папка есть — разрешение действует", () => {
    const got = after(bundle(), ["C:\\Users\\anna\\Загрузки"]);
    expect(got.askAgain).toEqual([]);
    expect(got.said).toContain("1 разрешений действуют");
  });

  it("папки нет — разрешение не выбрасывается молча, а идёт в переподтверждение", () => {
    const got = after(bundle(), ["D:\\"]);
    expect(got.askAgain[0]).toContain("такой папки здесь нет");
    expect(got.said).toContain("потеряли силу");
  });

  it("имя и факты переносятся как есть", () => {
    const got = after(bundle(), []);
    expect(got.stays).toContain("имя: Анна");
    expect(got.stays).toContain("факт: аллергия на кошек");
  });

  it("модель и журнал остаются на старой машине", () => {
    const got = after(bundle(), []).left.join();
    expect(got).toContain("про машину");
    expect(got).toContain("журнал дел");
  });

  it("«всё» действует на любой машине", () => {
    const got = after(bundle({ grants: [{ risk: "delete", scope: "всё" }] }), []);
    expect(got.askAgain).toEqual([]);
  });
});

describe("перенос — не синхронизация", () => {
  it("три запрета, включая «не переписывает пути»", () => {
    const got = notSync().join();
    expect(got).toContain("не связывает машины");
    expect(got).toContain("честно исчезает");
  });
});
