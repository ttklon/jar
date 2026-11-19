import { describe, expect, it, vi } from "vitest";
import { transcribeCancellable } from "./transcription";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
type Invoke = Parameters<typeof transcribeCancellable>[0];

describe("request-scoped native ASR cancellation", () => {
  it("reserves before sending audio and releases the same ID", async () => {
    const call = vi.fn(async (command: string) => command === "begin_transcription" ? "10" : command === "transcribe_local" ? "hello" : undefined);
    await expect(transcribeCancellable(call as Invoke, [1, 2])).resolves.toBe("hello");
    expect(call.mock.calls.map(c => c[0])).toEqual(["begin_transcription", "transcribe_local", "cancel_transcription"]);
    expect(call).toHaveBeenNthCalledWith(2, "transcribe_local", { audio: [1, 2], requestId: "10" });
    expect(call).toHaveBeenNthCalledWith(3, "cancel_transcription", { requestId: "10" });
  });

  it("already aborted signal sends neither audio nor reserve", async () => {
    const call = vi.fn(); const controller = new AbortController(); controller.abort();
    await expect(transcribeCancellable(call, [], controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(call).not.toHaveBeenCalled();
  });

  it("abort while reserve is pending cancels the returned ID without starting ASR", async () => {
    const reserve = deferred<string>();
    const call = vi.fn((c: string) => c === "begin_transcription" ? reserve.promise : Promise.resolve());
    const controller = new AbortController();
    const pending = transcribeCancellable(call as Invoke, [1], controller.signal);
    const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    controller.abort(); reserve.resolve("old");
    await rejected;
    expect(call).toHaveBeenCalledWith("cancel_transcription", { requestId: "old" });
    expect(call.mock.calls.some(c => c[0] === "transcribe_local")).toBe(false);
  });

  it("abort during inference sends one cancellation and waits for worker cleanup", async () => {
    const inference = deferred<string>(); const controller = new AbortController();
    const call = vi.fn(async (c: string) => {
      if (c === "begin_transcription") return "1";
      if (c === "transcribe_local") return inference.promise;
      inference.reject(new Error("native ASR cancelled"));
    });
    const pending = transcribeCancellable(call as Invoke, [1], controller.signal);
    const rejected = expect(pending).rejects.toThrow("native ASR cancelled");
    await Promise.resolve(); controller.abort();
    await rejected;
    expect(call.mock.calls.filter(c => c[0] === "cancel_transcription")).toHaveLength(1);
  });

  it("even a racing success cannot deliver text after abort", async () => {
    const inference = deferred<string>(); const controller = new AbortController();
    const call = vi.fn(async (c: string) => c === "begin_transcription" ? "2" : c === "transcribe_local" ? inference.promise : undefined);
    const pending = transcribeCancellable(call as Invoke, [1], controller.signal);
    const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await Promise.resolve(); controller.abort(); inference.resolve("stale");
    await rejected;
  });

  it("transport failure also releases the reserved ID", async () => {
    const call = vi.fn(async (c: string) => {
      if (c === "begin_transcription") return "3";
      if (c === "transcribe_local") throw new Error("IPC failed");
    });
    await expect(transcribeCancellable(call as Invoke, [1])).rejects.toThrow("IPC failed");
    expect(call).toHaveBeenLastCalledWith("cancel_transcription", { requestId: "3" });
  });
});
