import { describe, expect, it, vi } from "vitest";
import { SLEEP_AFTER_MS, awayFor, shouldCheckAfterWake, watchWake } from "./wakeWatch";

/**
 * Шаг 142: сон машины. Проверяется правило, а не спящий ноутбук.
 *
 * Цена ошибки здесь несимметрична: если посчитать сном обычное переключение
 * окна, движок начнёт перезапускаться при каждом Alt+Tab и разговор будет
 * каждый раз ждать модель заново. Поэтому половина проверок — про то, что
 * сном **не** считается.
 */

describe("разрыв во времени", () => {
  it("переключение окна на минуту — не сон", () => {
    const away = awayFor(0, 60_000);
    expect(away.slept).toBe(false);
    expect(away.why).toContain("переключение");
  });

  it("три часа без окна — сон", () => {
    const away = awayFor(0, 3 * 60 * 60 * 1000);
    expect(away.slept).toBe(true);
    expect(away.why).toContain("сон");
  });

  it("порог назван числом, а не «долго»", () => {
    expect(awayFor(0, SLEEP_AFTER_MS - 1).slept).toBe(false);
    expect(awayFor(0, SLEEP_AFTER_MS).slept).toBe(true);
  });

  it("часы, переведённые назад, — не сон", () => {
    // Перевод времени или ручная правка: «прошло −3600 с» — это сломанные часы,
    // а не отрицательный сон. Перезапускать движок из-за этого незачем.
    const away = awayFor(10_000_000, 6_400_000);
    expect(away.slept).toBe(false);
    expect(away.awayMs).toBeLessThan(0);
  });
});

describe("идти ли к движку", () => {
  it("сон без разговора — не повод дёргать ядро", () => {
    expect(shouldCheckAfterWake(awayFor(0, 60 * 60 * 1000), false)).toBe(false);
  });

  it("сон посреди разговора — повод", () => {
    expect(shouldCheckAfterWake(awayFor(0, 60 * 60 * 1000), true)).toBe(true);
  });

  it("переключение окна посреди разговора — не повод", () => {
    expect(shouldCheckAfterWake(awayFor(0, 1000), true)).toBe(false);
  });
});

describe("подписка", () => {
  function fakeDoc() {
    const listeners = new Map<string, () => void>();
    const doc = {
      visibilityState: "visible" as DocumentVisibilityState,
      addEventListener: (type: string, handler: () => void) => {
        listeners.set(type, handler);
      },
      removeEventListener: (type: string) => {
        listeners.delete(type);
      },
    };
    return { doc: doc as unknown as Document, listeners, docState: doc };
  }

  it("первый показ окна не считается возвращением", () => {
    const { doc, listeners, docState } = fakeDoc();
    const onWake = vi.fn();
    watchWake(onWake, { talking: () => true, now: () => 1_000, doc });

    // Мы «стали видимыми», ни разу не уходя: при запуске это обычное дело.
    docState.visibilityState = "visible";
    listeners.get("visibilitychange")?.();
    expect(onWake).not.toHaveBeenCalled();
  });

  it("после долгого отсутствия зовёт, после короткого — нет", () => {
    const { doc, listeners, docState } = fakeDoc();
    const onWake = vi.fn();
    let clock = 0;
    watchWake(onWake, { talking: () => true, now: () => clock, doc });

    docState.visibilityState = "hidden";
    clock = 1_000;
    listeners.get("visibilitychange")?.();

    // Короткое отсутствие: Alt+Tab.
    clock = 5_000;
    docState.visibilityState = "visible";
    listeners.get("visibilitychange")?.();
    expect(onWake).not.toHaveBeenCalled();

    // Долгое: сон.
    docState.visibilityState = "hidden";
    clock = 6_000;
    listeners.get("visibilitychange")?.();
    clock = 6_000 + 60 * 60 * 1000;
    docState.visibilityState = "visible";
    listeners.get("visibilitychange")?.();
    expect(onWake).toHaveBeenCalledTimes(1);
  });

  it("отписка снимает обработчик", () => {
    const { doc, listeners } = fakeDoc();
    const stop = watchWake(() => {}, { talking: () => true, now: () => 0, doc });
    expect(listeners.has("visibilitychange")).toBe(true);
    stop();
    expect(listeners.has("visibilitychange")).toBe(false);
  });
});
