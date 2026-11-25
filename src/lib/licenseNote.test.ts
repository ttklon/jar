import { describe, expect, it } from "vitest";
import { buildCheck, extraFor, notice, whereItLives, type Requirement } from "./licenseNote";

/**
 * Шаг 292: уведомление об авторстве — то, что требует свободная лицензия.
 *
 * «Сохранить уведомление» на практике значит: назвать авторов, дать текст
 * целиком, положить туда, где человек найдёт.
 */

const MIT_TEXT =
  "Permission is hereby granted, free of charge, to any person obtaining a copy of this software";

const req = (over: Partial<Requirement> = {}): Requirement => ({
  by: "Maria Petrenko",
  year: 2021,
  license: "mit",
  text: MIT_TEXT,
  ...over,
});

describe("уведомление полное, когда есть все три вещи", () => {
  it("автор и год — в заголовке", () => {
    const got = notice(req(), false, 2026);
    expect(got.ok).toBe(true);
    expect(got.title).toBe("Maria Petrenko (2021)");
  });

  it("текст лицензии целиком, а не имя лицензии", () => {
    expect(notice(req(), false, 2026).body).toContain("Permission is hereby granted");
  });

  it("без автора — неполное", () => {
    const got = notice(req({ by: "  " }), false, 2026);
    expect(got.ok).toBe(false);
    expect(got.missing).toContain("не назван автор");
  });

  it("год из будущего — опечатка, а не смелость", () => {
    const got = notice(req({ year: 2030 }), false, 2026);
    expect(got.ok).toBe(false);
    expect(got.missing.join()).toContain("из будущего");
  });

  it("год не подставляется текущий: старый год — нормально", () => {
    const got = notice(req({ year: 2014 }), false, 2026);
    expect(got.ok).toBe(true);
    expect(got.title).toContain("2014");
  });
});

describe("ссылка не заменяет текст", () => {
  it("без текста — неполное", () => {
    const got = notice(req({ text: "" }), false, 2026);
    expect(got.missing.join()).toContain("текста лицензии нет");
  });

  it("ссылка на сайт не годится: приложение работает без сети", () => {
    const got = notice(req(), true, 2026);
    expect(got.ok).toBe(false);
    expect(got.missing.join()).toContain("без сети");
  });
});

describe("где человек это найдёт", () => {
  it("«О программе», а не файл в папке установки", () => {
    expect(whereItLives()).toContain("О программе");
  });

  it("apache требует помечать изменённые файлы", () => {
    expect(extraFor("apache")).toContain("пометить изменённые файлы");
  });

  it("mit — только сохранить уведомление", () => {
    expect(extraFor("mit")).toEqual(["сохранить уведомление"]);
  });
});

describe("сборка проверяет все уведомления", () => {
  it("все полные — тихо", () => {
    const got = buildCheck([notice(req(), false, 2026)]);
    expect(got.ok).toBe(true);
    expect(got.said).toContain("все полные");
  });

  it("неполное называется по имени, а не «есть проблемы»", () => {
    // Сборка без уведомлений — не ошибка компиляции, поэтому и не замечается.
    const got = buildCheck([notice(req(), false, 2026), notice(req({ by: "" }), false, 2026)]);
    expect(got.ok).toBe(false);
    expect(got.said).toContain("неполных 1 из 2");
  });
});
