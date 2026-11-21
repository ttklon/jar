import { describe, expect, it } from "vitest";
import { NEEDS_NETWORK, offlineNote, onlineState, worksOffline } from "./offline";

/**
 * Сеть выключена — режим, а не поломка.
 *
 * Зачем тест. Обещание «работает без сети» проверяется одной вещью: не начинает
 * ли приложение говорить «ошибка» там, где ему просто нечего скачивать. Ошибка
 * без сети пугает человека зря: он выключил сеть нарочно.
 */

describe("режим без сети", () => {
  it("выключенная сеть — не ошибка, а объяснение", () => {
    const note = offlineNote(false, "скачать модель");
    expect(note).toContain("скачать модель");
    // «Не получится» вместо «ошибка»: первое — про сейчас, второе — про поломку.
    expect(note).toContain("без сети не получится");
    expect(note).not.toContain("ошибка");
    // И сразу сказано, что остальное работает: иначе человек решит, что нельзя
    // ничего.
    expect(note).toContain("Всё остальное работает");
  });

  it("если сеть есть или неизвестна — ничего не говорим", () => {
    // Неизвестность не повод запрещать: navigator.onLine врёт в обе стороны
    // (Wi-Fi без интернета, локалка без «сети»). Запретить действие, которое
    // сработало бы, хуже, чем дать ему честно провалиться.
    expect(offlineNote(true, "скачать модель")).toBeNull();
    expect(offlineNote(null, "скачать модель")).toBeNull();
  });

  it("состояние сети читается из navigator, а не выдумывается", () => {
    expect(onlineState({ onLine: true })).toBe(true);
    expect(onlineState({ onLine: false })).toBe(false);
    // Нет navigator — неизвестно, а не «нет сети».
    expect(onlineState(undefined)).toBeNull();
    expect(onlineState({})).toBeNull();
  });

  it("список «недоступно без сети» — ровно про скачивание", () => {
    // Если в этот список попадёт то, что на самом деле работает, обещание
    // «локально» станет ложью в самую дорогую сторону.
    for (const item of NEEDS_NETWORK) {
      expect(item.startsWith("скачать")).toBe(true);
    }
    expect(NEEDS_NETWORK).toHaveLength(3);
  });

  it("список «работает без сети» не пустой и про дело", () => {
    const items = worksOffline();
    expect(items.length).toBeGreaterThanOrEqual(3);
    expect(items.join(" ")).toContain("поговорить");
    expect(items.join(" ")).toContain("компьютере");
  });
});
