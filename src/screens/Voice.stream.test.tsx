// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { Voice } from "./Voice";
import type { VoiceOptions } from "../lib/useVoice";

/**
 * Поток ответа в экране «Голос».
 *
 * Смысл потока — не «красивее», а «раньше»: человек должен услышать первую фразу,
 * пока модель пишет вторую. Поэтому проверяется не факт подписки, а поведение:
 * куски приходят по одному, звучат по очереди, а перебивание забывает остаток.
 */

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverStub);

const mocks = vi.hoisted(() => ({
  speak: vi.fn((_phrase: string, _lang?: string, onStatus?: (s: string) => void) => {
    // Синтез «договаривает» сразу: в jsdom нет ни звука, ни его окончания.
    onStatus?.("finished");
    return true;
  }),
  stopSpeaking: vi.fn(),
  options: null as VoiceOptions | null,
  handler: null as ((piece: string) => void) | null,
  unsubscribe: vi.fn(),
}));

vi.mock("../lib/useVoice", () => ({
  useVoice: (incoming: VoiceOptions) => {
    mocks.options = incoming;
    return {
      listening: false,
      speaking: false,
      supported: true,
      alwaysSupported: false,
      start: vi.fn(),
      stop: vi.fn(),
    };
  },
}));

vi.mock("../lib/voice", async () => {
  const actual = await vi.importActual<typeof import("../lib/voice")>("../lib/voice");
  return { ...actual, speak: mocks.speak, stopSpeaking: mocks.stopSpeaking };
});

vi.mock("../ipc/tauri", async () => {
  const actual = await vi.importActual<typeof import("../ipc/tauri")>("../ipc/tauri");
  return {
    ...actual,
    onThinkPiece: async (handler: (piece: string) => void) => {
      mocks.handler = handler;
      return mocks.unsubscribe;
    },
  };
});

beforeEach(() => {
  mocks.options = null;
  mocks.handler = null;
  mocks.speak.mockClear();
  mocks.stopSpeaking.mockClear();
  mocks.unsubscribe.mockClear();
});

afterEach(cleanup);

describe("поток ответа на экране «Голос»", () => {
  it("куски звучат по очереди, а не затирают друг друга", async () => {
    render(<Voice onOpen={() => {}} />);
    await vi.waitFor(() => expect(mocks.handler).not.toBeNull());

    mocks.handler?.("Первое предложение.");
    mocks.handler?.("Второе предложение.");

    await vi.waitFor(() => expect(mocks.speak.mock.calls.length).toBe(2));
    const said = mocks.speak.mock.calls.map(([phrase]) => String(phrase));
    expect(said).toEqual(["Первое предложение.", "Второе предложение."]);
  });

  it("уход с экрана обрывает речь и отписывается от кусков", async () => {
    const view = render(<Voice onOpen={() => {}} />);
    await vi.waitFor(() => expect(mocks.handler).not.toBeNull());

    view.unmount();

    await vi.waitFor(() => expect(mocks.stopSpeaking).toHaveBeenCalled());
    expect(mocks.unsubscribe).toHaveBeenCalled();
  });

  it("пустой кусок не превращается в паузу без слов", async () => {
    render(<Voice onOpen={() => {}} />);
    await vi.waitFor(() => expect(mocks.handler).not.toBeNull());

    const before = mocks.speak.mock.calls.length;
    mocks.handler?.("   ");
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(mocks.speak.mock.calls.length).toBe(before);
  });
});
