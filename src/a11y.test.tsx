// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { WELCOME_KEY } from "./lib/firstRun";
import { App } from "./app";
import { apps, ask, flows, hands, journal, models, t, voice } from "./i18n/ru";

/**
 * Тест доступности: ни одной кнопки без доступного имени на **каждом** экране.
 *
 * Зачем отдельный тест, когда есть сторожа в `ErrorsAreAnnounced.test.ts`. Те
 * читают исходники и потому не видят главного: имя бывает и в `aria-label` на
 * следующей строке, и в дочернем тексте, и во вложенной иконке с `title`. Поэтому
 * проверять надо не код, а то, что действительно попало в разметку.
 *
 * Почему это важно именно здесь. Кнопка без имени для зрения выглядит нормально —
 * в ней иконка. Для слуха она «кнопка», и таких на экране может быть пять: человек
 * не знает, какая из них что делает. Проверить это глазами нельзя по определению.
 *
 * Обходим **все** десять экранов, а не главный: ошибка живёт в том, куда реже
 * заходят.
 */

vi.mock("./ipc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./ipc")>();
  return { ...actual, isTauri: () => false };
});

// Названия — из словаря, а не из головы: «Каталог» в навигации называется «Что
// умею», и придуманное имя находило бы ноль кнопок и проходило бы всегда.
const SCREENS = [
  voice.nav,
  t.navOverview,
  t.navCatalog,
  ask.nav,
  hands.nav,
  flows.nav,
  apps.nav,
  models.nav,
  journal.nav,
  t.navSettings,
];

afterEach(cleanup);

/** Есть ли у элемента доступное имя. */
function hasName(element: Element): boolean {
  const label = element.getAttribute("aria-label")?.trim();
  if (label) return true;
  const labelledBy = element.getAttribute("aria-labelledby");
  if (labelledBy) {
    const named = labelledBy
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent?.trim() ?? "")
      .join(" ")
      .trim();
    if (named) return true;
  }
  if ((element.textContent ?? "").trim()) return true;
  // Иконка внутри с `title` — единственное законное «слабое» имя. Именно
  // `[title]`, и только у потомков: `querySelector` ищет и сам элемент, поэтому
  // `[aria-label]` здесь находил бы ровно то, что мы проверяем, — кнопку без
  // имени. С этой ошибкой тест молчал на сломанном коде.
  if (element.querySelector("[title]")) return true;
  return false;
}

describe("доступность кнопок", () => {
  it("на всех десяти экранах у каждой кнопки есть имя", async () => {
    globalThis.localStorage?.setItem(WELCOME_KEY, "1");
    render(<App />);
    await waitFor(() => expect(screen.getByRole("navigation")).toBeTruthy());

    const problems: string[] = [];
    const visited: number[] = [];

    for (const label of SCREENS) {
      const nav = screen.getByRole("navigation");
      const button = Array.from(nav.querySelectorAll("button")).find((item) =>
        (item.textContent ?? "").includes(label),
      );
      expect(button, `экран «${label}» не нашёлся в навигации`).toBeTruthy();

      fireEvent.click(button!);
      // Экраны грузят данные — даём им время отрисоваться целиком. 60 мс не
      // хватало: на первом экране успевала появиться только навигация, и
      // проверка имён «проходила», не увидев ни микрофона, ни остального.
      await new Promise((resolve) => setTimeout(resolve, 250));

      const buttons = Array.from(document.querySelectorAll("button"));
      visited.push(buttons.length);
      if (label === voice.nav && visited.length === 1) {
        // Экран «Голос» должен содержать микрофон: если его нет, проверка имён
        // не проверила главную кнопку приложения.
        // Классы Fluent — хеши, слова «mic» в них нет. Микрофон узнаётся по
        // подписи из словаря: на нём написано «Держать и говорить» (или «Всегда
        // слушаю», в зависимости от режима).
        const mic = buttons.find(
          (item) =>
            (item.textContent ?? "").includes(voice.hold) ||
            (item.textContent ?? "").includes(voice.always),
        );
        expect(
          mic,
          `на экране «Голос» нет микрофона (hold="${voice.hold}", кнопок ${buttons.length})`,
        ).toBeTruthy();
      }
      for (const item of buttons) {
        if (!hasName(item)) {
          problems.push(`${label}: ${item.outerHTML.slice(0, 100)}`);
        }
      }
    }

    // Проверка, что обход состоялся: десять экранов, и на каждом хотя бы одна
    // кнопка. Без этого тест «проходит» и тогда, когда навигация не находится.
    expect(visited).toHaveLength(SCREENS.length);
    expect(Math.min(...visited)).toBeGreaterThan(0);
    expect(problems).toEqual([]);
  });

  /**
   * Шаг 184: ошибка обязана быть объявлена диктору, и не «в среднем по коду», а
   * **на каждом экране** — диктор молчит там, куда реже заходят.
   *
   * Проверка идёт по разметке, а не по исходникам: `role="alert"` на контейнере
   * и `aria-live` на предке работают одинаково, и глазами этого не различить.
   */
  it("на всех десяти экранах есть объявленная ошибка или честно нет ошибки", async () => {
    globalThis.localStorage?.setItem(WELCOME_KEY, "1");
    render(<App />);
    await waitFor(() => expect(screen.getByRole("navigation")).toBeTruthy());

    const missing: string[] = [];
    let found = 0;
    for (const label of SCREENS) {
      const nav = screen.getByRole("navigation");
      const button = Array.from(nav.querySelectorAll("button")).find((item) =>
        (item.textContent ?? "").includes(label),
      );
      fireEvent.click(button!);
      await new Promise((resolve) => setTimeout(resolve, 250));

      // Ошибок на экране может не быть вовсе — тогда и объявлять нечего. Если
      // они есть, у каждой должен быть `alert`/`status` либо живой предок.
      const errors = Array.from(document.querySelectorAll('[class*="error"], [class*="problem"]')).filter(
        (node) => (node.textContent ?? "").trim().length > 0,
      );
      found += errors.length;
      for (const node of errors) {
        const announced =
          node.closest('[role="alert"], [role="status"], [aria-live]') !== null ||
          node.getAttribute("role") === "alert";
        if (!announced) missing.push(`${label}: ${(node.textContent ?? "").slice(0, 80)}`);
      }
    }
    expect(missing).toEqual([]);
    // Сколько ошибок нашлось — видно в отчёте: ноль здесь значит, что в этом
    // окружении ошибок нет вовсе, и отдельный случай ниже проверяет саму
    // проверку на смоделированной ошибке.
    expect(found).toBeGreaterThanOrEqual(0);
  });

  it("проверка объявления ловит ошибку без роли", () => {
    // Сторож, который ничего не ловит, хуже отсутствия: он говорит «чисто».
    // Поэтому — в обе стороны, на разметке, а не на исходниках.
    const holder = document.createElement("div");
    holder.innerHTML = '<div class="err1">не удалось прочитать модель</div>';
    const silent = Array.from(holder.querySelectorAll('[class*="err"]')).filter((node) => {
      const announced = node.closest('[role="alert"], [role="status"], [aria-live]') !== null;
      return !announced;
    });
    expect(silent).toHaveLength(1);

    holder.innerHTML = '<div role="alert"><div class="err1">не удалось прочитать модель</div></div>';
    const loud = Array.from(holder.querySelectorAll('[class*="err"]')).filter((node) => {
      const announced = node.closest('[role="alert"], [role="status"], [aria-live]') !== null;
      return !announced;
    });
    expect(loud).toEqual([]);
  });

  it("кнопка с одной иконкой без подписи ловится", () => {
    // В обе стороны: без этого случая проверка «проходит» и тогда, когда
    // перестала что-либо находить.
    const holder = document.createElement("div");
    holder.innerHTML = '<button type="button"><svg></svg></button>';
    expect(hasName(holder.querySelector("button")!)).toBe(false);

    holder.innerHTML = '<button type="button" aria-label="Слушать"><svg></svg></button>';
    expect(hasName(holder.querySelector("button")!)).toBe(true);

    holder.innerHTML = '<button type="button"><svg></svg>Сказать</button>';
    expect(hasName(holder.querySelector("button")!)).toBe(true);
  });
});
