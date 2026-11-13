/**
 * Кнопка «держу и говорю» как состояние, а не как набор обработчиков в экране.
 *
 * Замысел: человек ничего не выбирает мышкой. Он зажимает кнопку (или Ctrl+Space),
 * говорит, отпускает — и слышит, что приложение поняло. Поэтому:
 *
 * * пока держишь — слушаем; отпустил — заканчиваем и ждём разбор;
 * * после отпускания даём распознаванию короткую паузу: система отдаёт результат
 *   не мгновенно, и обрывать её на полуслове значит терять последние слова;
 * * если за это время ничего не пришло — так и говорим: «не разобрал»;
 * * передумал — отмена: запись выбрасывается, разбора нет, ошибки нет. Сказал «нет, не то»
 *   и не получил ни фразы, ни упрёка;
 * * хоткей не срабатывает, когда человек печатает в поле: пробел должен оставаться
 *   пробелом.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { microphoneAvailable, startRecording, type Recorder } from "./recorder";
import { createVad, type Vad } from "./vad";
import { listen, speechSupported, stopSpeaking, type Voice } from "./voice";

/** Сколько ждём разбор после того, как человек отпустил кнопку. */
export const GRACE_MS = 2500;

export interface VoiceOptions {
  /** Услышанная фраза. */
  onText(text: string): void;
  /** Почему услышать не удалось. */
  onError(message: string): void;
  /** Включить удержание Ctrl+Space. По умолчанию да. */
  hotkey?: boolean;
  /** Пауза ожидания разбора после отпускания, мс. */
  grace?: number;
  /** Что сказать, если после отпускания ничего не разобралось. */
  nothingHeard?: string;
  /**
   * Свой движок распознавания. Есть — записываем звук и отдаём ему, звук остаётся на
   * компьютере. Нет — слушаем тем, что даёт система.
   */
  local?: { transcribe(wav: Uint8Array): Promise<string> } | null;
  /**
   * Режим «слушаю всегда»: микрофон открыт, фразу вырезает `vad`, разбор запускается сам.
   * Работает только со своим движком: системное распознавание однократное, и делать вид,
   * что оно слушает круглосуточно, было бы обманом.
   */
  always?: boolean;
  /**
   * Отправлять фразу по паузе, а не только по отпусканию (по умолчанию да).
   *
   * Нужно для длинной речи: человек говорит, задумывается, продолжает — и не обязан держать
   * кнопку, пока думает. Каждая фраза уходит, как только он замолчал; микрофон продолжает
   * слушать, пока кнопка нажата. Без своего движка не работает: паузу вырезает `vad`, а
   * системное распознавание однократное.
   */
  pauseSend?: boolean;
}

export interface VoiceControl {
  listening: boolean;
  supported: boolean;
  /** Идёт ли сейчас фраза в режиме «слушаю всегда». */
  speaking: boolean;
  /** Можно ли включать режим «слушаю всегда» на этой машине. */
  alwaysSupported: boolean;
  start(): void;
  stop(): void;
  /**
   * Отмена: выбросить запись, ничего не разбирать и не сообщать об ошибке.
   *
   * Нужна ровно для случая «нет, я не то сказал»: человек не должен ни ждать разбора, ни
   * получать упрёк за молчание. В режиме «слушаю всегда» отменяется текущая фраза, а
   * слушание продолжается: там отмена — это «не считается», а не «выключись».
   */
  cancel(): void;
}

/** Печатает ли человек прямо сейчас: тогда хоткей молчит. */
function typing(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) return false;
  const tag = element.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    element.isContentEditable === true
  );
}

export function useVoice(options: VoiceOptions): VoiceControl {
  const {
    onText,
    onError,
    hotkey = true,
    grace = GRACE_MS,
    nothingHeard = "не разобрал — попробуйте ещё раз",
    local = null,
    always = false,
    pauseSend = true,
  } = options;
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  const voiceRef = useRef<Voice | null>(null);
  const recorderRef = useRef<Recorder | null>(null);
  const graceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heardRef = useRef(false);
  const activeRef = useRef(false);
  /** Режим «слушаю всегда» живёт в ссылке: он меняется, не пересоздавая слушание. */
  const alwaysRef = useRef(always);
  alwaysRef.current = always;
  /** Отправка по паузе — тоже в ссылке: переключатель не должен рвать текущую запись. */
  const pauseSendRef = useRef(pauseSend);
  pauseSendRef.current = pauseSend;
  /** Чем закончить текущую фразу, не дожидаясь тишины: нужно при отпускании кнопки. */
  const flushRef = useRef<(() => void) | null>(null);
  /** Чем остановить текущую всегда-запись, если человек передумал. */
  const alwaysStop = useRef<(() => void) | null>(null);
  /**
   * «Текущая фраза не считается». В режиме «слушаю всегда» это единственный способ
   * выбросить уже записанное, не выключая микрофон.
   */
  const discardRef = useRef(false);

  // Колбэки живут в ссылке: иначе каждое изменение пропсов пересоздавало бы слушание.
  const callbacks = useRef({ onText, onError, nothingHeard, local });
  callbacks.current = { onText, onError, nothingHeard, local };

  const clearGrace = useCallback(() => {
    if (graceRef.current !== null) {
      clearTimeout(graceRef.current);
      graceRef.current = null;
    }
  }, []);

  const finish = useCallback(() => {
    clearGrace();
    activeRef.current = false;
    voiceRef.current = null;
    setListening(false);
  }, [clearGrace]);

  /**
   * Цикл «фраза за фразой»: запись → `vad` находит начало и конец → разбор → снова запись.
   *
   * Работает в двух случаях, и это одна и та же механика:
   *  * «слушаю всегда» — пока режим включён;
   *  * удержание с отправкой по паузе — пока кнопка нажата. Отпустил — текущая фраза
   *    заканчивается и уходит, а цикл прекращается.
   */
  const listenSegments = useCallback((forever: boolean) => {
    const engine = callbacks.current.local;
    if (!engine) return;

    const run = () => {
      if (!activeRef.current) return;

      let recorder: Recorder | null = null;
      let vad: Vad | null = null;
      let ended = false;
      let stopWhenReady = false;

      const close = () => {
        const current = recorder;
        recorder = null;
        if (!current) {
          stopWhenReady = true;
          return;
        }

        // Фразу отменили: закрываем микрофон и начинаем заново, без разбора.
        if (discardRef.current) {
          discardRef.current = false;
          current
            .stop()
            .catch(() => undefined)
            .finally(() => {
              if (activeRef.current) run();
              else finish();
            });
          return;
        }

        current
          .stop()
          .then((recording) => {
            if (recording.seconds === 0) {
              // При удержании молчание — это «ничего не сказано»: человек ждёт ответа.
              // В режиме «слушаю всегда» так же молчать правильно: шумят постоянно.
              if (!forever) callbacks.current.onError(callbacks.current.nothingHeard);
              return null;
            }
            return engine.transcribe(recording.wav);
          })
          .then((text) => {
            if (text === null) return;
            const said = text.trim();
            if (said.length > 0) {
              callbacks.current.onText(said);
              return;
            }
            // Пустая расшифровка: в «слушаю всегда» это кашель, при удержании — не разобрал.
            if (!forever) callbacks.current.onError(callbacks.current.nothingHeard);
          })
          .catch((error: unknown) => {
            callbacks.current.onError(error instanceof Error ? error.message : String(error));
          })
          .finally(() => {
            if (activeRef.current) run();
            else finish();
          });
      };

      // Отпускание кнопки не ждёт тишины: заканчиваем фразу тем же `close`.
      flushRef.current = () => {
        if (!ended) {
          ended = true;
          setSpeaking(false);
        }
        close();
      };

      startRecording(undefined, (frame, sampleRate) => {
        if (!vad) {
          vad = createVad({ frameMs: (frame.length / sampleRate) * 1000 });
        }

        const event = vad.feed(frame);
        if (event === "start") setSpeaking(true);

        if (event === "end" && !ended) {
          ended = true;
          setSpeaking(false);
          // Микрофон закрываем вне обработчика звука: останавливать граф изнутри него
          // значит ловить зависание на некоторых системах.
          setTimeout(close, 0);
          return false;
        }

        return true;
      })
        .then((opened) => {
          recorder = opened;
          // Здесь мы уже не внутри обработчика звука: закрывать можно сразу, без таймера.
          if (stopWhenReady) {
            stopWhenReady = false;
            close();
          }
          if (!activeRef.current) close();
        })
        .catch((error: unknown) => {
          finish();
          callbacks.current.onError(
            error instanceof Error ? error.message : String(error),
          );
        });
    };

    // «Слушаю всегда» выключается целиком; удержание — нет, там заканчивается только фраза.
    if (forever) {
      alwaysStop.current = () => {
        activeRef.current = false;
        setListening(false);
        setSpeaking(false);
        alwaysStop.current = null;
        flushRef.current = null;
      };
    }

    run();
  }, [finish]);

  const start = useCallback(() => {
    if (activeRef.current) return;

    discardRef.current = false;
    stopSpeaking();
    heardRef.current = false;
    activeRef.current = true;
    setListening(true);

    const engine = callbacks.current.local;
    if (engine && alwaysRef.current) {
      listenSegments(true);
      return;
    }

    // Удержание с отправкой по паузе: говорим фразу за фразой, кнопку держим, пока думаем.
    if (engine && pauseSendRef.current) {
      listenSegments(false);
      return;
    }

    if (engine) {
      // Свой движок: пишем звук, распознаём после отпускания. Разрешение на микрофон
      // спрашивается здесь же, и отказ должен быть слышен, а не проглочен.
      startRecording()
        .then((recorder) => {
          if (!activeRef.current) {
            // Отпустили раньше, чем открылся микрофон: не держим его включённым.
            recorder.stop().catch(() => {});
            return;
          }
          recorderRef.current = recorder;
        })
        .catch((error: unknown) => {
          finish();
          callbacks.current.onError(
            error instanceof Error ? error.message : String(error),
          );
        });
      return;
    }

    voiceRef.current = listen({
      onText: (text) => {
        // Одна фраза — одно нажатие: услышали, дальше слушать нечего.
        heardRef.current = true;
        finish();
        callbacks.current.onText(text);
      },
      onError: (message) => {
        finish();
        callbacks.current.onError(message);
      },
      onEnd: () => {
        // Разбор закончился — ждать больше нечего.
        if (heardRef.current) finish();
      },
    });
  }, [finish, listenSegments]);

  const stop = useCallback(() => {
    if (!activeRef.current) return;

    const stopAlways = alwaysStop.current;
    if (stopAlways) {
      // Режим «слушаю всегда» выключается целиком, а не «заканчивает фразу».
      stopAlways();
      return;
    }

    // Отпустили кнопку в режиме «фраза за фразой»: текущая фраза уходит, цикл прекращается.
    const flush = flushRef.current;
    if (flush) {
      flushRef.current = null;
      activeRef.current = false;
      setListening(false);
      flush();
      return;
    }

    const engine = callbacks.current.local;
    if (engine) {
      const recorder = recorderRef.current;
      recorderRef.current = null;
      finish();

      if (!recorder) {
        // Микрофон ещё не открылся — сказать нечего, но и молчать не надо.
        callbacks.current.onError("микрофон не успел открыться — попробуйте ещё раз");
        return;
      }

      recorder
        .stop()
        .then((recording) => {
          if (recording.seconds === 0) {
            callbacks.current.onError(callbacks.current.nothingHeard);
            return null;
          }
          return engine.transcribe(recording.wav);
        })
        .then((text) => {
          if (text === null) return;
          if (text.trim().length === 0) {
            callbacks.current.onError(callbacks.current.nothingHeard);
            return;
          }
          callbacks.current.onText(text.trim());
        })
        .catch((error: unknown) =>
          callbacks.current.onError(error instanceof Error ? error.message : String(error)),
        );
      return;
    }

    voiceRef.current?.stop();

    // Отпустили — не обрываем разбор сразу: даём системе сказать своё слово.
    clearGrace();
    graceRef.current = setTimeout(() => {
      if (!activeRef.current) return;
      if (!heardRef.current) {
        callbacks.current.onError(callbacks.current.nothingHeard);
      }
      finish();
    }, grace);
  }, [clearGrace, finish, grace]);

  const cancel = useCallback(() => {
    if (!activeRef.current) return;

    // «Слушаю всегда»: фраза не считается, микрофон продолжает слушать.
    if (alwaysStop.current) {
      discardRef.current = true;
      setSpeaking(false);
      return;
    }

    // Удержание с паузой: закрываем текущую запись, но ничего не разбираем и не отправляем.
    const flush = flushRef.current;
    if (flush) {
      flushRef.current = null;
      discardRef.current = true;
      activeRef.current = false;
      setListening(false);
      setSpeaking(false);
      flush();
      return;
    }

    const engine = callbacks.current.local;
    const recorder = recorderRef.current;
    recorderRef.current = null;
    flushRef.current = null;
    clearGrace();
    finish();

    // Запись выбрасываем молча: разбор отменённой фразы — это отправка того, что человек
    // передумал говорить.
    recorder?.stop().catch(() => undefined);
    if (!engine) voiceRef.current = null;
  }, [clearGrace, finish]);

  // Хоткей «держи и говори»: Ctrl+Space. Печатающему человеку он не мешает.
  useEffect(() => {
    if (!hotkey) return;

    const isChord = (event: KeyboardEvent) =>
      event.code === "Space" && (event.ctrlKey || event.metaKey) && !event.altKey;

    // Esc — «нет, не то»: выбрасываем запись, ничего не разбирая и не ругаясь.
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (!activeRef.current) return;
      event.preventDefault();
      cancel();
    };

    const down = (event: KeyboardEvent) => {
      if (!isChord(event) || typing(event.target)) return;
      event.preventDefault();
      if (event.repeat) return;
      start();
    };

    const up = (event: KeyboardEvent) => {
      if (!isChord(event)) return;
      event.preventDefault();
      stop();
    };

    window.addEventListener("keydown", down);
    window.addEventListener("keydown", escape);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keydown", escape);
      window.removeEventListener("keyup", up);
    };
  }, [cancel, hotkey, start, stop]);

  // Ушли с экрана во время разговора — микрофон не остаётся включённым.
  useEffect(
    () => () => {
      clearGrace();
      activeRef.current = false;
      alwaysStop.current?.();
      voiceRef.current?.stop();
      recorderRef.current?.stop().catch(() => {});
    },
    [clearGrace],
  );

  // Режим выключили, а микрофон ещё открыт — закрываем, не дожидаясь следующей фразы.
  useEffect(() => {
    if (!always) {
      alwaysStop.current?.();
    }
  }, [always]);

  // В локальном режиме нужен микрофон, а не системное распознавание: это разные вещи.
  const supported = local ? microphoneAvailable() : speechSupported();

  // Режим «слушаю всегда» возможен только со своим движком: без него фразу не вырезать,
  // а системное распознавание однократное.
  const alwaysSupported = local !== null && microphoneAvailable();

  return { listening, supported, speaking, alwaysSupported, start, stop, cancel };
}
