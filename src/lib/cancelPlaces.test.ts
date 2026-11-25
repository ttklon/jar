import { describe, expect, it } from "vitest";
import { consistent, decide, hotkeyRules, placeName, type Deed, type Place } from "./cancelPlaces";

/**
 * Шаг 377: отмена из ленты и из трея — одинаково. Одно поведение.
 */

const deed = (over: Partial<Deed> = {}): Deed => ({
  what: "уборка загрузок",
  cancellable: true,
  waiting: false,
  sent: false,
  ...over,
});

const ALL: Place[] = ["feed", "tray", "window", "hotkey"];

describe("решение одно, места только передают, что знают", () => {
  it("обычная отмена — без вопроса, но с названием места", () => {
    expect(decide(deed(), "feed").said).toBe("Отменить «уборка загрузок»? (лента)");
  });

  it("часть отправлена — спрашиваем, и это одинаково везде", () => {
    for (const place of ALL) {
      const got = decide(deed({ sent: true }), place);
      expect(got.ask).toBe(true);
      expect(got.said).toContain("уже отправлена");
    }
  });

  it("неотменяемое — не спрашивает, а объясняет", () => {
    const got = decide(deed({ cancellable: false }), "tray");
    expect(got.ask).toBe(false);
    expect(got.said).toContain("остановлю на следующем");
  });

  it("имена мест по-русски", () => {
    expect(placeName("tray")).toBe("трей");
    expect(placeName("hotkey")).toBe("горячая клавиша");
  });
});

describe("одинаковость проверяется машинно", () => {
  it("наше решение — одинаковое во всех местах", () => {
    expect(consistent(deed({ sent: true }), ALL)).toEqual([]);
  });

  it("название места не считается расхождением", () => {
    // Иначе проверка всегда ругалась бы на подпись места.
    expect(consistent(deed(), ALL)).toEqual([]);
  });

  it("расхождение по вопросу — ловим", () => {
    // В трее «быстро, без вопроса» — ровно та ошибка, которую шаг и запрещает.
    const problems = consistent(deed({ sent: true }), ["feed", "tray"], (d, place) =>
      place === "tray" ? { ask: false, said: "Отменить «уборка загрузок»?" } : decide(d, place),
    );
    expect(problems.join()).toContain("спрашивает по-разному");
  });

  it("расхождение по тексту — ловим", () => {
    const problems = consistent(deed(), ["feed", "tray"], (d, place) =>
      place === "tray" ? { ask: false, said: "Остановить «уборка загрузок»" } : decide(d, place),
    );
    expect(problems.join()).toContain("текст отмены в разных местах разный");
  });
});

describe("горячая клавиша — самое опасное место", () => {
  it("три правила, включая двойное нажатие", () => {
    const got = hotkeyRules();
    expect(got.length).toBe(3);
    expect(got.join()).toContain("второе нажатие ничего не делает");
    expect(got.join()).toContain("дело ждёт подтверждения");
  });
});
