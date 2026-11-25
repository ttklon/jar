import { describe, expect, it } from "vitest";
import { OURS, TAKEN, check, combo, free, parse, type Binding } from "./windowsKeys";

/**
 * Шаг 283: Microsoft PowerToys — горячие клавиши и утилиты без обучения.
 *
 * PowerToys выигрывает не функциями, а тем, что не надо учиться. Наши сочетания
 * должны жить по тем же правилам: занимать свободное, не ломать чужое, называть
 * конфликт.
 */

describe("сочетание сравнивается без учёта порядка", () => {
  it("Ctrl+Shift+T = Shift+Ctrl+T", () => {
    // Иначе одно и то же сочетание считалось бы разным при разном порядке.
    expect(combo({ ctrl: true, shift: true, key: "t" })).toBe(combo({ shift: true, ctrl: true, key: "t" }));
  });

  it("регистр клавиши не важен", () => {
    expect(combo({ ctrl: true, key: "K" })).toBe("ctrl+k");
  });

  it("разбор строки записи", () => {
    expect(parse("Ctrl+Shift+T")).toEqual({ ctrl: true, shift: true, key: "t" });
    expect(parse("Control+K")).toEqual({ ctrl: true, key: "k" });
  });

  it("одни модификаторы — не сочетание", () => {
    expect(parse("Ctrl+Shift")).toBeNull();
  });

  it("две клавиши без модификатора — опечатка", () => {
    expect(parse("Ctrl+A+B")).toBeNull();
  });
});

describe("занимать только свободное", () => {
  it("Ctrl+C занят — и сказано чем", () => {
    // Иначе человек решит, что сломано приложение, а не сочетание.
    const got = free({ ctrl: true, key: "c" });
    expect(got.ok).toBe(false);
    expect(got.said).toContain("копировать");
  });

  it("Win+Shift+S занят ножницами Windows", () => {
    expect(free({ win: true, shift: true, key: "s" }).said).toContain("ножницы");
  });

  it("без модификатора — обычная клавиша для набора", () => {
    const got = free({ key: "k" });
    expect(got.ok).toBe(false);
    expect(got.said).toContain("для набора текста");
  });

  it("свободное сочетание названо свободным", () => {
    expect(free({ ctrl: true, key: "space" }).ok).toBe(true);
  });
});

describe("свои сочетания не конфликтуют", () => {
  it("все наши свободны", () => {
    expect(check(OURS).ok).toBe(true);
    expect(check(OURS).said).toContain("свободны");
  });

  it("разговор и палитра — там, где человек угадает", () => {
    // Так у всех, и потому не надо учить.
    expect(OURS[0]!.combo).toEqual({ ctrl: true, key: "space" });
    expect(OURS[1]!.combo).toEqual({ ctrl: true, key: "k" });
  });

  it("список занятого короткий осознанно", () => {
    // Длинный список запретов сам становится поводом не делать ничего.
    expect(TAKEN.length).toBeLessThan(20);
  });
});

describe("дубль между своими — лотерея", () => {
  it("два действия на одном сочетании названы", () => {
    const bindings: Binding[] = [
      { combo: { ctrl: true, key: "k" }, does: "палитра" },
      { combo: { ctrl: true, key: "k" }, does: "поиск" },
    ];
    const got = check(bindings);
    expect(got.ok).toBe(false);
    expect(got.said).toContain("сработает одно, и не то");
  });

  it("занятое чужое и свой дубль — две разные проблемы", () => {
    const bindings: Binding[] = [
      { combo: { ctrl: true, key: "c" }, does: "копировать у нас" },
      { combo: { ctrl: true, key: "k" }, does: "палитра" },
      { combo: { ctrl: true, key: "k" }, does: "поиск" },
    ];
    expect(check(bindings).problems.length).toBe(2);
  });
});
