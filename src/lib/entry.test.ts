import { describe, expect, it } from "vitest";
import { NAV_COMMANDS } from "../app";
import { readEntry } from "./entry";

/**
 * Шаг 181: один вход вместо поиска глазами по десяти пунктам.
 *
 * Главная проверка здесь — про **разницу** между «экраном» и «фразой». Оба идут
 * через одно поле, и перепутать их стоит человеку разговора: он сказал «создай
 * папку», а его увели на экран «Руки», потому что в слове нашлась подстрока.
 */
const commands = [
  { id: "voice", label: "Голос", keywords: ["voice"] },
  { id: "hands", label: "Руки", keywords: ["tools"] },
  { id: "journal", label: "История", keywords: ["журнал"] },
];

describe("один вход", () => {
  it("название экрана ведёт на экран, а не в разговор", () => {
    expect(readEntry(commands, "голос")).toEqual({ kind: "screen", id: "voice", label: "Голос" });
    // Регистр и ё/е — не разница: человек не обязан помнить, как назван экран.
    expect(readEntry(commands, "  ИСТОРИЯ  ").kind).toBe("screen");
    expect(readEntry(commands, "история").kind).toBe("screen");
  });

  it("синоним экрана тоже ведёт на экран", () => {
    // У палитры есть синонимы, и второе поле не должно знать другие имена.
    expect(readEntry(commands, "журнал")).toEqual({ kind: "screen", id: "journal", label: "История" });
  });

  it("фраза уходит в разговор целиком, обрезанная по краям", () => {
    expect(readEntry(commands, "  создай папку на рабочем столе  ")).toEqual({
      kind: "phrase",
      text: "создай папку на рабочем столе",
    });
  });

  it("начало названия экрана — ещё не экран", () => {
    // Палитра ищет подстрокой, и это правильно, когда цель — экран. Здесь же
    // «го» в начале фразы ещё не значит, что человек хочет экран «Голос»:
    // «го в папку» — это разговор, и увести с него значит потерять фразу.
    expect(readEntry(commands, "го в папку").kind).toBe("phrase");
    // А само название — экран.
    expect(readEntry(commands, "голос").kind).toBe("screen");
  });

  it("пробельное — ничего, а не фраза из пробелов", () => {
    // Пустая фраза, отправленная в разговор, — это «не понял» на пустом месте.
    expect(readEntry(commands, "").kind).toBe("empty");
    expect(readEntry(commands, "   \n\t ").kind).toBe("empty");
  });
});

describe("тот же список экранов, что у палитры", () => {
  it("настоящие экраны находятся по своим подписям", () => {
    for (const command of NAV_COMMANDS) {
      const outcome = readEntry(NAV_COMMANDS, command.label.toLocaleLowerCase("ru"));
      expect(outcome.kind).toBe("screen");
    }
  });
});
