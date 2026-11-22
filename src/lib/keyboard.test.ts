import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Всё, что нажимается, нажимается и с клавиатуры (шаг 183).
 *
 * Зачем сторож, если сейчас всё хорошо. Проверено руками: кликов на `div`, `span`,
 * `li`, `tr` в проекте **ноль** — все нажимаемые места это настоящие `<button>` и
 * `Button` из Fluent. Но «сейчас ноль» — это факт, а не правило. Один `div` с
 * `onClick`, добавленный завтра, выглядит в разметке безобидно и работает мышью;
 * сломается он только для человека без мыши, а такой человек в тестах не сидит.
 *
 * Почему `<button>` достаточно. Он получает фокус по Tab, а Enter и Пробел
 * обрабатывает браузер: обработчик `click` вызывается сам. `div` не получает
 * ничего — ни фокуса, ни клавиш, — и чтобы это исправить, ему нужны `role`,
 * `tabIndex` и свой `onKeyDown`, то есть подделка того, что у кнопки уже есть.
 * Поэтому правило простое: нажимаемое — кнопка, а не украшенный `div`.
 *
 * Что не считается кнопкой и почему: `onClick` на обёртке вокруг кнопки
 * (`<div className={styles.row}>`) — это вёрстка, а не цель нажатия. Проверка
 * смотрит, есть ли `onClick` **в самом теге**, а не среди детей.
 */

const SRC = join(process.cwd(), "src");

/** Все `.tsx` без тестов: тесты рендерят кнопки руками и правилу не подчиняются. */
function sources(): string[] {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (dir.endsWith("node_modules")) continue;
      if (statSync(path).isDirectory()) {
        if (entry !== "node_modules") walk(path);
      } else if (path.endsWith(".tsx") && !path.includes(".test.")) {
        files.push(path);
      }
    }
  };
  walk(SRC);
  return files;
}

/** Теги, которые выглядят нажимаемыми, но клавиатуру не получают. */
const NOT_A_BUTTON = /<(div|span|li|tr|td|Card|Text|img|section)\b([^>]*)>/g;

/** Группы регулярного выражения — `undefined`, если строка не совпала: так их видит tsc. */
function tagOf(match: RegExpMatchArray): { tag: string; attrs: string } {
  return { tag: match[1] ?? "", attrs: match[2] ?? "" };
}

type Offender = { file: string; line: number; tag: string };

function offenders(): Offender[] {
  const bad: Offender[] = [];
  for (const file of sources()) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(NOT_A_BUTTON)) {
      const { tag, attrs } = tagOf(match);
      if (!attrs.includes("onClick")) continue;
      // `role="button"` плюс `tabIndex` плюс `onKeyDown` — это кнопка, собранная
      // руками. Пока таких нет, и правило их не разрешает: разрешить значило бы
      // признать, что подделка годится, а она не годится — она уже была
      // поводом для этого шага.
      const line = source.slice(0, match.index).split("\n").length;
      bad.push({ file: file.replace(SRC + "/", "src/"), line, tag });
    }
  }
  return bad;
}

describe("всё нажимается и с клавиатуры", () => {
  it("нет кликов на том, что не кнопка", () => {
    const found = offenders();
    // Падение здесь значит: мышью работает, Tab — нет. Названы файл и строка,
    // чтобы не искать по всему проекту.
    expect(found.map((item) => `${item.file}:${item.line} <${item.tag}>`)).toEqual([]);
  });

  it("кнопки — настоящие, а не украшенные ссылки", () => {
    // `<a onClick>` проходит фокус по Tab, но Enter на нём делает переход по
    // адресу. Здесь адресов нет вовсе, и `a` с обработчиком — та же подделка.
    for (const file of sources()) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(/<a\b([^>]*)>/g)) {
        expect(match[1] ?? "").not.toContain("onClick");
      }
    }
  });
});
