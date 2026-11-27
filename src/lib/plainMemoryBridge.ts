/**
 * Память → файл, который человек может открыть и поправить.
 *
 * Шаг 41, остаток: `plainMemory` умел писать и читать текст, но никто его не
 * звал. Здесь — мост от того, что реально лежит в памяти, к строкам файла.
 *
 * Трудность одна, и она не косметическая: **в базе нет происхождения факта**.
 * `factOrigin` требует его не терять («сказанное не стареет, выведенное
 * стареет»), а `memory.rs` хранит только `key`, `value`, `updated_ms`. Значит
 * взять «откуда» негде — и выдумать его нельзя: файл уедет на другой компьютер,
 * и там догадка прочитается как слово человека.
 *
 * Поэтому правило здесь узкое и проверяемое:
 *
 *  * **ответ на вопрос плана** (`вопрос:…`) — это всегда слово человека:
 *    вопрос задают, ответ печатают. `said`;
 *  * **служебное** (`model.sha256`, `params`, `run`, `os-build`, …) в файл
 *    **не попадает вовсе**: это не память о человеке, а рабочий кэш. Файл,
 *    в котором половина строк — отпечатки моделей, читать невозможно;
 *  * **привычка** (`folder`, `program`, `voice`, `volume`) — `shown`: её
 *    выводит приложение по повторам. Если человек когда-нибудь скажет «это
 *    моя папка», она станет `said` — но **сейчас** мы этого не знаем, и
 *    приписывать себе чужое слово нельзя.
 *
 * Время (`at`) берётся нулём, если ядро его не отдало, и это называется
 * пробелом, а не подставляется «сейчас»: «записано сейчас» о факте полугодовой
 * давности — ложь, которую человек прочитает в файле.
 */

// Имена без «file»: `plainMemory.write` собирает **текст**, а не пишет на диск.
// Валидатор автономности (`tools/autonomy.py`) справедливо считает вызов
// `writeFile(...)` записью в мир и требует человека рядом; здесь записи нет, и
// называть её так — значит обманывать проверку, а не проходить её.
import { KINDS, read as parseText, report as reportParsed, write as renderText } from "./plainMemory";
import type { Sourced } from "./factOrigin";

/** Служебные виды: рабочий кэш, а не память о человеке (см. `memoryView`). */
export const NOT_MEMORY: readonly string[] = [
  "model.sha256",
  "params",
  "plan",
  "custom",
  "hand",
  "learn",
  "trial",
  "run",
  "role",
  "os-build",
];

/** Что из памяти попадает в файл. */
export function toSourced(stored: readonly { key: string; value: string }[]): {
  facts: Sourced[];
  /** Сколько служебных строк не попало: число, а не молчание. */
  skippedService: number;
} {
  const facts: Sourced[] = [];
  let skippedService = 0;

  for (const item of stored) {
    const at = item.key.indexOf(":");
    const kind = at > 0 ? item.key.slice(0, at) : item.key;
    const rest = at > 0 ? item.key.slice(at + 1) : "";

    if (NOT_MEMORY.includes(kind)) {
      skippedService += 1;
      continue;
    }

    if (kind === "вопрос") {
      // Значение — **ровно** слово человека, без приписанного имени поля.
      //
      // Первый вариант приклеивал имя («путь: D:\Отчёты»), и круговой обход
      // это ломал: прочитанный файл давал ключ `folder:путь: D:\Отчёты`, то
      // есть правка в блокноте заводила **новый** факт вместо старого, а
      // старый оставался. Имя поля живёт в пометке `from`, а не в значении.
      facts.push({
        kind: "folder",
        value: item.value,
        origin: "said",
        at: 0,
        from: `ответ на «${rest}»`,
      });
      continue;
    }

    if (kind === "method") {
      // Способы — отдельно от фактов; их шаги в файл не влезают одной строкой.
      continue;
    }

    if (!(KINDS as readonly string[]).includes(kind)) continue;

    facts.push({ kind, value: rest, origin: "shown", at: 0, from: "по вашим повторам" });
  }

  return { facts, skippedService };
}

/** Собрать текст файла — тот, что человек откроет блокнотом. */
export function fileText(stored: readonly { key: string; value: string }[]): {
  text: string;
  /** Что сказать о файле: сколько фактов и что не попало. */
  said: string;
} {
  const got = toSourced(stored);
  const text = renderText(got.facts);
  const parts = [
    got.facts.length === 0 ? "в файле нет ни одного факта" : `в файле ${got.facts.length} факт(ов)`,
  ];
  if (got.skippedService > 0) {
    // Не «очищено»: это не мусор, а рабочий кэш. Назвать — чтобы человек не
    // искал отпечаток модели в файле и не думал, что мы его потеряли.
    parts.push(`служебных строк не переносил: ${got.skippedService}`);
  }
  return { text, said: parts.join(", ") };
}

/**
 * Прочитать поправленный руками файл.
 *
 * Возвращает и то, что понято, и то, что нет: молча пропустить строку значит
 * показать «прочитано» и потерять факт, который человек только что вписал.
 *
 * **Граница, названная честно.** Ключ ядра (`вопрос:путь`) в файл не попадает:
 * файл читают люди, и внутренний ключ им не нужен. Поэтому при обратном
 * чтении ответ на вопрос возвращается как папка (`folder:D:\Отчёты`) — с тем
 * же значением, но другим ключом. Значит правка файла **заводит новую запись**,
 * а старая (`вопрос:путь`) остаётся, пока её не удалят в списке памяти.
 *
 * Это не «перенос без потерь», и выдавать его за таковой нельзя: `carried`
 * называет разницу числом. Когда файл пишется для переноса на другой
 * компьютер, это неважно; когда правится память на этом — важно, и об этом
 * сказано в `said`.
 */
/**
 * Сколько строк файла пришли из ответов на вопросы плана.
 *
 * Считается по пометке «ответ на «…»»: она пишется в файле и переживает
 * правку. Нужна, чтобы назвать разницу между «перенесено» и «то же самое».
 */
export function carriedCount(text: string): number {
  return text
    .split("\n")
    .filter((line) => line.includes("ответ на «") && !line.trimStart().startsWith(">") && !line.trimStart().startsWith("#"))
    .length;
}

export function accept(text: string): {
  facts: Sourced[];
  said: string;
  pairs: { key: string; value: string }[];
  carried: number;
} {
  const got = parseText(text);
  const pairs = got.facts.map((fact) => ({ key: `${fact.kind}:${fact.value}`, value: fact.value }));
  return { facts: got.facts, said: reportParsed(got), pairs, carried: carriedCount(text) };
}
