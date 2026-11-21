/**
 * Очередь произнесения: следующая фраза ждёт, пока договорит предыдущая.
 *
 * Зачем очередь: `speak()` в `voice.ts` начинает с отмены предыдущей реплики. Для
 * новой реплики это правильно, а для нескольких фраз подряд — разрушительно:
 * останется только последняя. Очередь делает «сказать две вещи» двумя вещами.
 *
 * Три решения, которые легко сделать неверно:
 *
 *  * **пустая фраза не занимает очередь.** Иначе «договорил» было бы событием
 *    ни о чём;
 *  * **перебивание забывает всё несказанное.** После «стоп» договаривать
 *    остальное — невежливо;
 *  * **флаг «говорю» ставится ДО запуска синтеза.** Синтез может сообщить
 *    «договорил» синхронно, и тогда очередь обязана уже знать, что говорит.
 *    Это не теория: без такого порядка второй кусок молча пропадал, и поймал это
 *    тест, а не глаза.
 */

/** Как произнести одну фразу. `false` — синтеза речи в окружении нет. */
export type Say = (text: string) => boolean;

export interface SpeechQueue {
  push: (text: string) => void;
  done: () => void;
  clear: () => void;
  pending: () => number;
}

export function createSpeechQueue(
  say: Say,
  onProblem: (why: "no-voice") => void = () => {},
): SpeechQueue {
  let queue: string[] = [];
  let speaking = false;
  let told = false;

  const next = () => {
    while (queue.length > 0) {
      // Фразы приходят с ведущим пробелом как разделителем. Пробел — не часть
      // речи, и в синтез он попадать не должен.
      const text = (queue.shift() as string).trim();
      if (text.length === 0) continue;

      speaking = true;
      if (say(text)) return;

      speaking = false;
      // Синтеза нет: «договорить» нечем. Не копим очередь и называем причину
      // один раз за ответ — десять одинаковых сообщений это шум.
      if (!told) onProblem("no-voice");
      told = true;
      queue = [];
      return;
    }
    speaking = false;
  };

  return {
    push(text: string): void {
      if (text.trim().length === 0) return;
      queue.push(text);
      if (!speaking) next();
    },
    done(): void {
      speaking = false;
      next();
    },
    clear(): void {
      queue = [];
      speaking = false;
    },
    pending(): number {
      return queue.length;
    },
  };
}
