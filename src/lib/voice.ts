/**
 * Голос: слушать задачу и проговаривать ответ.
 *
 * Всё, что здесь есть, — обёртка над тем, что уже умеет окружение: распознавание
 * речи в WebView2/Chromium и синтез речи системы. Своей модели пока нет, и врать об
 * этом нельзя: чем именно распознаётся звук, сказано в интерфейсе рядом с кнопкой.
 *
 * Правила, которые важны:
 *
 * * нет распознавания — говорим прямо, а не молчим и не делаем вид, что услышали;
 * * ошибка называется причиной («микрофон не найден»), а не кодом;
 * * речь — это только вход: распознанный текст дальше идёт по обычному пути, через
 *   реестр, политику и подтверждения.
 */

interface SpeechAlternative {
  transcript: string;
}

interface SpeechResult {
  length: number;
  [index: number]: SpeechAlternative;
}

interface SpeechResults {
  length: number;
  [index: number]: SpeechResult;
}

interface RecognitionEventLike {
  results?: SpeechResults;
}

interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: RecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

type RecognitionConstructor = new () => RecognitionLike;

interface VoiceGlobals {
  SpeechRecognition?: RecognitionConstructor;
  webkitSpeechRecognition?: RecognitionConstructor;
  speechSynthesis?: {
    speak(utterance: unknown): void;
    cancel(): void;
  };
  SpeechSynthesisUtterance?: new (text: string) => { lang: string };
}

function globals(): VoiceGlobals {
  return globalThis as unknown as VoiceGlobals;
}

/** Есть ли вообще распознавание речи. Не «умеем ли», а «есть ли чем». */
export function speechSupported(): boolean {
  const scope = globals();
  return Boolean(scope.SpeechRecognition ?? scope.webkitSpeechRecognition);
}

/** Человеческая причина, по которой распознавание не состоялось. */
export function voiceErrorText(code: string): string {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "система не дала доступ к микрофону";
    case "audio-capture":
      return "микрофон не найден";
    case "no-speech":
      return "ничего не услышал — повтори";
    case "network":
      return "служба распознавания недоступна";
    case "aborted":
      return "распознавание остановлено";
    default:
      return `распознавание не удалось: ${code}`;
  }
}

/** Что делать, когда распознавания в окружении нет. Одна формулировка на всех. */
export const NO_SPEECH =
  "в этом окружении распознавания речи нет — остаётся напечатать задачу";

export interface VoiceListeners {
  /** Услышанная фраза целиком. Вызывается один раз за фразу. */
  onText(transcript: string): void;
  /** Причина, по которой услышать не удалось. */
  onError(message: string): void;
  /** Распознавание закончилось — своим ходом или потому что остановили. */
  onEnd?(): void;
}

export interface Voice {
  stop(): void;
}

/** Складывает все куски результата в одну фразу. */
function transcriptOf(event: RecognitionEventLike): string {
  const results = event.results;
  if (!results) return "";

  let text = "";
  for (let index = 0; index < results.length; index += 1) {
    const result = results[index];
    if (!result) continue;
    const alternative = result[0];
    if (alternative) text = `${text} ${alternative.transcript}`.trim();
  }
  return text.trim();
}

/**
 * Слушает микрофон до первой фразы. Возвращает ручку, чтобы можно было остановить:
 * человек отпустил кнопку — значит закончил говорить.
 */
export function listen(listeners: VoiceListeners, lang = "ru-RU"): Voice {
  const scope = globals();
  const Recognition = scope.SpeechRecognition ?? scope.webkitSpeechRecognition;

  if (!Recognition) {
    listeners.onError(NO_SPEECH);
    return { stop: () => {} };
  }

  const recognition = new Recognition();
  recognition.lang = lang;
  // Одна фраза за нажатие: так человек понимает, когда его слушают.
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onresult = (event) => {
    const text = transcriptOf(event);
    if (text.length === 0) {
      // Пустой результат — это не «услышал пустоту», а «не разобрал».
      listeners.onError(voiceErrorText("no-speech"));
      return;
    }
    listeners.onText(text);
  };

  recognition.onerror = (event) => {
    const code = event.error ?? "unknown";
    // «aborted» — это наша же остановка, о ней человеку говорить незачем.
    if (code === "aborted") return;
    listeners.onError(voiceErrorText(code));
  };

  recognition.onend = () => listeners.onEnd?.();

  try {
    recognition.start();
  } catch (error) {
    listeners.onError(
      `распознавание не запустилось: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return {
    stop: () => {
      try {
        recognition.stop();
      } catch {
        // Останавливать уже остановленное — не ошибка.
      }
    },
  };
}

/**
 * Проговаривает текст вслух. Возвращает `false`, если синтеза речи в окружении нет:
 * приложение обязано сказать «проговорить не могу», а не молча сделать вид.
 */
export function speak(text: string, lang = "ru-RU"): boolean {
  const scope = globals();
  const synth = scope.speechSynthesis;
  const Utterance = scope.SpeechSynthesisUtterance;
  if (!synth || !Utterance || text.trim().length === 0) return false;

  // Новая фраза отменяет предыдущую: две одновременно — это шум.
  synth.cancel();
  const utterance = new Utterance(text);
  utterance.lang = lang;
  synth.speak(utterance);
  return true;
}

/** Замолчать. Нужно, когда человек перебивает или запускает новую задачу. */
export function stopSpeaking(): void {
  globals().speechSynthesis?.cancel();
}
