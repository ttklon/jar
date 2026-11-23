import { describe, expect, it } from "vitest";
import {
  extend,
  kept,
  onPress,
  REMIND_MS,
  RETURN_MS,
  RUNNING,
  START,
  tick,
  word,
  type Pause,
} from "./micPause";

/**
 * Шаг 53: пауза микрофона — состояние с возвратом, а не выключение.
 *
 * Человек закашлялся или вошёл кто-то в комнату. Выключить насовсем слишком
 * легко, вернуть — трудно: говорит в пустоту и решает, что приложение сломалось.
 */
const run = (ms: number, from: Pause = START) => {
  let pause = from;
  const said: string[] = [];
  let time = 0;
  while (time <= ms) {
    const step = tick(pause, 1000);
    pause = step.next;
    if (step.say) said.push(step.say);
    time += 1000;
    if (!pause.paused) break;
  }
  return { pause, said, time };
};

describe("пауза начинается и кончается сама", () => {
  it("пауза возвращается через минуту без действий человека", () => {
    // Молчащий микрофон — не выбор, а забытое действие.
    const { pause, time } = run(RETURN_MS + 5000);
    expect(RETURN_MS).toBe(60_000);
    expect(pause.paused).toBe(false);
    expect(time).toBeGreaterThanOrEqual(RETURN_MS);
  });

  it("возврат говорит «снова слушаю», а не молчит", () => {
    // Молчаливый возврат: человек уже привык говорить громче и медленнее.
    const { said } = run(RETURN_MS + 5000);
    expect(said[said.length - 1]).toBe("снова слушаю");
  });

  it("напоминание называет остаток, а не просто «на паузе»", () => {
    // Иначе не решить, продлевать или нет.
    const { said } = run(REMIND_MS + 1000);
    expect(said[0]).toContain("на паузе");
    expect(said[0]).toMatch(/\d+ с/);
  });
});

describe("не выключает навсегда из-за одного сбоя", () => {
  it("одна кнопка: пауза и возврат — одно нажатие", () => {
    // Две кнопки заставляют выбирать и промахиваться.
    const paused = onPress(RUNNING);
    expect(paused.paused).toBe(true);
    expect(onPress(paused).paused).toBe(false);
  });

  it("возврат сразу, без ожидания таймера", () => {
    const paused = onPress(RUNNING);
    const back = onPress(paused);
    expect(back).toEqual(RUNNING);
  });

  it("продление даёт ещё минуту, и это предел", () => {
    const paused = extend(START);
    expect(paused.leftMs).toBe(RETURN_MS);
    expect(paused.forMs).toBe(0);
  });

  it("после возврата пауза не считается идущей", () => {
    const { pause } = run(RETURN_MS + 1000);
    const after = tick(pause, 1000);
    expect(after.next.paused).toBe(false);
    expect(after.say).toBeNull();
  });
});

describe("человеку сказано, что происходит и что не потеряно", () => {
  it("слово — «на паузе», а не «выключено»", () => {
    // «Выключено» звучит как «больше не включится» — человек идёт в настройки.
    expect(word(RUNNING)).toBe("слушаю");
    expect(word(START)).toContain("на паузе");
    expect(word(START)).not.toContain("выключ");
  });

  it("сказано, что недоговорённое сохранено", () => {
    // Этого человек боится сильнее, чем забыть включить микрофон.
    expect(kept(START)).toContain("сохранено");
    expect(kept(RUNNING)).toBeNull();
  });

  it("в слове назван путь назад", () => {
    // «На паузе» без «как вернуть» — это сообщение о проблеме без выхода.
    expect(word(START)).toContain("нажмите");
  });
});
