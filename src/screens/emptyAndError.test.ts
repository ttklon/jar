import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Тест-хранитель: экран, который сам читает данные, обязан показать и пустоту, и
 * ошибку (шаг 250).
 *
 * Как это ловится и почему именно так. Экранов семнадцать, и писать семнадцать
 * тестов «а есть ли пустое состояние» бессмысленно: проверялось бы одно и то же
 * правило. Здесь оно проверяется по исходникам — и его **нельзя обойти
 * случайно**: новый экран попадает под правило сам, без правки теста. Именно этого
 * шаблон и требует: «шаблон, который нельзя обойти».
 *
 * Правило узкое нарочно:
 *
 *  * экран, который **получает данные готовыми** (`Catalog`, `Overview`), не
 *    обязан показывать пустоту: их пустое состояние — дело того, кто данные
 *    достал. Требовать от них «ничего не найдено» значило бы врать о том, что
 *    данные не пришли;
 *  * экран, который **читает сам** (`await`, `useEffect`, `catch`), обязан
 *    ответить и на «пусто», и на «не прочиталось»: между «нет данных» и «нет
 *    связи» есть разница, и молчание склеивает их в одно;
 *  * **обёртки** (`StateRoute`, `DataPlaces`, `SelfCheck`, `Undo`) исключены:
 *    заголовок и состояния рисует экран, который они оборачивают, и второй
 *    «ничего не найдено» был бы вторым на том же экране.
 *
 * Пустота и ошибка ищутся **словами и разметкой**, а не по имени переменной:
 * `role="alert"`, `ErrorLine`, `emptyLine`, `styles.empty` и русские обороты
 * «ничего не», «не удалось», «не получилось». Проверка на словах, потому что
 * экраны пишут по-разному, а смысл один.
 */

const SCREENS = join(__dirname, "..", "screens");

function screenFiles(): string[] {
  return readdirSync(SCREENS)
    .filter((name) => name.endsWith(".tsx") && !name.includes(".test."))
    .map((name) => join(SCREENS, name));
}

/**
 * Пустота — своим словом или общей строкой.
 *
 * `length === 0` тоже считается: экран, который **проверяет** пустоту и выводит
 * строку из словаря (`Hands`: «привнесённых рук нет»), её показывает — просто
 * слова лежат не в файле экрана, а в словаре, и это правильно.
 */
const EMPTY = [/ничего не/i, /не нашлось/i, /пусто/i, /empty/i, /length === 0/];

/** Ошибка — своим словом или общей строкой. */
const ERROR = [/не удалось/i, /не получилось/i, /ошибк/i, /role="alert"/, /ErrorLine/, /error/i];

const EMBEDDED = new Set(["StateRoute.tsx", "DataPlaces.tsx", "SelfCheck.tsx", "Undo.tsx"]);

/**
 * Экраны без списков: у них не бывает «пусто».
 *
 * `Settings` — форма: настройки есть всегда, и «настроек нет» было бы ложью.
 * Требовать пустоту от формы значит требовать её ради правила, а не ради человека.
 */
const NO_LIST = new Set(["Settings.tsx"]);

/** Экран читает данные сам — значит отвечает и за пустоту, и за ошибку. */
function readsItself(source: string): boolean {
  return /\bawait\b/.test(source) || /\buseEffect\s*\(/.test(source) || /\bcatch\s*\(/.test(source);
}

describe("пустое состояние и ошибка — у каждого, кто читает сам", () => {
  it("экран, читающий данные, показывает и пустоту, и ошибку", () => {
    const missing: string[] = [];
    for (const file of screenFiles()) {
      const name = file.split("/").pop() ?? "";
      if (EMBEDDED.has(name) || NO_LIST.has(name)) continue;
      const source = readFileSync(file, "utf8");
      if (!readsItself(source)) continue;
      const hasEmpty = EMPTY.some((pattern) => pattern.test(source));
      const hasError = ERROR.some((pattern) => pattern.test(source));
      if (!hasEmpty) missing.push(`${name}: нет пустого состояния`);
      if (!hasError) missing.push(`${name}: нет состояния ошибки`);
    }
    // Пустой список — у каждого читающего экрана есть ответ на оба вопроса.
    expect(missing).toEqual([]);
  });

  it("удобный случай: экран, получающий данные готовыми, правилом не задет", () => {
    // Иначе правило пришлось бы нарушать или ослаблять: `Catalog` не читает —
    // он рисует то, что дали, и «ничего не найдено» у него про **поиск**, а не
    // про загрузку.
    const catalog = readFileSync(join(SCREENS, "Catalog.tsx"), "utf8");
    expect(readsItself(catalog)).toBe(false);
  });

  it("обёртки исключены по имени, а не «как получится»", () => {
    // `StateRoute` читает сам, но рисует `State`, и второй «ничего не найдено»
    // был бы вторым на том же экране. Исключение названо списком, а не забыто.
    const route = readFileSync(join(SCREENS, "StateRoute.tsx"), "utf8");
    expect(readsItself(route)).toBe(true);
    expect(EMBEDDED.has("StateRoute.tsx")).toBe(true);
  });
});
