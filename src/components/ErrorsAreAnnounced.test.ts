// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Сторож: на экране не появляется ошибка, о которой диктор не узнает.
 *
 * Зачем отдельный тест, а не доверие к `role="alert"` в компонентах. Таких мест
 * было 24 — текст ошибки просто оказывался на экране, и незрячий человек о нём
 * не узнавал. Каждое новое такое место — тот же дефект, а замечают его только
 * те, кому оно мешает. Поэтому проверка идёт по исходникам: у каждой строки,
 * оформленной как ошибка (`styles.error`, `styles.problem`), должно быть либо
 * объявление диктору, либо общий `ErrorLine`.
 *
 * Что НЕ считается нарушением:
 *
 *  * `role="alert"` или `role="status"` в той же строке или в разметке, куда
 *    эта строка входит (проверяется по файлу — грубо, но в сторону «пропустить
 *    проверенное», а не «обвинить зря»);
 *  * `ErrorLine` — он объявляет сам, это и есть правильный способ;
 *  * `aria-live` на контейнере.
 *
 * Проверка намеренно грубая: она ищет показ ошибки по имени стиля. Стиль ошибки
 * меняется редко, а забытый атрибут — часто.
 */

const SRC = join(__dirname, "..");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    if (!name.endsWith(".tsx") || name.endsWith(".test.tsx")) return [];
    return [path];
  });
}

/**
 * Для каждой строки — объявлен ли она диктору через элемент вокруг неё.
 *
 * Разбор идёт **вперёд**, со стеком открытых элементов, а не поиском вверх.
 * Поиск вверх пробовали четырежды, и каждый раз он ошибался по-новому: тег
 * бывает разорван на строки, `>` встречается в `=>` и в `a > b`, а `<li …>`
 * закрывается в той же строке, где открылся. Стек решает все четыре случая
 * одинаково, потому что делает то же, что браузер: открыли — положили, закрыли
 * — сняли.
 */
function announcedLines(source: string): boolean[] {
  const lines = source.split("\n");
  const announced = new Array<boolean>(lines.length).fill(false);
  const stack: { tag: string; declares: boolean }[] = [];

  // Позиция → номер строки: для каждой строки запоминаем, объявлена ли она.
  const lineOf = (offset: number): number => {
    let line = 0;
    for (let at = 0; at < offset; at += 1) if (source[at] === "\n") line += 1;
    return line;
  };

  let cursor = 0;
  while (cursor < source.length) {
    const open = source.indexOf("<", cursor);
    if (open < 0) break;
    const head = /^<(\/?)([A-Za-z][\w.]*)/.exec(source.slice(open));
    if (!head) {
      cursor = open + 1;
      continue;
    }

    const closing = head[1] === "/";
    const tag = head[2]!;
    // Найти конец тега: `>` вне фигурных скобок, вне строк, не часть `=>`.
    let braces = 0;
    let quote: string | null = null;
    let previous = "";
    let end = -1;
    for (let at = open; at < source.length; at += 1) {
      const char = source[at]!;
      if (quote) {
        if (char === quote) quote = null;
        previous = char;
        continue;
      }
      if (char === '"' || char === "'" || char === "`") quote = char;
      else if (char === "{") braces += 1;
      else if (char === "}") braces = Math.max(0, braces - 1);
      else if (char === ">" && braces === 0 && previous !== "=") {
        end = at;
        break;
      }
      previous = char;
    }
    if (end < 0) {
      cursor = open + 1;
      continue;
    }

    const tagText = source.slice(open, end + 1);
    const selfClosing = /\/\s*>$/.test(tagText);

    if (closing) {
      stack.pop();
    } else {
      const declares = /role=|aria-live|ErrorLine/.test(tagText);
      const declaredNow = declares || stack.some((element) => element.declares);
      if (declaredNow) {
        const from = lineOf(open);
        const to = selfClosing ? from : lineOf(end);
        for (let line = from; line <= to && line < announced.length; line += 1) {
          announced[line] = true;
        }
      }
      if (!selfClosing) stack.push({ tag, declares });
    }

    cursor = end + 1;
  }

  return announced;
}

/** Строки, где текст показывается как ошибка, но диктор о нём не узнает. */
export function silentErrorLines(source: string): { line: number; text: string }[] {
  const lines = source.split("\n");
  const announced = announcedLines(source);
  const found: { line: number; text: string }[] = [];

  lines.forEach((line, index) => {
    if (!/styles\.(error|problem)\b/.test(line)) return;
    if (announced[index]) return;
    found.push({ line: index + 1, text: line.trim() });
  });

  return found;
}

/**
 * Спиннеры, о которых диктор не узнает.
 *
 * `Spinner` — картинка: он крутится и этим говорит «идёт работа». Для зрения
 * этого достаточно, для слуха — нет: диктор молчит, и человек не знает, ждать
 * ему или приложение повисло.
 *
 * Два законных случая пропускаются:
 *
 *  * **спиннер внутри кнопки** (`icon={<Spinner …/>}`). У кнопки есть текст
 *    («Запускаю…»), и он меняется вместе со спиннером — объявлять нечего;
 *  * **рядом есть `role="status"` или `aria-live`** на контейнере.
 *
 * Всё остальное — молчание.
 */
export function silentSpinners(source: string): { line: number; text: string }[] {
  const lines = source.split("\n");
  const found: { line: number; text: string }[] = [];
  const announced = announcedLines(source);

  lines.forEach((line, index) => {
    if (!/<Spinner/.test(line)) return;
    // Внутри кнопки: иконка, у которой есть подпись рядом.
    const window = lines.slice(Math.max(0, index - 3), index + 4).join(" ");
    if (/icon=\{/.test(window)) return;
    if (announced[index]) return;
    found.push({ line: index + 1, text: line.trim() });
  });

  return found;
}

/**
 * Интерактивные элементы ниже 44 px.
 *
 * Шаг 196: «крупные цели нажатия». Правило известно — 44×44 (Apple HIG, WCAG
 * 2.5.5), но проверяется оно глазами, а значит не проверяется никогда. Здесь
 * считается ожидаемая высота: вертикальные отступы плюс строка.
 *
 * Оценка честно приблизительная: шрифт бывает крупнее, и это в сторону
 * «пропустить». Проверка ищет грубые случаи — 36 px в навигации, 40 в палитре,
 * а не разницу в два пикселя.
 */
export function smallTargets(source: string): { line: number; name: string; height: number }[] {
  const found: { line: number; name: string; height: number }[] = [];
  const lines = source.split("\n");
  let current: { name: string; line: number; body: string[] } | null = null;

  const flush = () => {
    if (!current) return;
    const body = current.body.join("\n");
    if (!/cursor: "pointer"/.test(body)) {
      current = null;
      return;
    }
    const minHeight = /minHeight: "(\d+)px"/.exec(body);
    const padding = /padding: "(\d+)px (\d+)px"/.exec(body);
    if (minHeight) {
      const height = Number(minHeight[1]);
      if (height < 44) found.push({ line: current.line, name: current.name, height });
    } else if (padding) {
      // Строка текста — 20 px: токен fontSizeBase300 даёт около этого.
      const height = Number(padding[1]) * 2 + 20;
      if (height < 44) found.push({ line: current.line, name: current.name, height });
    }
    current = null;
  };

  lines.forEach((line, index) => {
    const open = /^  (\w+): \{\s*$/.exec(line);
    if (open) {
      flush();
      current = { name: open[1]!, line: index + 1, body: [] };
      return;
    }
    if (current) {
      if (/^  \},?\s*$/.test(line)) {
        flush();
      } else {
        current.body.push(line);
      }
    }
  });
  flush();

  return found;
}

/**
 * Таймеры, которые убирают ошибку с экрана.
 *
 * Шаг 195: «ошибки остаются на экране до прочтения, а не исчезают через
 * секунду». Проверить «остаются навсегда» ожиданием нельзя — тест ждёт секунды,
 * а человек читает дольше. Зато можно проверить причину: рядом со сбросом
 * ошибки нет таймера. Именно таймер и делает сообщение нечитаемым.
 *
 * Сброс по новому действию (`setError(null)` перед новой попыткой) — законен и
 * здесь не ловится: ошибка относится к прошлому запросу, а не к этому.
 */
export function errorsOnTimers(source: string): { line: number; text: string }[] {
  const lines = source.split("\n");
  const found: { line: number; text: string }[] = [];

  lines.forEach((line, index) => {
    if (!/(set\w*Error|setError)\(null\)/.test(line)) return;
    // Таймер рядом: в этой же строке или в пределах пяти строк вокруг.
    const around = lines.slice(Math.max(0, index - 5), index + 6).join("\n");
    if (/setTimeout|setInterval/.test(around)) {
      found.push({ line: index + 1, text: line.trim() });
    }
  });

  return found;
}

describe("ошибки объявляются экранному диктору", () => {
  it("ни одна ошибка на экране не появляется молча", () => {
    const offenders: string[] = [];

    for (const path of files(SRC)) {
      const source = readFileSync(path, "utf8");
      for (const hit of silentErrorLines(source)) {
        offenders.push(`${relative(SRC, path)}:${hit.line} ${hit.text}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it("ни один спиннер не крутится молча", () => {
    const offenders: string[] = [];
    for (const path of files(SRC)) {
      const source = readFileSync(path, "utf8");
      for (const hit of silentSpinners(source)) {
        offenders.push(`${relative(SRC, path)}:${hit.line} ${hit.text}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("цели нажатия не мельче 44 px", () => {
    const offenders: string[] = [];
    for (const path of files(SRC)) {
      const source = readFileSync(path, "utf8");
      for (const hit of smallTargets(source)) {
        offenders.push(`${relative(SRC, path)}: ${hit.name} ≈${hit.height}px`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("ошибка не исчезает по таймеру", () => {
    const offenders: string[] = [];
    for (const path of files(SRC)) {
      const source = readFileSync(path, "utf8");
      for (const hit of errorsOnTimers(source)) {
        offenders.push(`${relative(SRC, path)}:${hit.line} ${hit.text}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("сторож таймеров видит поломку", () => {
    const timed = [
      "    setError(message);",
      "    setTimeout(() => setError(null), 2000);",
    ].join("\n");
    expect(errorsOnTimers(timed)).toHaveLength(1);

    // Сброс перед новой попыткой — законен.
    const fine = [
      "    setError(null);",
      "    void run();",
    ].join("\n");
    expect(errorsOnTimers(fine)).toHaveLength(0);
  });

  it("сторож целей видит поломку", () => {
    const small = [
      "  navItem: {",
      '    padding: "8px 10px",',
      '    cursor: "pointer",',
      "  },",
    ].join("\n");
    expect(smallTargets(small)).toHaveLength(1);
    const fixed = [
      "  navItem: {",
      '    minHeight: "44px",',
      '    padding: "8px 10px",',
      '    cursor: "pointer",',
      "  },",
    ].join("\n");
    expect(smallTargets(fixed)).toHaveLength(0);
  });

  it("сторож спиннеров видит поломку", () => {
    // В обе стороны: иначе проверка «проходит» всегда.
    const silent = ["        <div className={styles.center}>", '          <Spinner size="tiny" />', "        </div>"].join(
      "\n",
    );
    expect(silentSpinners(silent)).toHaveLength(1);

    const declared = [
      '        <div className={styles.center} role="status" aria-live="polite">',
      '          <Spinner size="tiny" />',
      "        </div>",
    ].join("\n");
    expect(silentSpinners(declared)).toHaveLength(0);

    // Внутри кнопки — законно: текст кнопки меняется вместе со спиннером.
    const button = '          icon={busy ? <Spinner size="tiny" /> : <PlayRegular />}';
    expect(silentSpinners(button)).toHaveLength(0);
  });

  it("сторож видит поломку: строка без объявления ловится", () => {
    // Без этого случая проверка выше «проходит» и тогда, когда перестала
    // сравнивать что-либо вовсе. Обе стороны: ловит и молчит.
    const broken = '<Text className={styles.error}>{error}</Text>';
    expect(silentErrorLines(broken)).toHaveLength(1);

    const fixed = '<ErrorLine className={styles.error} text={error} />';
    expect(silentErrorLines(fixed)).toHaveLength(0);

    const declared = '<Text className={styles.error} role="alert">{error}</Text>';
    expect(silentErrorLines(declared)).toHaveLength(0);

    // Разорванный тег: `role` на следующей строке — так пишет prettier, и
    // именно так выглядел настоящий исправный код, который проверка сначала
    // считала нарушением.
    const split = [
      "            <Text",
      '              className={item.state === "held" ? styles.error : styles.note}',
      '              role={item.state === "held" ? "alert" : undefined}',
      "            >",
    ].join("\n");
    expect(silentErrorLines(split)).toHaveLength(0);

    // А тот же разорванный тег без `role` — нарушение, иначе предыдущая
    // проверка ничего не значит.
    const splitSilent = [
      "            <Text",
      '              className={item.state === "held" ? styles.error : styles.note}',
      "            >",
    ].join("\n");
    expect(silentErrorLines(splitSilent)).toHaveLength(1);

    // Контейнер с объявлением вокруг списка — правильный способ.
    const container = [
      '            <ul className={styles.problems} role="alert">',
      '              <li className={styles.problem}>проблема</li>',
      "            </ul>",
    ].join("\n");
    expect(silentErrorLines(container)).toHaveLength(0);
  });
});
