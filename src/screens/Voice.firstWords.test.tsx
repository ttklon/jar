// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { STALL_LINE } from "../lib/firstWords";
import { Voice } from "./Voice";

/**
 * Шаг 79: первые слова — до конца ответа.
 *
 * Дефект был настоящий и слышимый: человек спрашивал, и приложение молчало
 * весь абзац. Правило `firstWords` лежало в библиотеке и в экран не было
 * подключено — ни «ещё думаю» через секунду, ни решения «произносить только
 * законченное».
 *
 * Здесь проверяется то, что слышит человек, а не внутренние вызовы: строка
 * «ещё думаю» появляется на экране, а снятое правило — то же, что в библиотеке.
 */

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);

/** Что «сказал» голос: очередь речи в jsdom без голоса молчит, поэтому ловим текст. */
const spoken: string[] = [];

vi.mock("../ipc", async () => {
  const actual = await vi.importActual<typeof import("../ipc")>("../ipc");
  return {
    ...actual,
    isTauri: () => false,
    // Ответ приходит через две секунды: дольше порога молчания, поэтому
    // «ещё думаю» обязано прозвучать.
    say: () =>
      new Promise<string>((resolve) => {
        setTimeout(() => resolve("в папке три файла."), 2500);
      }),
    onThinkPiece: async () => () => {},
  };
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  spoken.length = 0;
  vi.useRealTimers();
});

beforeEach(() => {
  localStorage.setItem("zshelper.mic.explained", "1");
  // jsdom не умеет говорить: подменяем синтез, а не правило.
  // Синтез получает не строку, а высказывание: берём его текст, а не объект.
  const speak = vi.fn((utterance: { text: string }) => {
    spoken.push(utterance.text);
  });
  vi.stubGlobal("speechSynthesis", {
    speak,
    cancel: vi.fn(),
    getVoices: () => [],
    speaking: false,
    pending: false,
    paused: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  class Utterance {
    text: string;
    lang = "";
    rate = 1;
    onend: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor(text: string) {
      this.text = text;
    }
  }
  vi.stubGlobal("SpeechSynthesisUtterance", Utterance);
});

describe("первые слова (шаг 79)", () => {
  it("молчание дольше секунды не оставляет человека в тишине", async () => {
    render(<Voice />);
    fireEvent.change(screen.getByLabelText("Услышал"), { target: { value: "что в папке" } });
    fireEvent.click(screen.getByRole("button", { name: "Ответить словами" }));

    // Сразу после нажатия — тишина: «ещё думаю» раньше секунды было бы шумом.
    await waitFor(() => expect(spoken).not.toContain(STALL_LINE));
    // Через порог молчания — сказано, а не промолчано.
    await waitFor(() => expect(spoken).toContain(STALL_LINE), { timeout: 3000 });
  });

  it("ответ, пришедший быстро, не перемежается «ещё думаю»", async () => {
    // Правило: если говорить есть что — говорим, а не жалуемся на ожидание.
    const ipc = await import("../ipc");
    vi.spyOn(ipc, "say").mockResolvedValue("в папке три файла.");
    render(<Voice />);
    fireEvent.change(screen.getByLabelText("Услышал"), { target: { value: "что в папке" } });
    fireEvent.click(screen.getByRole("button", { name: "Ответить словами" }));

    await waitFor(() => expect(spoken.join(" ")).toContain("в папке три файла"), { timeout: 2500 });
    expect(spoken).not.toContain(STALL_LINE);
  });

  it("фраза «ещё думаю» — не обещание времени", () => {
    // «Секундочку» нарушить можно, «работа идёт» — нет.
    expect(STALL_LINE).toContain("думаю");
    expect(STALL_LINE).not.toMatch(/секундочк|сейчас посмотр|минут/);
  });
});
