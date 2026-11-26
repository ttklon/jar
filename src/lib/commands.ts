/**
 * Командная палитра: найти любой экран по первым буквам.
 *
 * Сейчас человек ищет экран глазами в списке из десяти пунктов. На десяти это
 * терпимо; но палитра — это ещё и путь к действию без мыши, и без неё клавиатурный
 * сценарий проходит только до навигации.
 *
 * Правило поиска намеренно простое и проверяемое: подстрока без учёта регистра и
 * ё/е. Оно угадывает ровно то, что человек ожидает от «первых букв», и не делает
 * вид, что понимает слова. Никакого ранжирования по «умной релевантности» здесь
 * нет: с восемью пунктами оно только мешает предсказуемости.
 */

export type Command = {
  /** Куда ведёт: имя экрана. */
  id: string;
  /** Что человек видит в списке. */
  label: string;
  /** По каким ещё словам его стоит найти (синонимы, английские имена). */
  keywords?: readonly string[];
};

/** Приведение, которое человек ожидает от русской раскладки: «ё» и «е» — одно. */
export function fold(text: string): string {
  return text.toLocaleLowerCase("ru").replace(/ё/g, "е").trim();
}

/**
 * Отфильтровать команды по запросу.
 *
 * Пустой запрос возвращает всё: палитра открывается как оглавление, а не как
 * пустое поле. Совпадение ищется в подписи и в ключевых словах.
 */
export function filterCommands(commands: readonly Command[], query: string): Command[] {
  const needle = fold(query);
  if (needle.length === 0) return [...commands];

  // Точное вхождение идёт первым, а «почти совпало» — после. Зачем: человек,
  // который набрал «журнал», должен получить «Журнал» первой строкой, а не
  // третьей после «Журнал событий» и «Лицензии» (в «лицензиях» есть «ценз»).
  const exact: Command[] = [];
  const loose: Command[] = [];

  for (const command of commands) {
    const haystack = [command.label, ...(command.keywords ?? [])].map(fold);
    if (haystack.some((text) => text.includes(needle))) {
      exact.push(command);
      continue;
    }
    // Опечатка в одну букву — обычное дело на бегу: «журнал» → «журнла».
    if (haystack.some((text) => closeEnough(text, needle))) loose.push(command);
  }

  return [...exact, ...loose];
}

/**
 * Опечатка в одну букву: пропуск, лишняя или переставленная.
 *
 * Расстояние Левенштейна ≤ 1 от **начала** строки: «журнла» близко к «журнал», но
 * «лицензиях» не «почти журнал». Считаем от префикса той же длины, чтобы не
 * тянуть всю строку.
 */
export function closeEnough(text: string, needle: string): boolean {
  if (needle.length < 4) return false; // на трёх буквах «близко» — это всё подряд
  const head = text.slice(0, needle.length + 1);
  return distance(head, needle) <= 1 || distance(text.slice(0, needle.length), needle.slice(0, -1)) <= 1;
}

function distance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  let prev = Array.from({ length: cols }, (_, j) => j);

  for (let i = 1; i < rows; i += 1) {
    const cur = [i];
    for (let j = 1; j < cols; j += 1) {
      cur[j] = Math.min(
        (prev[j] ?? 0) + 1,
        (cur[j - 1] ?? 0) + 1,
        (prev[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }

  return prev[cols - 1] ?? 0;
}
