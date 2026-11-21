// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Voice } from "./Voice";
import type { VoiceOptions } from "../lib/useVoice";

/**
 * «Ответить словами»: пока модель пишет, человек уже слышит.
 *
 * Проверяется два утверждения, и оба важны:
 *
 *  * куски звучат **по очереди** — иначе `speak()` отменяет предыдущий и остаётся
 *    только последний;
 *  * кусок без запрошенного ответа **молчит** — иначе чужой поток озвучивается
 *    поверх вопроса, который человек задал.
 *
 * Первая версия этого теста проверяла поток на пути `think` и падала — правильно
 * падала: там модель отвечает JSON, и озвучивать его нельзя. Здесь путь честный.
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
  sayCalls: [] as string[],
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

vi.mock("../ipc", async () => {
  const actual = await vi.importActual<typeof import("../ipc")>("../ipc");
  return {
    ...actual,
    isTauri: () => true,
    onThinkPiece: async (handler: (piece: string) => void) => {
      mocks.handler = handler;
      return mocks.unsubscribe;
    },
    say: async (question: string) => {
      mocks.sayCalls.push(question);
      return `Ответ на «${question}».`;
    },
    planFor: async () => [],
    draftPlan: async () => null,
    facts: async () => [],
    speechStatus: async () => null,
    machineState: async () => null,
    readinessStatus: async () => null,
    requestLearning: async () => null,
    cancelTool: async () => undefined,
    setVoiceTrayStatus: async () => undefined,
  };
});

beforeEach(() => {
  mocks.options = null;
  mocks.handler = null;
  mocks.sayCalls = [];
  mocks.speak.mockClear();
  mocks.stopSpeaking.mockClear();
  mocks.unsubscribe.mockClear();
});

afterEach(cleanup);

describe("ответ словами на экране «Голос»", () => {
  it("куски ответа звучат по очереди, а не затирают друг друга", async () => {
    render(<Voice onOpen={() => {}} />);
    await vi.waitFor(() => expect(mocks.handler).not.toBeNull());

    fireEvent.change(screen.getByLabelText("Услышал"), { target: { value: "сколько места" } });
    mocks.speak.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Ответить словами" }));

    // Спросили именно «скажи словами», а не «пойми намерение».
    await vi.waitFor(() => expect(mocks.sayCalls).toEqual(["сколько места"]));
    // Ждём, пока ответ целиком встанет в очередь.
    await vi.waitFor(() =>
      expect(mocks.speak.mock.calls.some(([p]) => String(p).includes("сколько места"))).toBe(true),
    );

    // Модель присылает куски — они должны звучать по порядку.
    mocks.speak.mockClear();
    mocks.handler?.("Первое предложение.");
    await vi.waitFor(() => expect(mocks.speak.mock.calls.length).toBeGreaterThanOrEqual(1));
    mocks.handler?.("Второе предложение.");
    await vi.waitFor(() => expect(mocks.speak.mock.calls.length).toBeGreaterThanOrEqual(2));

    const said = mocks.speak.mock.calls.map(([phrase]) => String(phrase));
    expect(said.indexOf("Первое предложение.")).toBeGreaterThanOrEqual(0);
    expect(said.indexOf("Второе предложение.")).toBeGreaterThan(
      said.indexOf("Первое предложение."),
    );
  });

  it("без вопроса куски молчат: чужой поток не озвучивается", async () => {
    render(<Voice onOpen={() => {}} />);
    await vi.waitFor(() => expect(mocks.handler).not.toBeNull());

    mocks.speak.mockClear();
    mocks.handler?.("Чужой кусок.");
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(mocks.speak).not.toHaveBeenCalled();
  });

  it("уход с экрана обрывает речь и отписывается от кусков", async () => {
    const view = render(<Voice onOpen={() => {}} />);
    await vi.waitFor(() => expect(mocks.handler).not.toBeNull());

    view.unmount();

    await vi.waitFor(() => expect(mocks.stopSpeaking).toHaveBeenCalled());
    expect(mocks.unsubscribe).toHaveBeenCalled();
  });
});
