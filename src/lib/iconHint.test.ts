import { describe, expect, it } from "vitest";
import { complete, id, show, spoken, type IconHint } from "./iconHint";

/**
 * Шаг 193: подсказки к иконкам появляются и с клавиатуры.
 *
 * `title` показывается только от мыши и молчит у диктора, если у кнопки есть имя.
 */

// Регрессия D-002: этот файл — тест, названный номером дефекта (шаг 254).
describe("с клавиатуры — по фокусу, без задержки", () => {
  it("фокус открывает сразу: ждать секунду значит наказывать за Tab", () => {
    expect(show("focus", false)).toBe(true);
  });

  it("уход фокуса закрывает", () => {
    expect(show("blur", true)).toBe(false);
  });

  it("мышь открывает и не отменяет открытую", () => {
    expect(show("hover", true)).toBe(true);
  });

  it("Esc закрывает, уход мыши — тоже", () => {
    expect(show("escape", true)).toBe(false);
    expect(show("leave", true)).toBe(false);
  });
});

describe("имя и подсказка — разные вещи", () => {
  it("диктор слышит две фразы, а не слипшуюся", () => {
    const got: IconHint = {
      name: "Озвучить",
      hint: "озвучит ответ службой Windows; текст уйдёт системе",
      describedBy: "hint-озвучить",
    };
    expect(spoken(got)).toBe("Озвучить. озвучит ответ службой Windows; текст уйдёт системе");
  });

  it("имя без подсказки — просто имя", () => {
    expect(spoken({ name: "Найти", hint: "", describedBy: "x" })).toBe("Найти");
  });

  it("подсказка без имени — только подсказка", () => {
    expect(spoken({ name: "", hint: "что будет", describedBy: "x" })).toBe("что будет");
  });
});

describe("идентификатор устойчив", () => {
  it("из имени, а не случайный", () => {
    expect(id("Озвучить")).toBe("hint-озвучить");
    expect(id("Открыть счёт")).toBe("hint-открыть-счёт");
  });

  it("знаки и пробелы — в дефисы: id с пробелом не находится", () => {
    expect(id("что / это?")).toBe("hint-что-это");
  });

  it("пустое имя — «icon», а не пустой id", () => {
    expect(id("   ")).toBe("hint-icon");
  });
});

describe("проверка полноты", () => {
  it("всё на месте", () => {
    expect(complete({ label: "Озвучить", describedBy: "hint-озвучить", target: "hint-озвучить" }).ok).toBe(true);
  });

  it("нет подсказки — с клавиатуры узнавать нечего", () => {
    expect(complete({ label: "Озвучить", describedBy: "", target: "" }).why).toContain("с клавиатуры узнавать нечего");
  });

  it("описатель указывает в пустоту — названо", () => {
    const got = complete({ label: "Озвучить", describedBy: "hint-старый", target: "hint-озвучить" });
    expect(got.ok).toBe(false);
    expect(got.why).toContain("указывает на");
  });

  it("без имени диктор скажет «кнопка»", () => {
    expect(complete({ label: " ", describedBy: "a", target: "a" }).why).toContain("диктор скажет");
  });
});
