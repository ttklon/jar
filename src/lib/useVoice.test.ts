// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { listen } from "./voice";
import type { Voice, VoiceListeners } from "./voice";
import { startRecording } from "./recorder";
import { useVoice } from "./useVoice";

/**
 * «Держу и говорю»: пока держишь — слушаем, отпустил — разбираем. Если разобрать не
 * удалось, человек это слышит, а не остаётся в тишине.
 */

vi.mock("./recorder", async () => {
  const actual = await vi.importActual<typeof import("./recorder")>("./recorder");
  return {
    ...actual,
    microphoneAvailable: () => true,
    startRecording: vi.fn(),
  };
});

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
  vi.mocked(startRecording).mockReset();
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

describe("свой движок распознавания", () => {
  const WAV = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3]);

  it("пишет звук и отдаёт его движку, а не системе", async () => {
    const stopRecorder = vi.fn().mockResolvedValue({ wav: WAV, seconds: 1.2, sampleRate: 16_000 });
    vi.mocked(startRecording).mockResolvedValue({ stop: stopRecorder });

    const transcribe = vi.fn().mockResolvedValue("  открой почту ");
    const onText = vi.fn();

    const { result } = renderHook(() =>
      useVoice({ onText, onError: vi.fn(), local: { transcribe } }),
    );

    act(() => result.current.start());
    await act(async () => {
      await Promise.resolve();
    });

    act(() => result.current.stop());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // Системное распознавание не трогали: звук ушёл своему движку.
    expect(vi.mocked(listen)).not.toHaveBeenCalled();
    expect(transcribe).toHaveBeenCalledWith(WAV);
    expect(onText).toHaveBeenCalledWith("открой почту");
    expect(result.current.listening).toBe(false);
  });

  it("тишина — это «ничего не сказано», и движок не тревожится", async () => {
    const stopRecorder = vi.fn().mockResolvedValue({ wav: WAV, seconds: 0, sampleRate: 16_000 });
    vi.mocked(startRecording).mockResolvedValue({ stop: stopRecorder });

    const transcribe = vi.fn();
    const onError = vi.fn();

    const { result } = renderHook(() =>
      useVoice({ onText: vi.fn(), onError, local: { transcribe }, nothingHeard: "тишина" }),
    );

    act(() => result.current.start());
    await act(async () => {
      await Promise.resolve();
    });
    act(() => result.current.stop());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(transcribe).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith("тишина");
  });

  it("движок не ответил — об этом сказано его словами", async () => {
    const stopRecorder = vi.fn().mockResolvedValue({ wav: WAV, seconds: 1, sampleRate: 16_000 });
    vi.mocked(startRecording).mockResolvedValue({ stop: stopRecorder });

    const transcribe = vi.fn().mockRejectedValue(new Error("движок не отвечает на 127.0.0.1:8081"));
    const onError = vi.fn();

    const { result } = renderHook(() =>
      useVoice({ onText: vi.fn(), onError, local: { transcribe } }),
    );

    act(() => result.current.start());
    await act(async () => {
      await Promise.resolve();
    });
    act(() => result.current.stop());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onError).toHaveBeenCalledWith("движок не отвечает на 127.0.0.1:8081");
  });
});

/**
 * Отмена: «нет, я не то сказал». Запись выбрасывается, разбора нет, упрёка за молчание
 * тоже нет — иначе человек, передумав, получает ровно то, чего не хотел.
 */
describe("отмена записи", () => {
  it("Esc при удержании выбрасывает запись без разбора и без ошибки", async () => {
    const onText = vi.fn();
    const onError = vi.fn();
    const stopRecording = vi.fn().mockResolvedValue({ wav: new Uint8Array([1]), seconds: 2 });
    const transcribe = vi.fn().mockResolvedValue("не то");

    vi.mocked(startRecording).mockResolvedValue({ stop: stopRecording } as never);

    const { result } = renderHook(() =>
      useVoice({ onText, onError, local: { transcribe } }),
    );

    act(() => result.current.start());
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      await Promise.resolve();
    });

    expect(onText).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(transcribe).not.toHaveBeenCalled();
    expect(stopRecording).toHaveBeenCalled();
    expect(result.current.listening).toBe(false);
  });

  it("отмена без записи ничего не ломает", () => {
    const onError = vi.fn();
    const { result } = renderHook(() => useVoice({ onText: vi.fn(), onError }));

    act(() => result.current.cancel());

    expect(onError).not.toHaveBeenCalled();
    expect(result.current.listening).toBe(false);
  });
});
