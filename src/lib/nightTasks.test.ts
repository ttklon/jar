import { describe, expect, it } from "vitest";
import { NIGHT_FROM, NIGHT_TO, awake, deferred, isNight, mayDo, notList, safeList, setting } from "./nightTasks";

/**
 * Шаг 325: ночью — только безопасные действия или тишина.
 *
 * Ночью результат некому остановить, а провал никто не заметит.
 */

describe("ночь — это часы, а не «когда темно»", () => {
  it("23:00–07:00", () => {
    expect(NIGHT_FROM).toBe(23 * 60);
    expect(NIGHT_TO).toBe(7 * 60);
    expect(isNight(23 * 60)).toBe(true);
    expect(isNight(3 * 60)).toBe(true);
    expect(isNight(6 * 60 + 59)).toBe(true);
    expect(isNight(7 * 60)).toBe(false);
  });

  it("22:59 — ещё день", () => {
    expect(isNight(22 * 60 + 59)).toBe(false);
  });
});

describe("ночью делим не важное, а обратимое", () => {
  it("читать и считать — можно", () => {
    const got = mayDo("read", 3 * 60);
    expect(got.allowed).toBe(true);
    expect(got.said).toContain("увидит утром");
  });

  it("менять мир — нельзя без подтверждения", () => {
    const got = mayDo("change", 3 * 60);
    expect(got.allowed).toBe(false);
    expect(got.said).toContain("подождут до утра");
  });

  it("разбудить — нельзя никогда, даже днём", () => {
    expect(mayDo("alarm", 3 * 60).allowed).toBe(false);
    expect(mayDo("alarm", 12 * 60).allowed).toBe(false);
  });

  it("днём обычные правила", () => {
    expect(mayDo("change", 12 * 60).allowed).toBe(true);
  });
});

describe("отложенное спрашивает, а не выполняется само", () => {
  it("утром вопрос, а не действие", () => {
    const got = deferred();
    expect(got).toContain("сделать сейчас?");
    expect(got).not.toContain("выполнится само");
  });
});

describe("списки с причинами", () => {
  it("четыре безопасных дела, у каждого причина", () => {
    const got = safeList();
    expect(got.length).toBe(4);
    expect(got.every((item) => item.includes("—"))).toBe(true);
  });

  it("четыре меняющих мир, включая «от имени человека, пока он спит»", () => {
    const got = notList().join();
    expect(got).toContain("пока он спит");
    expect(notList().length).toBe(4);
  });

  it("установка обновления ночью — перезапуск без человека", () => {
    expect(notList().join()).toContain("перезапустится без него");
  });
});

describe("человек в 3 ночи у экрана — он тут", () => {
  it("недавно нажимал клавиши — ночные правила не действуют", () => {
    expect(awake(3 * 60, 30_000)).toBe(true);
  });

  it("не нажимал полчаса — спит", () => {
    expect(awake(3 * 60, 30 * 60 * 1000)).toBe(false);
  });

  it("днём всегда «тут»", () => {
    expect(awake(12 * 60, 3 * 60 * 60 * 1000)).toBe(true);
  });
});

describe("одна строка в настройках", () => {
  it("что именно происходит ночью", () => {
    expect(setting()).toContain("мир не меняю");
    expect(setting()).toContain("спрошу утром");
  });
});
