import { describe, expect, it } from "vitest";
import { build, must, notDo, when, type State } from "./rightNow";

/**
 * Шаг 437: экран «что происходит прямо сейчас».
 */

const now = new Date(2026, 10, 20, 12, 0).getTime();
const state = (over: Partial<State> = {}): State => ({ running: [], waiting: [], scheduled: [], modelReady: true, ...over });

describe("порядок по срочности", () => {
  it("ждущее первым, потом идущее, потом спящее", () => {
    const got = build(
      state({
        waiting: [{ what: "уборка", step: 2, total: 7, waitingFor: "удалить 12 файлов?" }],
        running: [{ what: "проверка диска", step: 0, total: 3 }],
        scheduled: [{ what: "копия", nextAt: now + 3_600_000 }],
      }),
      now,
    );
    expect(got.map((b) => b.title)).toEqual(["ждёт вашего ответа", "делается сейчас", "по расписанию"]);
  });

  it("ждущее показывает вопрос целиком", () => {
    const got = build(state({ waiting: [{ what: "уборка", step: 2, total: 7, waitingFor: "удалить 12 файлов?" }] }), now);
    expect(got[0]!.lines[0]).toBe("«уборка»: удалить 12 файлов?");
  });

  it("идущее — с шагом", () => {
    const got = build(state({ running: [{ what: "проверка", step: 1, total: 3 }] }), now);
    expect(got[0]!.lines[0]).toBe("«проверка»: шаг 2 из 3");
  });

  it("расписание — по времени, ближайшее первым", () => {
    const got = build(
      state({ scheduled: [{ what: "позже", nextAt: now + 7_200_000 }, { what: "скоро", nextAt: now + 600_000 }] }),
      now,
    );
    expect(got[0]!.lines[0]).toContain("скоро");
  });
});

describe("«ничего не происходит» — честный ответ, а не пустой экран", () => {
  it("так и сказано", () => {
    const got = build(state(), now);
    expect(got[0]!.title).toBe("ничего не происходит");
    expect(got[0]!.lines[0]).toContain("Жду вашу фразу");
  });

  it("модель не загружена — сказано, и это нормально", () => {
    const got = build(state({ modelReady: false }), now);
    expect(got[0]!.lines[0]).toContain("загрузится при первом деле");
  });
});

describe("время по-русски", () => {
  it("секунды, минуты, часы, дни", () => {
    expect(when(now + 30_000, now)).toBe("через 30 с");
    expect(when(now + 600_000, now)).toBe("через 10 мин");
    expect(when(now + 7_200_000, now)).toBe("через 2 ч");
    expect(when(now + 2 * 86_400_000, now)).toBe("через 2 дн");
  });

  it("просрочено — так и сказано, а не «через -5 мин»", () => {
    expect(when(now - 1000, now)).toContain("просрочено");
  });
});

describe("экран показывает, а не управляет", () => {
  it("останавливать — в самом деле", () => {
    expect(notDo()[0]).toContain("в самом деле, а не на обзорном экране");
  });

  it("четыре обязательных пункта", () => {
    expect(must()).toHaveLength(4);
  });
});
