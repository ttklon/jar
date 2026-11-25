import { describe, expect, it } from "vitest";
import { mode, promises, set, visible, type State } from "./profilesOptional";

/**
 * Шаг 411: профиль человека — необязательная функция, по умолчанию один.
 */

const state = (over: Partial<State> = {}): State => ({ others: 0, offByUser: false, guest: false, ...over });

describe("по умолчанию — один человек", () => {
  it("режим alone", () => {
    expect(mode(state())).toBe("alone");
  });

  it("на экране ни строки про профили", () => {
    const got = visible(state());
    expect([got.settingsLine, got.switcher]).toEqual([false, false]);
  });
});

describe("явное «не нужно» сильнее всего", () => {
  it("гость не включает обратно", () => {
    expect(mode(state({ offByUser: true, guest: true, others: 2 }))).toBe("off");
  });

  it("выключено — память на месте, но не видна", () => {
    expect(visible(state({ offByUser: true })).said).toContain("лежат на месте, но не показываются");
  });
});

describe("пришёл гость — включилось само, без «создайте профиль»", () => {
  it("гость — режим guest", () => {
    expect(mode(state({ guest: true }))).toBe("guest");
  });

  it("гость не смешивается с хозяином", () => {
    expect(visible(state({ guest: true })).said).toContain("не смешивается");
  });
});

describe("несколько человек — переключатель", () => {
  it("виден", () => {
    expect(visible(state({ others: 1 })).switcher).toBe(true);
  });

  it("выключение и включение — без стирания", () => {
    const off = set(state({ others: 1 }), true);
    expect(off.said).toContain("осталась");
    const on = set(state({ others: 1, offByUser: true }), false);
    expect(on.state.offByUser).toBe(false);
  });

  it("включение при одном человеке ничего не меняет на экране", () => {
    expect(set(state(), false).said).toContain("на экране ничего не изменится");
  });
});

describe("приёмочные обещания", () => {
  it("три строки, каждая — регрессия", () => {
    const got = promises().join();
    expect(got).toContain("ни слова про людей");
    expect(got).toContain("она в настройках");
    expect(got).toContain("прячут её");
  });
});
