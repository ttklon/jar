import { test, expect, type Page } from "@playwright/test";
import { fits, viewportAt, whyNot, type Visible } from "../src/lib/zoom";

/**
 * Масштаб 200%: ничего не обрезается, не уезжает и не прячется (шаг 185).
 *
 * Почему здесь, а не в jsdom. jsdom не считает вёрстку вовсе: там
 * `getBoundingClientRect` — нули, и «пункт уехал за край» не видно ни при каком
 * масштабе. Настоящий ответ даёт только браузер: он правда пересчитывает
 * раскладку при 200%.
 *
 * Что имитируется. `deviceScaleFactor` не меняет раскладку (это плотность
 * пикселей), поэтому масштаб 200% воспроизводится тем же, чем он является для
 * вёрстки: **окно вдвое меньше**. 1280×720 при 200% — это 640×360 точек вёрстки,
 * ровно как узкий телефон, и именно там лента с содержимым перестаёт помещаться
 * рядом. Это честнее `page.evaluate("document.body.style.zoom=2")`, который
 * масштабирует уже посчитанное и не показывает, что сломается при настоящем
 * сужении.
 */

async function warmup(page: Page) {
  await page.goto("/e2e/entry.html");
  await page.waitForLoadState("networkidle");
}

async function loaded(page: Page) {
  await warmup(page);
  await page.goto("/e2e/entry.html");
  // Ждём появлением, а не локатором Playwright: живое приложение
  // перерисовывается, пока подтягивает готовность (см. `entry.pw.ts`, урок 190).
  await expect
    .poll(async () => page.evaluate(() => document.querySelectorAll("nav button").length), {
      message: "лента экранов не появилась",
      timeout: 20_000,
    })
    .toBeGreaterThan(0);
}

/** То же правило, что в `src/lib/zoom.ts`: причина называется словом. */
const INSPECT = () => {
  const items = Array.from(document.querySelectorAll("nav button"));
  return items.map((element) => {
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      label: (element.textContent ?? "").trim().slice(0, 40),
      left: box.left,
      right: box.right,
      top: box.top,
      bottom: box.bottom,
      width: box.width,
      height: box.height,
      hidden: style.display === "none" || style.visibility === "hidden",
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight,
      // Страница не должна ехать по горизонтали: это и есть «уехало».
      pageScrolls: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    };
  });
};

test("масштаб 200%: каждый экран в ленте виден и достижим", async ({ page }) => {
  // 200% от 1440×900 — это 720×450 точек вёрстки. Уже телефона.
  await page.setViewportSize({ width: 720, height: 450 });
  await loaded(page);

  const items = await page.evaluate(INSPECT);
  expect(items.length).toBeGreaterThan(0);

  // Проверку делает **правило** (`src/lib/zoom.ts`), а не этот файл.
  //
  // Дефект, найденный при подключении: тест заново писал ту же логику —
  // «right > 0 и left < windowWidth» — и расходился с правилом молча.
  // Правило живёт в `src/lib/zoom.ts` и покрыто своими тестами; здесь оно
  // только **применяется** к настоящим прямоугольникам из Chromium. Если
  // правило изменится, изменится и e2e: второй правды о «помещается» нет.
  const viewport = viewportAt(1, items[0]!.windowWidth, items[0]!.windowHeight);
  const broken = items
    .map((item) => {
      const seen: Visible = {
        box: { left: item.left, top: item.top, right: item.right, bottom: item.bottom, width: item.width, height: item.height },
        hidden: item.hidden,
        clipped: false,
      };
      return fits(seen, viewport) ? null : `${item.label}: ${whyNot(seen, viewport) ?? "не помещается"}`;
    })
    .filter((value): value is string => value !== null);

  expect(broken).toEqual([]);
});

test("масштаб 200%: страница не едет по горизонтали", async ({ page }) => {
  // Горизонтальная прокрутка — признак того, что что-то шире окна. При 200% это
  // самый частый способ потерять правый край: пункт есть, но за пределами.
  await page.setViewportSize({ width: 720, height: 450 });
  await loaded(page);

  const scrolls = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  expect(scrolls).toBe(false);
});

test("масштаб 200%: вход в разговор виден, не обрезан и принимает фокус", async ({ page }) => {
  // Главное действие не должно требовать 100%: человек, увеличивший текст,
  // видит поле и может в него попасть.
  await page.setViewportSize({ width: 720, height: 450 });
  await loaded(page);

  const state = await page.evaluate(() => {
    const field = document.querySelector<HTMLInputElement>(
      'input[aria-label="скажи или напиши — или назови экран"]',
    );
    if (!field) return { found: false } as const;
    field.focus();
    const box = field.getBoundingClientRect();
    const style = getComputedStyle(field);
    return {
      found: true,
      width: box.width,
      height: box.height,
      left: box.left,
      right: box.right,
      top: box.top,
      bottom: box.bottom,
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight,
      clipped: field.scrollHeight > field.clientHeight + 1,
      hidden: style.display === "none" || style.visibility === "hidden",
      focused: document.activeElement === field,
    } as const;
  });

  expect(state.found).toBe(true);
  if (!state.found) return;
  expect(state.hidden).toBe(false);
  expect(state.clipped).toBe(false);
  // Поле не уже 44 px по высоте (палец и планшет) и не вышло за края окна.
  expect(state.height).toBeGreaterThanOrEqual(44);
  expect(state.left).toBeGreaterThanOrEqual(0);
  expect(state.right).toBeLessThanOrEqual(state.windowWidth + 1);
  expect(state.top).toBeGreaterThanOrEqual(0);
  expect(state.bottom).toBeLessThanOrEqual(state.windowHeight + 1);
  // И в него действительно попадает фокус клавиатуры — при 200% тоже.
  expect(state.focused).toBe(true);
});

test("540 px: карточка дела не ломается — проверка правилом, а не глазами", async ({ page }) => {
  // Шаг 378, подключение `narrowCard`. Правило жило в библиотеке и ничего не
  // проверяло: ни один тест его не звал. 540 px — ниже порога, где строка
  // времени и кнопка «разобрать заново» перестают помещаться на одной строке
  // (406 + 140 px при оценке правила): время обрезается до «09:1», кнопка
  // уезжает за край. На 600 px они ещё влезают — и проверять там нечего.
  //
  // Проверяются три вещи из правила, и все три — на настоящей вёрстке
  // Chromium: страница не едет по горизонтали, ни одна часть строки карточки
  // не вышла за окно, кнопки дела остались доступны.
  await page.setViewportSize({ width: 540, height: 900 });
  await loaded(page);

  // Журнал открывается по-русски «История». Локатор уточнён до ленты экранов:
  // «История» есть ещё и в настройках, и поиск по всей странице нашёл две
  // кнопки — strict mode violation. Ошибка была моя, не приложения.
  const journal = page.getByRole("navigation").getByRole("button", { name: "История", exact: true });
  await expect(journal).toBeVisible();
  await journal.click();

  const state = await page.evaluate(() => {
    const root = document.documentElement;
    const buttons = Array.from(document.querySelectorAll("main button"));
    const out = buttons.map((element) => {
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        label: (element.textContent ?? "").trim().slice(0, 40),
        left: box.left,
        right: box.right,
        width: box.width,
        height: box.height,
        hidden: style.display === "none" || style.visibility === "hidden",
        windowWidth: window.innerWidth,
      };
    });
    return {
      scrolls: root.scrollWidth > root.clientWidth + 1,
      buttons: out,
      windowWidth: window.innerWidth,
    };
  });

  // 1. Горизонтальной прокрутки нет: иначе что-то шире окна.
  expect(state.scrolls).toBe(false);

  // Проверка на пустоте была бы ложно зелёной: если в журнале не нашлось ни
  // одной кнопки, проверять нечего, и это провал, а не успех.
  expect(state.buttons.length).toBeGreaterThan(0);

  // 2. Кнопка, которая есть, должна быть доступна: правило `fits` — то же,
  // что для ленты экранов. Кнопка за краем это «есть, но нельзя нажать».
  const viewport = viewportAt(1, state.windowWidth, 900);
  const broken = state.buttons
    .map((button) => {
      const seen: Visible = {
        box: { left: button.left, top: 0, right: button.right, bottom: button.height, width: button.width, height: button.height },
        hidden: button.hidden,
        clipped: false,
      };
      // Пустая кнопка (иконка без подписи) всё равно должна быть в окне.
      return fits(seen, viewport) ? null : `${button.label || "кнопка"}: ${whyNot(seen, viewport) ?? "не помещается"}`;
    })
    .filter((value): value is string => value !== null);
  expect(broken).toEqual([]);
});
