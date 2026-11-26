import { describe, expect, it } from "vitest";
import { count, DEBOUNCE_MS, expected, handle, INITIAL, notDo, scenarios } from "./hotkeyHold";

/**
 * Шаг 460: тест — горячая клавиша не срабатывает дважды при удержании.
 */

describe("один нажим — одно срабатывание", () => {
  it("нажали и отпустили", () => {
    const got = handle(INITIAL, "down", 0);
    expect(got.fire).toBe(true);
    const up = handle(got.state, "up", 100);
    expect(up.fire).toBe(false);
  });

  it("отпущено — состояние сброшено", () => {
    let state = handle(INITIAL, "down", 0).state;
    state = handle(state, "up", 100).state;
    expect(state.down).toBe(false);
  });
});

describe("удержание не даёт повторов", () => {
  it("три события down подряд — одно срабатывание", () => {
    expect(count(scenarios()[1]!.events).fires).toBe(1);
  });

  it("сказано, что это удержание", () => {
    const state = handle(INITIAL, "down", 0).state;
    const again = handle(state, "down", 300);
    expect(again.fire).toBe(false);
    expect(again.said).toContain("удержание");
  });
});

describe("дребезг — тот же нажим", () => {
  it("два down через 5 мс — одно срабатывание", () => {
    expect(count(scenarios()[2]!.events).fires).toBe(1);
  });

  it("сказано, что это дребезг, а не второе нажатие", () => {
    const state = handle(INITIAL, "down", 0).state;
    expect(handle(state, "down", 5).said).toContain("дребезг");
  });

  it("карантин назван числом", () => {
    expect(DEBOUNCE_MS).toBe(50);
  });
});

describe("три сценария и три ожидания совпадают", () => {
  it("одно нажатие, удержание, дребезг — каждый по одному разу", () => {
    const got = scenarios().map((s) => count(s.events).fires);
    const want = expected().map((e) => e.fires);
    expect(got).toEqual(want);
    expect(got).toEqual([1, 1, 1]);
  });

  it("повторные нажатия после отпускания — каждое считается", () => {
    const got = count([
      { event: "down", at: 0 }, { event: "up", at: 50 },
      { event: "down", at: 200 }, { event: "up", at: 250 },
    ]);
    expect(got.fires).toBe(2);
    expect(got.said).toBe("сработало 2 раза");
  });
});

describe("три дефекта, которых не должно быть", () => {
  it("десять запусков, отмена отмены, путаница с дребезгом", () => {
    const got = notDo().join();
    expect(got).toContain("десять запусков");
    expect(got).toContain("не «отменяет отмену»");
    expect(got).toContain("одно игнорируем, другое считаем тем же нажимом");
  });
});
