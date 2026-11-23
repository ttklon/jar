import { describe, expect, it } from "vitest";
import { canTurnOn, micNeeded, OFF, ON, sayAnyway, speaks, toggle, word } from "./speakSwitch";

/**
 * Шаг 59: ответ голосом выключается одной кнопкой на экране.
 *
 * В опенспейсе голос мешает, в наушниках — единственный способ не смотреть на
 * экран. А выключается он в настройках, и человек ищет и не находит.
 */
describe("одна кнопка, а не настройки", () => {
  it("туда и обратно одним нажатием", () => {
    // Настройки — место, где ищут и не находят.
    expect(toggle(ON).on).toBe(false);
    expect(toggle(OFF).on).toBe(true);
  });

  it("состояние видно словом, а не значком", () => {
    // Значок динамика не читается ни диктором, ни дальтоником, ни тем, кто
    // смотрит в сторону.
    expect(word(ON)).toContain("включён");
    expect(word(OFF)).toContain("выключен");
    expect(word(OFF)).toContain("нажмите");
  });
});

describe("тишина не глушит важное", () => {
  it("обычный ответ при выключенном голосе молчит", () => {
    // Это то, чего человек и хотел.
    expect(speaks(OFF, "answer")).toBe(false);
    expect(speaks(ON, "answer")).toBe(true);
  });

  it("вопрос о необратимом проговаривается даже в тишине", () => {
    // Молча пропустить вопрос об опасном действии хуже, чем нарушить тишину.
    expect(speaks(OFF, "confirm")).toBe(true);
    expect(speaks(OFF, "error")).toBe(true);
  });

  it("сказано, почему голос зазвучал", () => {
    // Иначе человек решит, что кнопка не работает, и полезет её чинить.
    expect(sayAnyway("confirm")).toContain("голос выключен");
    expect(sayAnyway("confirm")).toContain("говорю");
    expect(sayAnyway("answer")).toBeNull();
  });
});

describe("кнопка не врёт", () => {
  it("без движка речи не обещаем то, чего нет", () => {
    // Кнопка, которая нажимается и ничего не делает, хуже отсутствующей.
    expect(canTurnOn({ on: false, why: "no-voice" })).toBe(false);
    expect(canTurnOn(OFF)).toBe(true);
  });

  it("тихие часы названы отдельно от своего решения", () => {
    // Своё решение человек помнит, а расписание — нет; напоминать надо по-разному.
    expect(word({ on: false, why: "quiet-hours" })).toContain("тихими часами");
    expect(word(OFF)).toContain("вами");
  });
});

describe("голос и микрофон — разные вещи", () => {
  it("выключение голоса не выключает микрофон", () => {
    // Человек, выключивший ответы голосом, всё ещё хочет говорить.
    expect(micNeeded(OFF)).toBe(true);
    expect(micNeeded(ON)).toBe(true);
  });
});
