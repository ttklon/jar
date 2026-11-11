// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { planFor, speechStatus, transcribeLocal } from "../ipc";
import { startRecording } from "../lib/recorder";
import { Voice } from "./Voice";

/**
 * Когда рядом лежит свой движок, звук не должен уходить наружу: экран обязан пиcать
 * речь и отдавать её локальному распознаванию, а не системному.
 */

vi.mock("../ipc", () => ({
  isTauri: () => true,
  planFor: vi.fn().mockResolvedValue([]),
  draftPlan: vi.fn().mockResolvedValue(null),
  requestLearning: vi.fn().mockResolvedValue(null),
  runPlan: vi.fn(),
  speechStatus: vi.fn(),
  foregroundWindow: vi.fn().mockResolvedValue({
    title: "Видео — браузер",
    process: "chrome.exe",
    pid: 4321,
  }),
  isolationStatus: vi.fn().mockResolvedValue({
    available: true,
    summary: "не больше 256 МБ памяти, 5 с процессорного времени, 8 процессов",
    note: "каждый пробный запуск идёт внутри job object",
  }),
  transcribeLocal: vi.fn(),
}));

vi.mock("../lib/recorder", async () => {
  const actual = await vi.importActual<typeof import("../lib/recorder")>("../lib/recorder");
  return { ...actual, startRecording: vi.fn() };
});

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverStub);

afterEach(() => {
  cleanup();
  vi.mocked(planFor).mockClear();
  vi.mocked(transcribeLocal).mockReset();
  vi.mocked(startRecording).mockReset();
});

const FOUND = {
  found: true,
  program: "C:\\jar\\sidecars\\whisper-server.exe",
  model: "C:\\jar\\models\\ggml-small.bin",
  search_dir: "C:\\jar\\sidecars",
  models_dir: "C:\\jar\\models",
};

describe("локальное распознавание на экране", () => {
  it("говорит заранее, что звук остаётся на компьютере", async () => {
    vi.mocked(speechStatus).mockResolvedValue(FOUND);

    render(<Voice />);

    await waitFor(() => {
      expect(screen.getByText(/локальное распознавание готово/)).toBeTruthy();
    });
    expect(screen.getByText(/звук не покидает компьютер/)).toBeTruthy();
  });

  it("показывает, где оно находится: заголовок и программа окна", async () => {
    render(<Voice onOpen={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText(/Сейчас перед вами: Видео — браузер — chrome\.exe/)).toBeTruthy();
    });
  });

  it("ставит первым то, что про программу перед человеком, и говорит об этом", async () => {
    vi.mocked(planFor).mockResolvedValueOnce([
      {
        key: "звук|поставить|пауза в музыке",
        example: "поставить на паузу музыку",
        risk: "read",
        decision: "allow",
        decision_reason: "",
        needs_token: false,
        tool: "звук|поставить|пауза в музыке",
        score: 9,
      },
      {
        key: "браузер|включить|субтитры",
        example: "включить субтитры в видео на сайте",
        risk: "read",
        decision: "allow",
        decision_reason: "",
        needs_token: false,
        tool: "браузер|включить|субтитры",
        score: 2,
      },
    ]);

    render(<Voice onOpen={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Сейчас перед вами/)).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Услышал"), {
      target: { value: "включи субтитры" },
    });
    fireEvent.click(screen.getByText("Найти"));

    // Порядок: браузерная строка выше музыкальной, хотя счёт у неё меньше.
    await waitFor(() => {
      const subtitles = screen.getByText("включить субтитры в видео на сайте");
      const music = screen.getByText("поставить на паузу музыку");
      expect(subtitles.compareDocumentPosition(music) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
    expect(screen.getByText(/подсказки про это: Видео — браузер — chrome\.exe/)).toBeTruthy();
  });

  it("держу и говорю — запись уходит своему движку", async () => {
    vi.mocked(speechStatus).mockResolvedValue(FOUND);
    const wav = new Uint8Array([0x52, 0x49, 0x46, 0x46, 9, 9]);
    vi.mocked(startRecording).mockResolvedValue({
      stop: vi.fn().mockResolvedValue({ wav, seconds: 1.5, sampleRate: 16_000 }),
    });
    vi.mocked(transcribeLocal).mockResolvedValue("почисти диск");

    render(<Voice />);
    await waitFor(() => expect(screen.getByText(/готово/)).toBeTruthy());

    const mic = screen.getByRole("button", { name: "Держать и говорить" });
    fireEvent.pointerDown(mic);
    await waitFor(() => expect(startRecording).toHaveBeenCalled());
    fireEvent.pointerUp(mic);

    await waitFor(() => {
      expect(transcribeLocal).toHaveBeenCalledWith(Array.from(wav));
    });
    await waitFor(() => {
      expect(planFor).toHaveBeenCalledWith("почисти диск", 8);
    });
    expect(
      (screen.getByLabelText("Услышал") as HTMLInputElement).value,
    ).toBe("почисти диск");
  });

  it("если движок промолчал — человек это слышит", async () => {
    vi.mocked(speechStatus).mockResolvedValue(FOUND);
    vi.mocked(startRecording).mockResolvedValue({
      stop: vi.fn().mockResolvedValue({
        wav: new Uint8Array([1]),
        seconds: 1,
        sampleRate: 16_000,
      }),
    });
    vi.mocked(transcribeLocal).mockRejectedValue(
      new Error("движок не открыл порт 8081 за 60 с"),
    );

    render(<Voice />);
    await waitFor(() => expect(screen.getByText(/готово/)).toBeTruthy());

    fireEvent.pointerDown(screen.getByRole("button", { name: "Держать и говорить" }));
    await waitFor(() => expect(startRecording).toHaveBeenCalled());
    fireEvent.pointerUp(screen.getByRole("button", { name: "Держать и говорить" }));

    await waitFor(() => {
      expect(screen.getByText(/не открыл порт 8081/)).toBeTruthy();
    });
  });
});
