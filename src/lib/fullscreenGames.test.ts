import { describe, expect, it } from "vitest";
import { afterFullscreen, decide, kinds, notDo, type Screen } from "./fullscreenGames";

/**
 * Шаг 444: не мешать играм и полноэкранным приложениям.
 */

const screen = (over: Partial<Screen> = {}): Screen => ({ fullscreen: false, byPerson: false, dangerous: false, ...over });

describe("полноэкранного нет — работаем как обычно", () => {
  it("всё разрешено", () => {
    const got = decide(screen());
    expect([got.run, got.notice, got.hotkey]).toEqual([true, true, true]);
  });
});

describe("полноэкранное — тихий режим", () => {
  it("по расписанию ничего не запускается", () => {
    expect(decide(screen({ fullscreen: true })).run).toBe(false);
  });

  it("уведомлений нет — игра не свернётся", () => {
    expect(decide(screen({ fullscreen: true })).notice).toBe(false);
  });

  it("горячие клавиши не перехватываются", () => {
    expect(decide(screen({ fullscreen: true })).hotkey).toBe(false);
  });

  it("сказано, что продолжим после выхода", () => {
    expect(decide(screen({ fullscreen: true })).said).toContain("когда выйдете");
  });
});

describe("человек нажал сам — это не игра", () => {
  it("выполняем, но без уведомления", () => {
    const got = decide(screen({ fullscreen: true, byPerson: true }));
    expect(got.run).toBe(true);
    expect(got.notice).toBe(false);
    expect(got.said).toContain("вы попросили сами");
  });

  it("опасное по просьбе человека — тоже выполняется", () => {
    expect(decide(screen({ fullscreen: true, byPerson: true, dangerous: true })).run).toBe(true);
  });
});

describe("после выхода — по одному, а не скопом", () => {
  it("пропущено два — спросим", () => {
    const got = afterFullscreen(2);
    expect(got).toContain("пропущено 2 дела");
    expect(got).toContain("по одному");
  });

  it("ничего не пропущено — молчим", () => {
    expect(afterFullscreen(0)).toBe("");
  });
});

describe("что считается полноэкранным", () => {
  it("четыре вида, включая конференции", () => {
    const got = kinds();
    expect(got).toHaveLength(4);
    expect(got.join()).toContain("видеоконференции");
  });

  it("три запрета — «не мешать» без «не работать»", () => {
    const got = notDo().join();
    expect(got).toContain("он не в игре, если нажал");
    expect(got).toContain("спрашиваем по одному");
  });
});
