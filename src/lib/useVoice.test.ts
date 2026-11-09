// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { listen } from "./voice";
import type { Voice, VoiceListeners } from "./voice";
import { useVoice } from "./useVoice";

/**
 * «Держу и говорю»: пока держишь — слушаем, отпустил — разбираем. Если разобрать не
 * удалось, человек это слышит, а не остаётся в тишине.
 */

vi.mock("./voice", async () => {
  const actual = await vi.importActual<typeof import("./voice")>("./voice");
  return {
    ...actual,
    listen: vi.fn(),
    speak: vi.fn(),
    stopSpeaking: vi.fn(),
    speechSupported: () => true,
  };
});

function listeners(): VoiceListeners {
  const call = vi.mocked(listen).mock.calls.at(-1);
  if (!call) throw new Error("микрофон не включали");
  return call[0];
}

let stopSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  stopSpy = vi.fn();
  vi.mocked(listen).mockImplementation(() => ({ stop: stopSpy }) as Voice);
});

afterEach(() => {
  vi.mocked(listen).mockReset();
  vi.useRealTimers();
});

describe("удержание микрофона", () => {
  it("пока держим — слушаем, услышали — отпускаем сами", () => {
    const onText = vi.fn();
    const { result } = renderHook(() =>
      useVoice({ onText, onError: vi.fn() }),
    );

    act(() => result.current.start());
    expect(result.current.listening).toBe(true);
    expect(vi.mocked(listen)).toHaveBeenCalledTimes(1);

    act(() => listeners().onText("почисти диск"));

    expect(onText).toHaveBeenCalledWith("почисти диск");
    expect(result.current.listening).toBe(false);
  });

  it("отпустили без разбора — говорим «не разобрал», а не молчим", () => {
    vi.useFakeTimers();
    const onError = vi.fn();
    const { result } = renderHook(() =>
      useVoice({ onText: vi.fn(), onError, grace: 1000, nothingHeard: "не расслышал" }),
    );

    act(() => result.current.start());
    act(() => result.current.stop());

    // Пока идёт пауза, приговор не вынесен: система ещё может ответить.
    expect(onError).not.toHaveBeenCalled();
    expect(result.current.listening).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(onError).toHaveBeenCalledWith("не расслышал");
    expect(result.current.listening).toBe(false);
  });

  it("разбор пришёл после отпускания — это не ошибка", () => {
    vi.useFakeTimers();
    const onText = vi.fn();
    const onError = vi.fn();
    const { result } = renderHook(() =>
      useVoice({ onText, onError, grace: 1000 }),
    );

    act(() => result.current.start());
    act(() => result.current.stop());
    act(() => listeners().onText("открой почту"));
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(onText).toHaveBeenCalledWith("открой почту");
    expect(onError).not.toHaveBeenCalled();
    expect(result.current.listening).toBe(false);
  });

  it("Ctrl+Space держит микрофон, а в поле ввода не мешает печатать", () => {
    const { result } = renderHook(() => useVoice({ onText: vi.fn(), onError: vi.fn() }));

    const input = document.createElement("input");
    document.body.appendChild(input);

    act(() => {
      input.dispatchEvent(
        new KeyboardEvent("keydown", { code: "Space", ctrlKey: true, bubbles: true }),
      );
    });
    expect(result.current.listening).toBe(false);

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { code: "Space", ctrlKey: true, bubbles: true }),
      );
    });
    expect(result.current.listening).toBe(true);

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keyup", { code: "Space", ctrlKey: true, bubbles: true }),
      );
    });
    expect(stopSpy).toHaveBeenCalled();

    input.remove();
  });
});
