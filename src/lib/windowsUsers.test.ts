import { describe, expect, it } from "vitest";
import { adminNeeded, checks, forSecondUser, notDo, place } from "./windowsUsers";

/**
 * Шаг 447: правильная работа с несколькими пользователями Windows.
 */

describe("личное — в папке пользователя", () => {
  it("память, журнал, настройки", () => {
    for (const data of ["память", "журнал", "настройки"] as const) {
      expect(place(data).where).toBe("appdata");
    }
  });

  it("и сказано почему: второй пользователь не увидит чужое", () => {
    expect(place("память").why).toContain("не должен видеть чужие дела");
  });

  it("модель — общая и только для чтения", () => {
    const got = place("модель");
    expect(got.where).toBe("shared");
    expect(got.why).toContain("можно скачать заново");
  });
});

describe("автозапуск — только свой", () => {
  it("HKCU, а не HKLM", () => {
    expect(place("автозапуск").why).toContain("HKLM запустил бы программу у всех");
  });
});

describe("что видит второй пользователь Windows", () => {
  it("своё, а модель — общая", () => {
    const got = forSecondUser();
    expect(got[0]).toContain("начинает с чистого листа");
    expect(got[2]).toContain("общая");
    expect(got[3]).toContain("пока он сам не включит");
  });
});

describe("администратор — только там, где честно нужен", () => {
  it("установка", () => {
    expect(adminNeeded("install").needed).toBe(true);
  });

  it("автозапуск, память, модель — не нужен", () => {
    for (const what of ["autostart", "memory", "model"] as const) {
      expect(adminNeeded(what).needed).toBe(false);
    }
  });

  it("обновление без администратора — только этому пользователю", () => {
    expect(adminNeeded("update").said).toContain("обновится только этот пользователь");
  });
});

describe("три ошибки, которые видит второй пользователь", () => {
  it("Program Files, HKLM, путаница профилей", () => {
    expect(notDo()).toHaveLength(3);
    expect(checks()).toHaveLength(3);
  });
});
