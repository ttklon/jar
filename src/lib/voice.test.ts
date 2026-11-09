import { afterEach, describe, expect, it, vi } from "vitest";
import { listen, NO_SPEECH, speak, speechSupported, voiceErrorText } from "./voice";

/**
 * Голос — это обёртка над окружением, поэтому проверяем ровно её: что происходит,
 * когда распознавание есть, когда его нет и когда оно падает.
 */

interface FakeRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: unknown) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

let created: FakeRecognition[] = [];

class RecognitionStub implements FakeRecognition {
  lang = "";
  continuous = true;
  interimResults = true;
  maxAlternatives = 2;
  onresult: ((event: unknown) => void) | null = null;
  onerror: ((event: { error?: string }) => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn();

  constructor() {
    created.push(this);
  }
}

afterEach(() => {
  created = [];
  vi.unstubAllGlobals();
});

describe("голос", () => {
  it("без распознавания говорит прямо, что его нет", () => {
    expect(speechSupported()).toBe(false);

    const onError = vi.fn();
    listen({ onText: vi.fn(), onError });

    expect(onError).toHaveBeenCalledWith(NO_SPEECH);
  });

  it("услышанная фраза приходит одной строкой", () => {
    vi.stubGlobal("SpeechRecognition", RecognitionStub);

    const onText = vi.fn();
    const onError = vi.fn();
    listen({ onText, onError });

    const recognition = created[0];
    if (!recognition) throw new Error("распознавание не создалось");
    expect(recognition.lang).toBe("ru-RU");
    expect(recognition.continuous).toBe(false);
    expect(recognition.start).toHaveBeenCalled();

    recognition.onresult?.({
      results: {
        length: 2,
        0: { length: 1, 0: { transcript: "наведи порядок" } },
        1: { length: 1, 0: { transcript: "в загрузках" } },
      },
    });

    expect(onText).toHaveBeenCalledWith("наведи порядок в загрузках");
    expect(onError).not.toHaveBeenCalled();
  });

  it("ошибки называются причиной, а наша остановка — не ошибка", () => {
    expect(voiceErrorText("audio-capture")).toBe("микрофон не найден");
    expect(voiceErrorText("no-speech")).toBe("ничего не услышал — повтори");
    expect(voiceErrorText("что-то")).toContain("распознавание не удалось");

    vi.stubGlobal("SpeechRecognition", RecognitionStub);
    const onError = vi.fn();
    const voice = listen({ onText: vi.fn(), onError });
    const recognition = created[0];
    if (!recognition) throw new Error("распознавание не создалось");

    recognition.onerror?.({ error: "not-allowed" });
    expect(onError).toHaveBeenCalledWith("система не дала доступ к микрофону");

    onError.mockClear();
    recognition.onerror?.({ error: "aborted" });
    expect(onError).not.toHaveBeenCalled();

    voice.stop();
    expect(recognition.stop).toHaveBeenCalled();
  });

  it("пустой результат — это «не разобрал», а не пустая фраза", () => {
    vi.stubGlobal("SpeechRecognition", RecognitionStub);

    const onText = vi.fn();
    const onError = vi.fn();
    listen({ onText, onError });

    const recognition = created[0];
    if (!recognition) throw new Error("распознавание не создалось");
    recognition.onresult?.({ results: { length: 0 } });

    expect(onText).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith("ничего не услышал — повтори");
  });

  it("проговаривание отменяет предыдущую фразу и честно молчит без синтеза", () => {
    expect(speak("привет")).toBe(false);

    const spoken: { text: string; lang: string }[] = [];
    const cancel = vi.fn();
    vi.stubGlobal("speechSynthesis", {
      speak: (utterance: { text: string; lang: string }) => spoken.push(utterance),
      cancel,
    });
    vi.stubGlobal(
      "SpeechSynthesisUtterance",
      class {
        text: string;
        lang = "";
        constructor(text: string) {
          this.text = text;
        }
      },
    );

    expect(speak("план выполнен")).toBe(true);
    expect(cancel).toHaveBeenCalledTimes(1);
    const first = spoken[0];
    if (!first) throw new Error("фраза не прозвучала");
    expect(first.text).toBe("план выполнен");
    expect(first.lang).toBe("ru-RU");

    // Пустая строка — это не фраза, синтезатор её не трогает.
    expect(speak("   ")).toBe(false);
  });
});
