import { describe, expect, it } from "vitest";
import { checks, install, leftovers, neverLeft, uninstall } from "./cleanUninstall";

/**
 * Шаг 448: установка и удаление через понятные места, без «мусора».
 */

describe("установка знает все свои места", () => {
  it("пять мест без автозапуска", () => {
    expect(install(false)).toHaveLength(5);
  });

  it("автозапуск появляется только по выбору", () => {
    expect(install(true)).toHaveLength(6);
  });

  it("память и модель — не «программа»", () => {
    const places = install(false);
    expect(places.find((p) => p.what.includes("память"))!.withProgram).toBe(false);
    expect(places.find((p) => p.what.includes("модель"))!.withProgram).toBe(false);
  });
});

describe("удаление — программа целиком, данные по выбору", () => {
  it("сохранить данные — так и сказано", () => {
    const got = uninstall(false, true);
    expect(got.said).toContain("память и модель оставлю");
    expect(got.choice).toHaveLength(2);
  });

  it("стереть всё — честно про «не вернуть»", () => {
    expect(uninstall(false, false).said).toContain("вернуть не получится");
  });

  it("что удалится точно — три места без автозапуска", () => {
    expect(uninstall(false, true).sure).toHaveLength(3);
  });

  it("с автозапуском — четыре", () => {
    expect(uninstall(true, true).sure).toHaveLength(4);
  });
});

describe("после удаления не остаётся лишнего", () => {
  it("данные сохранены — только папка и модель", () => {
    expect(leftovers(true)).toHaveLength(2);
  });

  it("данные стёрты — пусто", () => {
    expect(leftovers(false)).toEqual([]);
  });
});

describe("чего не должно оставаться никогда", () => {
  it("ярлык и запись в списке программ", () => {
    expect(neverLeft(false)).toHaveLength(2);
  });

  it("запись автозапуска без программы — ошибка Windows при входе", () => {
    expect(neverLeft(true).join()).toContain("на несуществующую программу");
  });

  it("три проверки", () => {
    expect(checks()).toHaveLength(3);
  });
});
