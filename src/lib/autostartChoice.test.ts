import { describe, expect, it } from "vitest";
import { behaviour, checks, notDo, show, toggle } from "./autostartChoice";

/**
 * Шаг 443: автозапуск при входе — по желанию, и отключается там же.
 */

describe("по умолчанию выключен", () => {
  it("записи нет", () => {
    expect(toggle(false).entries).toBe(0);
  });

  it("выключенный автозапуск сказан словами", () => {
    expect(show(false, 0).said).toContain("не запускается");
  });

  it("включается в настройках, а не в Диспетчере задач", () => {
    expect(show(true, 1).where).toContain("Настройки");
  });
});

describe("включение — одна запись", () => {
  it("ровно одна", () => {
    const got = toggle(true);
    expect(got.entries).toBe(1);
    expect(got.said).toContain("путь в кавычках");
  });

  it("две записи — названная ошибка, а не тихая правка", () => {
    const got = show(true, 2);
    expect(got.said).toContain("2 записей автозапуска — это ошибка");
    expect(got.said).toContain("Уберите лишние здесь же");
  });
});

describe("выключение убирает запись", () => {
  it("не «отключена», а нет вовсе", () => {
    const got = toggle(false);
    expect(got.said).toContain("а не «отключена»");
  });
});

describe("тихий старт — смысл автозапуска", () => {
  it("в трее, без окна", () => {
    expect(behaviour()).toContain("окно не открывается");
  });
});

describe("проверки и запреты", () => {
  it("три проверки", () => {
    expect(checks()).toHaveLength(3);
  });

  it("не включается сам и не требует администратора", () => {
    const got = notDo().join();
    expect(got).toContain("только галочкой");
    expect(got).toContain("HKCU");
  });
});
