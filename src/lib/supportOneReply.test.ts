import { describe, expect, it } from "vitest";
import { checks, notDo, reply, whyOne, type Case } from "./supportOneReply";

/**
 * Шаг 475: поддержка отвечает за один шаг — три вопроса и что приложить.
 */

const state = (over: Partial<Case> = {}): Case => ({ answered: 0, canAttach: true, reproduced: false, ...over });

describe("один ответ — одно действие", () => {
  it("первый ответ просит отчёт кнопкой", () => {
    const got = reply(state());
    expect(got.ask).toContain("нажмите «скопировать отчёт»");
    expect(got.done).toBe(false);
  });

  it("второй — архив, тоже кнопкой", () => {
    expect(reply(state({ answered: 1 })).ask).toContain("«собрать архив»");
  });

  it("воспроизведённый дефект — наш, действий не нужно", () => {
    const got = reply(state({ reproduced: true }));
    expect(got.said).toContain("дефект наш");
    expect(got.said).toContain("Ничего делать не нужно");
    expect(got.ask).toBeNull();
  });

  it("без файлов — отвечаем по существу", () => {
    const got = reply(state({ answered: 1, canAttach: false }));
    expect(got.done).toBe(true);
    expect(got.said).toContain("файлы не обязательны");
    expect(got.ask).toBeNull();
  });

  it("ни в одном ответе больше одного действия", () => {
    for (const st of [state(), state({ answered: 1 }), state({ reproduced: true }), state({ answered: 1, canAttach: false })]) {
      const got = reply(st);
      if (got.ask !== null) expect(got.ask.split(" и ").length).toBeLessThanOrEqual(2);
    }
  });
});

describe("почему одно действие", () => {
  it("два действия — два письма", () => {
    const got = whyOne();
    expect(got).toHaveLength(3);
    expect(got[0]).toContain("половина людей не напишет второе");
  });

  it("«опишите подробно» перекладывает работу", () => {
    expect(whyOne()[1]).toContain("перекладывает работу");
  });
});

describe("чего ответ не содержит", () => {
  it("не «перезапустите» без причины", () => {
    expect(notDo()[0]).toContain("без объяснения");
  });

  it("не «если повторится — пишите»", () => {
    expect(notDo()[3]).toContain("это не ответ");
    expect(checks()).toHaveLength(3);
  });
});
