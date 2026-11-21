import { describe, expect, it, vi } from "vitest";
import { createSpeechQueue } from "./speechQueue";

describe("очередь произнесения потока", () => {
  it("второй кусок не обрывает первый, а ждёт его", () => {
    const said: string[] = [];
    const queue = createSpeechQueue((text) => {
      said.push(text);
      return true;
    });

    queue.push("Сделал.");
    queue.push(" Сейчас проверю.");
    // Второй кусок не начат, пока первый не договорён: иначе `speak()` отменил бы его.
    expect(said).toEqual(["Сделал."]);
    expect(queue.pending()).toBe(1);

    queue.done();
    expect(said).toEqual(["Сделал.", "Сейчас проверю."]);
    expect(queue.pending()).toBe(0);
  });

  it("пустой кусок не занимает очередь", () => {
    const said: string[] = [];
    const queue = createSpeechQueue((text) => {
      said.push(text);
      return true;
    });

    queue.push("Первое.");
    queue.push("   ");
    queue.push("");
    expect(queue.pending()).toBe(0);
    queue.done();
    // Пустое не стало «фразой», после которой очередь ждала бы события.
    expect(said).toEqual(["Первое."]);
  });

  it("перебивание забывает всё, что ещё не сказано", () => {
    const said: string[] = [];
    const stop = vi.fn();
    const queue = createSpeechQueue((text) => {
      said.push(text);
      return true;
    });

    queue.push("Первое.");
    queue.push("Второе.");
    queue.push("Третье.");
    queue.clear();
    stop();

    expect(queue.pending()).toBe(0);
    // Договорить «Второе» после «стоп» — невежливо.
    queue.done();
    expect(said).toEqual(["Первое."]);
    expect(stop).toHaveBeenCalled();
  });

  it("без синтеза речи очередь называет причину, а не молчит", () => {
    const problems: string[] = [];
    const queue = createSpeechQueue(
      () => false,
      (why) => problems.push(why),
    );

    queue.push("Первое.");
    queue.push("Второе.");

    expect(problems).toEqual(["no-voice"]);
    // Очередь не копится: «договорить» нечем, и притворяться поздно.
    expect(queue.pending()).toBe(0);
  });

  it("после перебивания очередь снова принимает фразы", () => {
    const said: string[] = [];
    const queue = createSpeechQueue((text) => {
      said.push(text);
      return true;
    });

    queue.push("Старое.");
    queue.clear();
    queue.push("Новое.");
    expect(said).toEqual(["Старое.", "Новое."]);
  });
});
