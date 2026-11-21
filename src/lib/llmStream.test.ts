import { describe, expect, it } from "vitest";
import { DONE, createSentenceBuffer, deltaOf, joinStream } from "./llmStream";

/** Строка SSE в том виде, в каком её отдаёт llama-server. */
const chunk = (text: string) =>
  `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}`;

describe("поток ответа модели", () => {
  it("первое предложение отдаётся до того, как придёт всё остальное", () => {
    // Это и есть смысл потока: пока модель пишет второе предложение, человек уже
    // слышит первое — а не ждёт абзац целиком.
    const buffer = createSentenceBuffer();
    expect(buffer.push("Сделал. Сейчас")).toEqual(["Сделал."]);
    expect(buffer.push(" проверю")).toEqual([]);
    expect(buffer.push(" ещё.")).toEqual(["Сейчас проверю ещё."]);
    expect(buffer.flush()).toBe("");
  });

  it("токены режут слово — и это не превращается в обрывок речи", () => {
    const buffer = createSentenceBuffer();
    // Модель отдаёт «го» и «тово» отдельно; точку по частям.
    expect(buffer.push("го")).toEqual([]);
    expect(buffer.push("тово")).toEqual([]);
    expect(buffer.push(".")).toEqual(["готово."]);
  });

  it("служебный [DONE] не попадает в речь", () => {
    expect(deltaOf(`data: ${DONE}`)).toBeNull();
    expect(deltaOf(chunk("привет"))).toBe("привет");
    expect(joinStream([chunk("готово."), `data: ${DONE}`])).toBe("готово.");
  });

  it("битая строка не съедает остальной ответ", () => {
    // Один непонятный кусок — не повод потерять то, что уже сказано.
    expect(deltaOf("data: {это не json")).toBeNull();
    expect(joinStream([chunk("Первое."), "data: {битое", chunk(" Второе.")])).toBe(
      "Первое. Второе.",
    );
    expect(deltaOf("")).toBeNull();
    expect(deltaOf("event: message")).toBeNull();
  });

  it("хвост без точки не теряется, но и не рвётся в середине", () => {
    expect(joinStream([chunk("Почти готово")])).toBe("Почти готово");
    expect(joinStream([chunk("А."), chunk("Б")])).toBe("А. Б");
  });
});
