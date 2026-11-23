import { describe, expect, it } from "vitest";
import { CHOICES, SURE, before, shade } from "./beforeDoing";

/**
 * Шаг 46: фраза показывается до исполнения, с возможностью поправить.
 *
 * Ошибка распознавания не должна сразу запускать действие. Но и спрашивать на
 * каждую фразу нельзя: разговор превратился бы в анкету, и человек говорил бы
 * вдвое больше, чтобы сделать вдвое меньше.
 */
describe("когда спрашиваем", () => {
  it("необратимое — всегда спрашиваем", () => {
    // Отменить уже нечего: одно неверно понятое слово стирает файл.
    const decision = before({ text: "удали папку", irreversible: true, broad: false, confidence: 0.99 });
    expect(decision.kind).toBe("ask");
    expect(decision.kind === "ask" && decision.why).toContain("не отменить");
  });

  it("широкое действие — спрашиваем даже с высокой уверенностью", () => {
    // Расслышали верно, но одно слово меняет много файлов.
    expect(before({ text: "переименуй всё", irreversible: false, broad: true, confidence: 0.95 }).kind).toBe("ask");
  });

  it("низкая уверенность — спрашиваем, даже если действие безвредно", () => {
    expect(before({ text: "покажи историю", irreversible: false, broad: false, confidence: 0.4 }).kind).toBe("ask");
    expect(SURE).toBe(0.7);
  });

  it("обратимое и близкое — не спрашиваем", () => {
    // «Покажи» без паузы лучше, чем «покажи» с вопросом: человек просил
    // показать, а не подтвердить, что просил показать.
    expect(before({ text: "покажи историю", irreversible: false, broad: false, confidence: 0.95 })).toEqual({
      kind: "go",
      text: "покажи историю",
    });
  });

  it("неизвестная уверенность — не повод спрашивать", () => {
    // Иначе в окружении без оценки уверенности всё спрашивало бы
    // подтверждения, и разговор снова стал бы анкетой.
    expect(before({ text: "покажи историю", irreversible: false, broad: false, confidence: null }).kind).toBe("go");
  });

  it("пустая фраза не исполняется", () => {
    const decision = before({ text: "  ", irreversible: false, broad: false, confidence: null });
    expect(decision.kind).toBe("ask");
    expect(decision.kind === "ask" && decision.why).toContain("повторите");
  });
});

describe("как показываем", () => {
  it("сказано «понял так», а не «услышал»", () => {
    // Иначе человек исправляет то, что и так было сказано, а не то, что мы
    // разобрали.
    expect(shade("создай папку")).toBe("понял так: «создай папку»");
    expect(shade("создай папку")).not.toContain("услышал");
  });

  it("поправить — это правка текста, а не всё заново", () => {
    // Исправить одно слово должно быть дешевле, чем сказать фразу снова.
    expect(CHOICES.edit).toContain("поправ");
    expect(CHOICES.confirm).toContain("да");
    expect(CHOICES.again).toContain("повтор");
    // Три пути, и они разные: иначе «поправить» было бы «повторить».
    expect(new Set(Object.values(CHOICES)).size).toBe(3);
  });
});
