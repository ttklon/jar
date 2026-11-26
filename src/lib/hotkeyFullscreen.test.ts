import { describe, expect, it } from "vitest";
import { cases, change, grab, notDo, whyBefore } from "./hotkeyFullscreen";

/**
 * Шаг 455: не перехватывать клавиши в полноэкранных приложениях.
 */

describe("перехват снимается заранее", () => {
  it("обычный режим — перехват есть", () => {
    expect(grab({ fullscreen: false, paused: false }).on).toBe(true);
  });

  it("полноэкранное — перехвата нет, клавиша достаётся игре", () => {
    const got = grab({ fullscreen: true, paused: false });
    expect(got.on).toBe(false);
    expect(got.said).toContain("не «глотается» после проверки");
  });

  it("пауза — перехвата нет вовсе", () => {
    expect(grab({ fullscreen: false, paused: true }).said).toContain("на паузе");
  });
});

describe("снятие и возврат по событию", () => {
  it("открылось полноэкранное — снимаем", () => {
    const got = change({ fullscreen: false, paused: false }, { fullscreen: true, paused: false });
    expect(got.action).toBe("release");
  });

  it("закрылось — возвращаем", () => {
    const got = change({ fullscreen: true, paused: false }, { fullscreen: false, paused: false });
    expect(got.action).toBe("grab");
  });

  it("ничего не изменилось — ничего не делаем", () => {
    expect(change({ fullscreen: false, paused: false }, { fullscreen: false, paused: false }).action).toBe("none");
  });

  it("пауза во время полноэкранного — тоже ничего", () => {
    expect(change({ fullscreen: true, paused: false }, { fullscreen: true, paused: true }).action).toBe("none");
  });
});

describe("почему не «проверить и проглотить»", () => {
  it("клавиша уже отнята у игры", () => {
    expect(whyBefore()).toContain("уже отняла клавишу у игры");
  });
});

describe("три состояния и три запрета", () => {
  it("все три дают разный ответ", () => {
    const got = cases().map((state) => grab(state).on);
    expect(got).toEqual([true, false, false]);
  });

  it("не глотает, не опрашивает, не остаётся снятым", () => {
    const got = notDo().join();
    expect(got).toContain("снят заранее");
    expect(got).toContain("не остаётся снятым");
  });
});
