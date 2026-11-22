import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Списки не пересчитываются целиком на каждый рендер (шаг 392).
 *
 * Зачем сторож, а не только замер: экран «Голос» перерисовывается на каждом слове
 * разговора, а очередь и цели меняются редко. Пересчёт в разметке выглядит безобидно
 * и возвращается незаметно — а цена у него не в одном вызове, а в том, что он идёт
 * на каждый рендер: `progress` внутри `goals.map` — это проход по всей очереди на
 * каждую цель.
 *
 * Проверяем по исходнику, а не по рендеру: в jsdom обе версии дают одинаковую
 * разметку, и тест, который их не различает, ничего не сторожит.
 */
const source = readFileSync(`${process.cwd()}/src/screens/Voice.tsx`, "utf8");

/**
 * Тело `return (...)` компонента — то, что рисуется.
 *
 * Ищем не по `return (`, а по корню разметки: в файле есть ранние возвраты внутри
 * эффектов (`return () => …`), и первый попавшийся — не тот.
 */
function renderBody(text: string): string {
  const start = text.indexOf("    <div className={styles.root}>");
  return start === -1 ? "" : text.slice(start);
}

describe("перерисовки списков", () => {
  it("счётчики целей считаются до разметки, а не в ней", () => {
    const body = renderBody(source);

    // В разметке — только чтение готового: `progress(...)` там означал бы
    // пересчёт на каждый рендер.
    expect(body).not.toContain("progress(queue");
    expect(body).not.toContain("summary(queue)");
    // А расчёт — до разметки и под мемоизацией.
    expect(source).toContain("useMemo");
    expect(source).toContain("goalProgress");
    expect(source).toContain("queueSummary");
  });

  it("цели собираются один раз на очередь, а не на рендер", () => {
    const goals = source.slice(source.indexOf("const goals = useMemo"));
    const body = goals.slice(0, goals.indexOf("]);"));

    expect(body).toContain("[queue]");
  });

  it("сторож видит поломку: пересчёт прямо в разметке", () => {
    // Нарочитая поломка — ровно та, что была до правки.
    const broken = source.replace(
      "{voice.queueTitle(queueSummary.waiting, queueSummary.done)}",
      "{voice.queueTitle(summary(queue).waiting, summary(queue).done)}",
    );

    expect(renderBody(broken)).toContain("summary(queue)");
  });
});
