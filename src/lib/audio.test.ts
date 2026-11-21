import { describe, expect, it, vi } from "vitest";
import { createAudioMachine, micOpen, next, speaking } from "./audio";

describe("машина состояний звука", () => {
  it("говорить и слушать одновременно нельзя", () => {
    // Это главное правило: иначе приложение слышит собственную речь.
    expect(micOpen("speaking")).toBe(false);
    expect(speaking("speaking")).toBe(true);
    expect(micOpen("listening")).toBe(true);
    expect(speaking("listening")).toBe(false);
    // В размышлении микрофон закрыт: фраза уже записана, слушать нечего.
    expect(micOpen("thinking")).toBe(false);
  });

  it("полный круг: слушаю → думаю → говорю → готов", () => {
    const machine = createAudioMachine();
    expect(machine.send("start")).toBe("listening");
    expect(machine.send("stop")).toBe("thinking");
    expect(machine.send("answer")).toBe("speaking");
    expect(machine.send("finished")).toBe("idle");
  });

  it("перебивание ведёт к микрофону, а не к выключению", () => {
    // Человек заговорил, чтобы его услышали, а не чтобы выключить приложение.
    expect(next("speaking", "bargeIn")).toBe("listening");
    expect(next("thinking", "bargeIn")).toBe("listening");
  });

  it("перебивание из «говорю» сразу закрывает динамик", () => {
    const machine = createAudioMachine();
    machine.send("start");
    machine.send("stop");
    machine.send("answer");
    expect(machine.out()).toBe(true);

    machine.send("bargeIn");
    expect(machine.state).toBe("listening");
    // Динамик закрыт — договаривать поверх человека невежливо.
    expect(machine.out()).toBe(false);
    expect(machine.mic()).toBe(true);
  });

  it("недопустимое событие ничего не меняет", () => {
    const machine = createAudioMachine();
    // Из покоя нельзя «договорить»: говорить нечего.
    expect(machine.send("finished")).toBeNull();
    expect(machine.state).toBe("idle");
    expect(machine.send("answer")).toBeNull();
  });

  it("сброс из любого состояния возвращает в готовность", () => {
    for (const from of ["idle", "listening", "thinking", "speaking"] as const) {
      expect(next(from, "reset")).toBe("idle");
    }
  });

  it("повторное «начать» при открытом микрофоне — не ошибка", () => {
    // Кнопку могли нажать дважды; второе нажатие не должно ломать запись.
    expect(next("listening", "start")).toBe("listening");
  });

  it("смена состояния сообщается с новым состоянием внутри", () => {
    const seen: string[] = [];
    const machine = createAudioMachine((from, to, event) => {
      seen.push(`${from}->${to}:${event}`);
      // Обработчик уже видит новое состояние — иначе ему пришлось бы ждать.
      expect(machine.state).toBe(to);
    });

    machine.send("start");
    machine.send("stop");
    expect(seen).toEqual(["idle->listening:start", "listening->thinking:stop"]);
  });

  it("неизвестное состояние не запирает приложение в «говорю»", () => {
    // Застрять в речи навсегда хуже, чем вернуться в готовность.
    expect(next("что-то ещё" as never, "start")).toBe("idle");
  });

  it("обработчик не вызывается на отклонённом событии", () => {
    const onChange = vi.fn();
    const machine = createAudioMachine(onChange);
    machine.send("finished");
    expect(onChange).not.toHaveBeenCalled();
  });
});
