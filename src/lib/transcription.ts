/** Two-phase IPC: reserve an ASR ID before sending audio, then cancel only that ID.
 * No process paths/PIDs or permissions come from model output.
 */
type Invoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
const cancelled = () => Object.assign(new Error("локальное распознавание отменено"), { name: "AbortError" });

export async function transcribeCancellable(
  invoke: Invoke, audio: number[], signal?: AbortSignal,
): Promise<string> {
  if (signal?.aborted) throw cancelled();
  const requestId = await invoke<string>("begin_transcription");
  let cleanup: Promise<void> | null = null;
  const cancel = () => {
    cleanup ??= invoke<void>("cancel_transcription", { requestId });
    // Attach a handler immediately; cleanup is awaited again in finally.
    void cleanup.catch(() => undefined);
  };
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    if (signal?.aborted) throw cancelled();
    const text = await invoke<string>("transcribe_local", { audio, requestId });
    if (signal?.aborted) throw cancelled();
    return text;
  } finally {
    signal?.removeEventListener("abort", cancel);
    cancel(); // also releases a reservation if sending audio failed before native entry
    await cleanup;
  }
}
