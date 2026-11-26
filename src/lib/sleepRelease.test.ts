import { describe, expect, it } from "vitest";
import { notDo, releases, sleep, wake, type Before } from "./sleepRelease";

/**
 * Шаг 457: спящий режим — остановить запись, отпустить движок.
 */

const before = (over: Partial<Before> = {}): Before => ({ recording: false, engine: false, stepsDone: 0, ...over });

describe("сон отпускает всё, что держит", () => {
  it("запись остановлена, движок отпущен", () => {
    const got = sleep(before({ recording: true, engine: true }));
    expect(got.recording).toBe(false);
    expect(got.engine).toBe(false);
    expect(got.said).toContain("запись остановлена");
    expect(got.said).toContain("движок отпущен");
  });

  it("дело запомнено с номером шага", () => {
    const got = sleep(before({ deed: "уборка", stepsDone: 3 }));
    expect(got.deedNote).toBe("«уборка»: выполнено 3 шагов, прервано сном");
  });

  it("отпускать нечего — так и говорим", () => {
    expect(sleep(before()).said).toBe("уходим в сон: отпускать нечего");
  });

  it("дело не идёт — заметки нет", () => {
    expect(sleep(before({ recording: true })).deedNote).toBeNull();
  });
});

describe("пробуждение — ничего не начинается само", () => {
  it("дело было — спрашиваем", () => {
    const got = wake(sleep(before({ deed: "уборка", stepsDone: 3 })));
    expect(got.ask).toBe(true);
    expect(got.said).toContain("Продолжить с этого шага?");
  });

  it("запись сама не включается", () => {
    const got = wake(sleep(before({ recording: true })));
    expect(got.said).toContain("нажмите, если она нужна");
  });
});

describe("что отпускается обязательно", () => {
  it("три вещи, включая «не записывать в чехле»", () => {
    const got = releases();
    expect(got).toHaveLength(3);
    expect(got.join()).toContain("не записывать в чехле");
  });

  it("три запрета про «проснулись и начали»", () => {
    const got = notDo().join();
    expect(got).toContain("без нажатия");
    expect(got).toContain("номер запомнен");
  });
});
