/**
 * «Зажал в любой программе — говори».
 *
 * Голосовой экран умеет слушать, пока открыто окно. Но человек смотрит видео в браузере или
 * пишет в другом приложении, и переключаться на помощника — ровно то, чего он не хотел.
 * Поэтому удержание приходит из системы: ядро ловит `Ctrl+Space` глобально и присылает два
 * события — нажал и отпустил.
 *
 * В браузере этого нет и быть не может: там нет глобальных клавиш. Поэтому функция честно
 * возвращает пустую отписку, а не тихо ломается.
 */

import { isTauri } from "../ipc";

/** Имя события: одно и то же в `hotkey.rs` и здесь. */
export const GLOBAL_TALK_EVENT = "voice://hold";

export interface GlobalTalk {
  /** Нажали — начинаем слушать. */
  down(): void;
  /** Отпустили — заканчиваем. */
  up(): void;
  /** Команда «Остановить микрофон» из системного трея. */
  stop?(): void;
}

/**
 * Подписывается на удержание из любой программы. Возвращает функцию отписки; в браузере
 * отписка пустая, и это не ошибка.
 */
export async function subscribeGlobalTalk(talk: GlobalTalk): Promise<() => void> {
  if (!isTauri()) {
    return () => {};
  }

  const { listen } = await import("@tauri-apps/api/event");
  const unlistenHold = await listen<string>(GLOBAL_TALK_EVENT, (event) => {
    // Молча игнорируем всё, чего не понимаем: событие приходит из ядра, но лишнее
    // значение не должно ронять экран.
    if (event.payload === "down") talk.down();
    if (event.payload === "up") talk.up();
  });
  let unlistenStop: (() => void) | null = null;
  try {
    unlistenStop = await listen("voice://stop", () => talk.stop?.());
  } catch (error) {
    unlistenHold();
    throw error;
  }

  return () => {
    unlistenHold();
    unlistenStop?.();
  };
}
