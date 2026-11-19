// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { startRecording, type FrameSink, type Recorder } from "./recorder";
import { listen, type VoiceListeners } from "./voice";
import { useVoice } from "./useVoice";

vi.mock("./recorder", () => ({ microphoneAvailable: () => true, startRecording: vi.fn() }));
vi.mock("./voice", () => ({ listen: vi.fn(() => ({ stop: vi.fn() })), stopSpeaking: vi.fn(), speechSupported: () => true }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const recording = { wav: new Uint8Array([1, 2]), seconds: 1, sampleRate: 16000 };
function ready() {
  const stop = vi.fn().mockResolvedValue(recording);
  vi.mocked(startRecording).mockResolvedValue({ stop });
  return stop;
}
async function opened() {
  await act(async () => { await Promise.resolve(); });
}

describe("ASR session isolation", () => {
  it.each([false, true])("cancel after release rejects a late transcript (pauseSend=%s)", async (pauseSend) => {
    ready();
    const answer = deferred<string>();
    const onText = vi.fn(); const onError = vi.fn();
    const transcribe = vi.fn().mockReturnValue(answer.promise);
    const { result } = renderHook(() => useVoice({ local: { transcribe }, onText, onError, pauseSend }));
    act(() => result.current.start()); await opened();
    act(() => result.current.stop());
    await waitFor(() => expect(transcribe).toHaveBeenCalledOnce());
    const signal = transcribe.mock.calls[0]![1] as AbortSignal;
    act(() => result.current.cancel());
    expect(signal.aborted).toBe(true);
    await act(async () => answer.resolve("удали файлы"));
    expect(onText).not.toHaveBeenCalled(); expect(onError).not.toHaveBeenCalled();
  });

  it.each([false, true])("old ASR error cannot stop or report into new capture (pauseSend=%s)", async (pauseSend) => {
    ready(); const answer = deferred<string>();
    const onText = vi.fn(); const onError = vi.fn();
    const transcribe = vi.fn().mockReturnValueOnce(answer.promise).mockResolvedValue("новая фраза");
    const { result } = renderHook(() => useVoice({ local: { transcribe }, onText, onError, pauseSend }));
    act(() => result.current.start()); await opened();
    act(() => result.current.stop());
    await waitFor(() => expect(transcribe).toHaveBeenCalledOnce());
    act(() => result.current.start()); await opened();
    await act(async () => answer.reject(new Error("stale failure")));
    expect(result.current.listening).toBe(true); expect(onError).not.toHaveBeenCalled();
    act(() => result.current.stop());
    await waitFor(() => expect(onText).toHaveBeenCalledWith("новая фраза"));
    expect(startRecording).toHaveBeenCalledTimes(2);
  });

  it("late success cannot submit an old task or finish a newer recording", async () => {
    ready(); const answer = deferred<string>(); const onText = vi.fn();
    const transcribe = vi.fn().mockReturnValueOnce(answer.promise).mockResolvedValue("new");
    const { result } = renderHook(() => useVoice({ local: { transcribe }, onText, onError: vi.fn() }));
    act(() => result.current.start()); await opened(); act(() => result.current.stop());
    await waitFor(() => expect(transcribe).toHaveBeenCalledOnce());
    act(() => result.current.start()); await opened();
    await act(async () => answer.resolve("old destructive request"));
    expect(onText).not.toHaveBeenCalled(); expect(result.current.listening).toBe(true);
    expect(startRecording).toHaveBeenCalledTimes(2);
    act(() => result.current.stop());
    await waitFor(() => expect(onText).toHaveBeenCalledWith("new"));
  });

  it("stopping always mode during ASR never submits or reopens capture", async () => {
    let sink: FrameSink | undefined;
    vi.mocked(startRecording).mockImplementation(async (_rate, callback) => { sink = callback; return { stop: vi.fn().mockResolvedValue(recording) }; });
    const answer = deferred<string>(); const onText = vi.fn(); const onError = vi.fn();
    const transcribe = vi.fn().mockReturnValue(answer.promise);
    const { result } = renderHook(() => useVoice({ local: { transcribe }, always: true, onText, onError }));
    act(() => result.current.start()); await opened();
    act(() => {
      for (let i = 0; i < 5; i++) sink?.(new Float32Array(1024).fill(0.3), 16000);
      for (let i = 0; i < 20; i++) sink?.(new Float32Array(1024), 16000);
    });
    await waitFor(() => expect(transcribe).toHaveBeenCalledOnce());
    act(() => result.current.stop());
    await act(async () => answer.resolve("not a task anymore"));
    expect(onText).not.toHaveBeenCalled(); expect(onError).not.toHaveBeenCalled();
    expect(result.current.listening).toBe(false); expect(startRecording).toHaveBeenCalledOnce();
  });

  it("pending permission is aborted; late recorder never replaces the new recorder", async () => {
    const old = deferred<Recorder>(); const oldStop = vi.fn().mockResolvedValue(recording);
    const newStop = vi.fn().mockResolvedValue(recording);
    vi.mocked(startRecording).mockReturnValueOnce(old.promise).mockResolvedValueOnce({ stop: newStop });
    const transcribe = vi.fn().mockResolvedValue("new"); const onText = vi.fn();
    const { result } = renderHook(() => useVoice({ local: { transcribe }, onText, onError: vi.fn(), pauseSend: false }));
    act(() => result.current.start());
    const signal = vi.mocked(startRecording).mock.calls[0]![2]!.signal!;
    act(() => result.current.cancel()); expect(signal.aborted).toBe(true);
    act(() => result.current.start()); await opened();
    await act(async () => old.resolve({ stop: oldStop }));
    expect(oldStop).toHaveBeenCalledOnce(); expect(newStop).not.toHaveBeenCalled();
    act(() => result.current.stop());
    await waitFor(() => expect(onText).toHaveBeenCalledWith("new"));
    expect(newStop).toHaveBeenCalledOnce();
  });

  it.each(["disable", "unmount"])("%s invalidates an already running ASR", async (end) => {
    ready(); const answer = deferred<string>(); const onText = vi.fn(); const onError = vi.fn();
    const transcribe = vi.fn().mockReturnValue(answer.promise);
    const { result, rerender, unmount } = renderHook(({ enabled }) => useVoice({ local: { transcribe }, onText, onError, enabled }), { initialProps: { enabled: true } });
    act(() => result.current.start()); await opened(); act(() => result.current.stop());
    await waitFor(() => expect(transcribe).toHaveBeenCalledOnce());
    if (end === "disable") rerender({ enabled: false }); else unmount();
    await act(async () => answer.resolve("stale command"));
    expect(onText).not.toHaveBeenCalled(); expect(onError).not.toHaveBeenCalled();
  });

  it("always mode cancellation during ASR discards only that phrase and resumes", async () => {
    let sink: FrameSink | undefined;
    vi.mocked(startRecording).mockImplementation(async (_rate, callback) => { sink = callback; return { stop: vi.fn().mockResolvedValue(recording) }; });
    const answer = deferred<string>(); const onText = vi.fn(); const onError = vi.fn();
    const transcribe = vi.fn().mockReturnValueOnce(answer.promise).mockResolvedValue("следующая");
    const { result } = renderHook(() => useVoice({ local: { transcribe }, always: true, onText, onError }));
    const phrase = () => act(() => {
      for (let i = 0; i < 5; i++) sink?.(new Float32Array(1024).fill(0.3), 16000);
      for (let i = 0; i < 20; i++) sink?.(new Float32Array(1024), 16000);
    });
    act(() => result.current.start()); await opened(); phrase();
    await waitFor(() => expect(transcribe).toHaveBeenCalledOnce());
    const signal = transcribe.mock.calls[0]![1] as AbortSignal;
    act(() => result.current.cancel());
    expect(signal.aborted).toBe(true);
    await act(async () => answer.resolve("не выполнять"));
    await waitFor(() => expect(startRecording).toHaveBeenCalledTimes(2));
    expect(result.current.listening).toBe(true); expect(onText).not.toHaveBeenCalled();
    phrase(); await waitFor(() => expect(onText).toHaveBeenCalledWith("следующая"));
    expect(onError).not.toHaveBeenCalled();
    act(() => result.current.stop());
  });

  it("system recognition cancellation stops the device and ignores late callbacks", () => {
    const deviceStop = vi.fn(); vi.mocked(listen).mockReturnValueOnce({ stop: deviceStop });
    const onText = vi.fn(); const onError = vi.fn();
    const { result } = renderHook(() => useVoice({ onText, onError }));
    act(() => result.current.start());
    const callbacks = vi.mocked(listen).mock.calls.at(-1)![0] as VoiceListeners;
    act(() => result.current.cancel());
    expect(deviceStop).toHaveBeenCalledOnce();
    act(() => { callbacks.onText("stale"); callbacks.onError("stale"); });
    expect(onText).not.toHaveBeenCalled(); expect(onError).not.toHaveBeenCalled();
  });

  it("Escape cancels ASR after release without swallowing unrelated Escape", async () => {
    ready(); const answer = deferred<string>(); const onText = vi.fn();
    const transcribe = vi.fn().mockReturnValue(answer.promise);
    const { result } = renderHook(() => useVoice({ local: { transcribe }, onText, onError: vi.fn() }));
    const idleEscape = new KeyboardEvent("keydown", { key: "Escape", cancelable: true });
    window.dispatchEvent(idleEscape); expect(idleEscape.defaultPrevented).toBe(false);
    act(() => result.current.start()); await opened(); act(() => result.current.stop());
    await waitFor(() => expect(transcribe).toHaveBeenCalledOnce());
    act(() => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); });
    await act(async () => answer.resolve("stale"));
    expect(onText).not.toHaveBeenCalled();
  });
});
