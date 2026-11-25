import { describe, expect, it } from "vitest";
import { after, alreadyDone, ask, need, notDo } from "./whoNow";

/**
 * Шаг 402: быстрое переключение «это я» перед чувствительным делом.
 */

const anna = { id: "anna", name: "Анна" };
const son = { id: "son", name: "Сын" };

describe("спрашиваем только перед опасным", () => {
  it("чтение — не спрашиваем", () => {
    expect(need("read", [son]).ask).toBe(false);
  });

  it("опасное при двух людях — спрашиваем", () => {
    const got = need("delete", [son]);
    expect(got.ask).toBe(true);
    expect(got.why).toContain("2 человек");
  });

  it("человек один — спрашивать некого", () => {
    expect(need("delete", []).ask).toBe(false);
  });
});

describe("вопрос в одну строку", () => {
  it("имя в вопросе и текущий первым", () => {
    const got = ask(anna, [son]);
    expect(got.said).toBe("Опасное дело: оно выполнится от имени «Анна». Это вы?");
    expect(got.options[0]).toEqual(anna);
    expect(got.options.length).toBe(2);
  });
});

describe("после ответа", () => {
  it("тот же человек — ничего не меняется", () => {
    expect(after(anna, anna).changed).toBe(false);
  });

  it("другой — права и память его, а выполненные шаги остаются", () => {
    const got = after(son, anna);
    expect(got.changed).toBe(true);
    expect(got.said).toContain("права и память — его");
    expect(alreadyDone(2)).toContain("2 шагов от прежнего человека");
  });

  it("ничего не выполнено — так и говорим", () => {
    expect(alreadyDone(0)).toContain("начнётся с первого");
  });
});

describe("чего переключение не делает", () => {
  it("не угадывает, не спрашивает повторно, не перезапускает", () => {
    const got = notDo().join();
    expect(got).toContain("не угадывает");
    expect(got).toContain("держится до конца дела");
    expect(got).toContain("не перезапускает");
  });
});
