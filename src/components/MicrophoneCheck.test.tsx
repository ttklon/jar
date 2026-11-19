// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MicrophoneCheck } from "./MicrophoneCheck";
import { checkMicrophone, type MicrophoneMeasurement } from "../lib/microphoneCheck";
import { microphoneCheck as text } from "../i18n/ru";

vi.mock("../lib/microphoneCheck", () => ({ checkMicrophone: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
function deferred() {
  let resolve!: (result: MicrophoneMeasurement) => void;
  const promise = new Promise<MicrophoneMeasurement>((done) => { resolve = done; });
  return { resolve, promise };
}
const signalResult: MicrophoneMeasurement = { kind: "signal", seconds: 3, rms: 0.02, peak: 0.1 };

describe("явная диагностика микрофона", () => {
  it("не запускается при показе, требует кнопку и не выдаёт сигнал за ASR", async () => {
    const done = deferred();
    vi.mocked(checkMicrophone).mockReturnValue(done.promise);
    const busy = vi.fn();
    render(<MicrophoneCheck onBusyChange={busy} />);
    expect(checkMicrophone).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: text.start }));
    expect(checkMicrophone).toHaveBeenCalledOnce();
    expect(busy).toHaveBeenCalledWith(true);
    done.resolve(signalResult);
    await screen.findByText(text.signal);
    expect(screen.getByText(text.boundary)).toBeTruthy();
    expect(busy).toHaveBeenLastCalledWith(false);
  });

  it("отмена и повтор не принимают старый результат", async () => {
    const first = deferred(); const second = deferred();
    vi.mocked(checkMicrophone).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    render(<MicrophoneCheck />);
    fireEvent.click(screen.getByRole("button", { name: text.start }));
    const signal = vi.mocked(checkMicrophone).mock.calls[0]![0];
    fireEvent.click(screen.getByRole("button", { name: text.cancel }));
    expect(signal.aborted).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: text.start }));
    first.resolve(signalResult);
    await waitFor(() => expect(screen.queryByText(text.signal)).toBeNull());
    expect(screen.getByRole("button", { name: text.cancel })).toBeTruthy();
    second.resolve({ ...signalResult, kind: "quiet" });
    await screen.findByText(text.quiet);
  });

  it("скрытие экрана отменяет тест, но не перезапускает его при возврате", async () => {
    const done = deferred(); vi.mocked(checkMicrophone).mockReturnValue(done.promise);
    const { rerender } = render(<MicrophoneCheck active />);
    fireEvent.click(screen.getByRole("button", { name: text.start }));
    const signal = vi.mocked(checkMicrophone).mock.calls[0]![0];
    rerender(<MicrophoneCheck active={false} />);
    expect(signal.aborted).toBe(true);
    done.resolve(signalResult);
    rerender(<MicrophoneCheck active />);
    await waitFor(() => expect(screen.queryByText(text.signal)).toBeNull());
    expect(checkMicrophone).toHaveBeenCalledOnce();
  });

  it("unmount отменяет текущий запрос", () => {
    vi.mocked(checkMicrophone).mockReturnValue(new Promise(() => {}));
    const { unmount } = render(<MicrophoneCheck />);
    fireEvent.click(screen.getByRole("button", { name: text.start }));
    const signal = vi.mocked(checkMicrophone).mock.calls[0]![0];
    unmount();
    expect(signal.aborted).toBe(true);
  });

  it("не конкурирует с разговорным захватом", () => {
    render(<MicrophoneCheck disabled />);
    fireEvent.click(screen.getByRole("button", { name: text.start }));
    expect(checkMicrophone).not.toHaveBeenCalled();
    expect(screen.getByText(text.locked)).toBeTruthy();
  });

  it("показывает отказ честно, разрешает повтор", async () => {
    vi.mocked(checkMicrophone).mockRejectedValueOnce(new Error("доступ запрещён"));
    render(<MicrophoneCheck />);
    fireEvent.click(screen.getByRole("button", { name: text.start }));
    await screen.findByRole("alert");
    expect(screen.getByRole("alert").textContent).toContain("доступ запрещён");
    expect(screen.getByRole("button", { name: text.start })).toBeTruthy();
  });
});
