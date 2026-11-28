import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Заголовок экрана — один и тот же уровень везде (шаг 181, найдено при 192).
 *
 * Как это нашлось. Тест шага 192 кликнул «Скачать модель» и стал искать
 * `heading level 1` — а «Настройки» тот же поиск нашёл бы уровнем ниже. Стал
 * смотреть: «Голос» и «Модели» объявляют заголовок как `h1`, «Настройки»,
 * «История», «Руки» — как `h2`. Для зрячего разница незаметна, размер задан
 * отдельно; для диктора и оглавления это **разная структура документа**: на
 * одном экране главный заголовок есть, на другом его нет, и «перейти к
 * заголовку» на половине экранов приводит к подзаголовку раздела.
 *
 * Почему проверка по исходникам, а не тестом на каждый экран. Экранов
 * четырнадцать, и четырнадцать тестов на «какой тут уровень» проверяли бы одно и
 * то же. Здесь важно правило: **главный заголовок экрана — ровно один и `h1`**,
 * а `h2` — разделы внутри. Нарушение видно по тексту файла, и его нельзя
 * случайно обойти.
 *
 * `Voice` — отдельный случай: его `h1` — то, что человек сказал, а не название
 * экрана. Это осознанно, и сторож это допускает: важно, что `h1` **есть**.
 */
const SCREENS = join(__dirname, "..", "screens");

function screenFiles(): string[] {
  return readdirSync(SCREENS)
    .filter((name) => name.endsWith(".tsx") && !name.includes(".test."))
    .map((name) => join(SCREENS, name));
}

describe("заголовки экранов", () => {
  it("у каждого экрана главный заголовок первого уровня", () => {
    // Экраны, которые не самостоятельные: рисуются внутри другого экрана.
    // `StateRoute.tsx` — обёртка: спрашивает данные и рисует `State.tsx`, у которого
    // заголовок есть. Заголовок в обёртке был бы вторым на том же экране.
    // `ScreenSnapshots.tsx` — карточка внутри «Покрытия» (шаг 85): заголовок
    // `h3` при `h1` экрана. Заголовок в карточке был бы вторым на том же экране.
    const embedded = new Set([
      "DataPlaces.tsx",
      "SelfCheck.tsx",
      "ScreenSnapshots.tsx",
      "Undo.tsx",
      "StateRoute.tsx",
    ]);
    const missing: string[] = [];
    for (const file of screenFiles()) {
      const name = file.split("/").pop() ?? "";
      if (embedded.has(name)) continue;
      const source = readFileSync(file, "utf8");
      if (!source.includes('as="h1"')) missing.push(name);
    }
    // Пустой список — значит на каждом самостоятельном экране есть заголовок
    // первого уровня, и «перейти к заголовку» работает одинаково.
    expect(missing).toEqual([]);
  });

  it("уровни заголовка не разъезжаются по экранам", () => {
    // Собственно дефект: «Голос» и «Модели» были `h1`, «Настройки» и «История» —
    // `h2`. Считаем по файлам: если экран объявляет и `h1`, и `h2` — это
    // заголовок плюс разделы, и так должно быть везде, где разделы есть.
    const levels = new Map<string, { h1: number; h2: number }>();
    for (const file of screenFiles()) {
      const source = readFileSync(file, "utf8");
      levels.set(file.split("/").pop() ?? "", {
        h1: source.split('as="h1"').length - 1,
        h2: source.split('as="h2"').length - 1,
      });
    }
    // Ровно один `h1` на самостоятельном экране: два главных заголовка — та же
    // поломка структуры, только с другой стороны.
    // `StateRoute.tsx` — обёртка: спрашивает данные и рисует `State.tsx`, у которого
    // заголовок есть. Заголовок в обёртке был бы вторым на том же экране.
    const embedded = new Set(["DataPlaces.tsx", "SelfCheck.tsx", "Undo.tsx", "StateRoute.tsx"]);
    const doubled = [...levels.entries()]
      .filter(([name, count]) => !embedded.has(name) && count.h1 > 1)
      .map(([name]) => name);
    expect(doubled).toEqual([]);
  });
});
