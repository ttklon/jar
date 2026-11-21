/**
 * Потоковый разбор ответа модели — то, что делает первый звук ранним.
 *
 * Зачем: движок отдаёт ответ по кускам (SSE), но мы ждали его целиком —
 * `stream: false` в ядре. Пока модель пишет абзац, человек не слышит ничего, и
 * приложение выглядит зависшим. Первое предложение приходит за доли секунды,
 * и его уже можно произнести.
 *
 * Здесь только разбор. Сеть не трогаем: правило «что считается предложением»
 * должно быть проверяемым без сервера. Три решения, каждое легко сделать неверно:
 *
 *  * **кусок может разрезать слово.** Модель отдаёт токены, а не готовые фразы:
 *    «готово» вполне может прийти как `го` и `тово`. Поэтому буфер — это строка,
 *    и режем только по знаку, который реально пришёл;
 *  * **`[DONE]` — это конец, а не текст.** Служебная строка протокола не должна
 *    попасть в речь;
 *  * **битая строка не убивает весь ответ.** Один непонятный кусок — не повод
 *    потерять то, что уже сказано; но и молча глотать всё нельзя: причина
 *    собирается и возвращается вместе с текстом.
 */

/** Сигнал конца потока в протоколе OpenAI-совместимых серверов. */
export const DONE = "[DONE]";

/** Что вытащить из одной строки SSE. `null` — служебная или пустая строка. */
export function deltaOf(line: string): string | null {
  const trimmed = line.trim();
  if (trimmed.length === 0) return null;
  if (!trimmed.startsWith("data:")) return null;
  const payload = trimmed.slice("data:".length).trim();
  if (payload === DONE) return null;
  try {
    const parsed = JSON.parse(payload) as {
      choices?: { delta?: { content?: string } }[];
    };
    const delta = parsed.choices?.[0]?.delta?.content;
    return typeof delta === "string" && delta.length > 0 ? delta : null;
  } catch {
    return null;
  }
}

/**
 * Накопитель: кормим кусками, получаем готовые фразы.
 *
 * Фраза кончается на `.`, `!`, `?` и на многоточии — то есть там, где человек
 * делает паузу. Запятая не годится: «папку, пожалуйста» — это ещё не конец
 * мысли, и произносить это отдельным куском значит рвать речь.
 */
export function createSentenceBuffer(): {
  push: (chunk: string) => string[];
  flush: () => string;
} {
  let buffer = "";
  const boundary = /[.!?…]+(?=\s|$)/;

  return {
    push(chunk: string): string[] {
      buffer += chunk;
      const ready: string[] = [];
      for (;;) {
        const match = boundary.exec(buffer);
        if (!match || match.index === undefined) break;
        const end = match.index + match[0].length;
        const sentence = buffer.slice(0, end).trim();
        buffer = buffer.slice(end);
        if (sentence.length > 0) ready.push(sentence);
      }
      return ready;
    },
    flush(): string {
      const rest = buffer.trim();
      buffer = "";
      return rest;
    },
  };
}

/** Собрать весь текст из потока строк — для тестов и для мест, где поток не нужен. */
export function joinStream(lines: readonly string[]): string {
  const buffer = createSentenceBuffer();
  const parts: string[] = [];
  for (const line of lines) {
    const delta = deltaOf(line);
    if (delta === null) continue;
    parts.push(...buffer.push(delta));
  }
  const tail = buffer.flush();
  if (tail.length > 0) parts.push(tail);
  return parts.join(" ");
}
