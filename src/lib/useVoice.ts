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
 * * хоткей не срабатывает, когда человек печатает в поле: пробел должен оставаться
 *   пробелом.
 */

import { useCallback, useEffect, useRef, useState } from "react";
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
}

export interface VoiceControl {
  listening: boolean;
  supported: boolean;
  start(): void;
  stop(): void;
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
  } = options;
  const [listening, setListening] = useState(false);

  const voiceRef = useRef<Voice | null>(null);
  const graceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heardRef = useRef(false);
  const activeRef = useRef(false);

  // Колбэки живут в ссылке: иначе каждое изменение пропсов пересоздавало бы слушание.
  const callbacks = useRef({ onText, onError, nothingHeard });
  callbacks.current = { onText, onError, nothingHeard };

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

  const start = useCallback(() => {
    if (activeRef.current) return;

    stopSpeaking();
    heardRef.current = false;
    activeRef.current = true;
    setListening(true);

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
  }, [finish]);

  const stop = useCallback(() => {
    if (!activeRef.current) return;

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

  // Хоткей «держи и говори»: Ctrl+Space. Печатающему человеку он не мешает.
  useEffect(() => {
    if (!hotkey) return;

    const isChord = (event: KeyboardEvent) =>
      event.code === "Space" && (event.ctrlKey || event.metaKey) && !event.altKey;

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
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [hotkey, start, stop]);

  // Ушли с экрана во время разговора — микрофон не остаётся включённым.
  useEffect(
    () => () => {
      clearGrace();
      activeRef.current = false;
      voiceRef.current?.stop();
    },
    [clearGrace],
  );

  return { listening, supported: speechSupported(), start, stop };
}
