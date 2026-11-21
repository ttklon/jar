import { describe, expect, it } from "vitest";
import { createSpeechQueue } from "./speechQueue";

describe("очередь произнесения", () => {
  it("вторая фраза ждёт первую, а не обрывает её", () => {
    const said: string[] = [];
    const queue = createSpeechQueue((text) => {
      said.push(text);
      return true;
    });

    queue.push("Сделал.");
    queue.push(" Сейчас проверю.");
    // Без очереди `speak()` отменил бы первую фразу ради второй.
    expect(said).toEqual(["Сделал."]);
    expect(queue.pending()).toBe(1);

    queue.done();
    expect(said).toEqual(["Сделал.", "Сейчас проверю."]);
    expect(queue.pending()).toBe(0);
  });

  it("«договорил» синхронно не съедает следующую фразу", () => {
    // Синтез может сообщить об окончании мгновенно. Если флаг «говорю»
    // выставляется после `say`, очередь сбрасывает его на пустоту и следующая
    // фраза не начинается вовсе — эта ошибка была настоящей.
    const said: string[] = [];
    const queue: ReturnType<typeof createSpeechQueue> = createSpeechQueue((text) => {
      said.push(text);
      queue.done();
      return true;
    });

    queue.push("Первое.");
    queue.push("Второе.");
    expect(said).toEqual(["Первое.", "Второе."]);
  });

  it("пустая фраза не занимает очередь", () => {
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
    expect(said).toEqual(["Первое."]);
  });

  it("перебивание забывает всё несказанное", () => {
    const said: string[] = [];
    const queue = createSpeechQueue((text) => {
      said.push(text);
      return true;
    });

    queue.push("Первое.");
    queue.push("Второе.");
    queue.push("Третье.");
    queue.clear();

    expect(queue.pending()).toBe(0);
    queue.done();
    expect(said).toEqual(["Первое."]);
  });

  it("без синтеза речи причина называется один раз", () => {
    const problems: string[] = [];
    const queue = createSpeechQueue(
      () => false,
      (why) => problems.push(why),
    );

    queue.push("Первое.");
    queue.push("Второе.");

    expect(problems).toEqual(["no-voice"]);
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
