/**
 * Когда человек говорит, а когда просто шумит комната.
 *
 * Режим «слушаю всегда» без этого невозможен: если писать всё подряд, микрофон будет
 * открыт круглосуточно, а распознавание — получать часы тишины. Поэтому сначала решаем
 * простую задачу: есть ли в куске звука речь.
 *
 * Здесь нет ни браузера, ни микрофона — только арифметика над числами от -1 до 1. Это
 * сделано нарочно: порог тишины нельзя проверить «на слух» в тесте, а можно проверить
 * на синтетическом сигнале. Всё, что требует браузера, живёт в `recorder.ts`.
 *
 * Три правила, из которых нельзя выбросить ни одного:
 * * короткий щелчок — не речь: слишком короткий всплеск игнорируется, иначе хлопок
 *   дверью превращается в задачу;
 * * конец речи — это тишина **длиной**, а не пауза между словами: иначе фраза рвётся
 *   на куски, и приложение слышит «сделай» и «это» отдельно;
 * * гистерезис: начали слушать на одном пороге, заканчиваем на более низком, иначе
 *   дребезг вокруг порога зацикливает режим.
 */

/** Средняя громкость куска: корень из среднего квадрата. */
export function rms(frame: Float32Array): number {
  if (frame.length === 0) return 0;

  let sum = 0;
  for (let index = 0; index < frame.length; index += 1) {
    const sample = frame[index] ?? 0;
    sum += sample * sample;
  }
  return Math.sqrt(sum / frame.length);
}

export interface VadOptions {
  /** Длина куска, мс. От неё считаются все остальные сроки. */
  frameMs?: number;
  /** Громкость, выше которой считаем, что говорят. */
  threshold?: number;
  /** Ниже этого — точно тишина. Между порогами действует гистерезис. */
  floor?: number;
  /** Сколько речи нужно, чтобы признать начало фразы. */
  minSpeechMs?: number;
  /** Сколько тишины нужно, чтобы признать конец фразы. */
  silenceMs?: number;
  /** Дольше этого одну фразу не держим: человек может забыть, что микрофон открыт. */
  maxSpeechMs?: number;
}

export type VadEvent = "start" | "end" | null;

export interface Vad {
  /**
   * Отдать очередной кусок. Возвращает событие, если оно случилось на этом куске:
   * `start` — человек начал говорить, `end` — закончил (или упёрлись в предел).
   */
  feed(frame: Float32Array): VadEvent;
  /** Идёт ли сейчас фраза. */
  speaking(): boolean;
}

interface Resolved {
  frameMs: number;
  threshold: number;
  floor: number;
  minSpeechMs: number;
  silenceMs: number;
  maxSpeechMs: number;
}

/** Порог по умолчанию: тихая комната даёт около 0.001–0.01, речь — на порядок выше. */
export const DEFAULT_VAD: Resolved = {
  frameMs: 40,
  threshold: 0.02,
  floor: 0.012,
  minSpeechMs: 200,
  silenceMs: 700,
  maxSpeechMs: 30_000,
};

export function createVad(options: VadOptions = {}): Vad {
  const settings: Resolved = { ...DEFAULT_VAD, ...options };

  let speaking = false;
  let speechMs = 0;
  let silenceMs = 0;
  let voicedMs = 0;

  return {
    feed(frame: Float32Array): VadEvent {
      const loud = rms(frame) >= (speaking ? settings.floor : settings.threshold);

      if (!speaking) {
        // Начало фразы подтверждается длиной, а не громкостью одного куска.
        voicedMs = loud ? voicedMs + settings.frameMs : 0;
        if (voicedMs >= settings.minSpeechMs) {
          speaking = true;
          speechMs = settings.frameMs;
          silenceMs = 0;
          return "start";
        }
        return null;
      }

      speechMs += settings.frameMs;

      if (loud) {
        silenceMs = 0;
      } else {
        silenceMs += settings.frameMs;
        if (silenceMs >= settings.silenceMs) {
          speaking = false;
          voicedMs = 0;
          return "end";
        }
      }

      if (speechMs >= settings.maxSpeechMs) {
        speaking = false;
        voicedMs = 0;
        return "end";
      }

      return null;
    },

    speaking() {
      return speaking;
    },
  };
}
