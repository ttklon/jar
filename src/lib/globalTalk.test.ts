// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { GLOBAL_TALK_EVENT, subscribeGlobalTalk } from "./globalTalk";

/**
 * Глобальное удержание в браузере невозможно — и это не ошибка, а честное «нет».
 * Проверяем, что экран не падает и что отписка безопасна.
 */
describe("удержание из любой программы", () => {
  it("в браузере подписка пустая, но отписка работает", async () => {
    const down = vi.fn();
    const up = vi.fn();

    const off = await subscribeGlobalTalk({ down, up });
    expect(typeof off).toBe("function");
    expect(() => off()).not.toThrow();
    expect(down).not.toHaveBeenCalled();
    expect(up).not.toHaveBeenCalled();
  });

  it("имя события одно и то же в ядре и в интерфейсе", () => {
    expect(GLOBAL_TALK_EVENT).toBe("voice://hold");
  });
});
