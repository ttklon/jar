import { test, expect, type Page } from "@playwright/test";

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

  // Каждое нарушение называется своим словом, а не «не помещается»: иначе
  // по сообщению нельзя понять, что править.
  const broken = items
    .map((item) => {
      if (item.hidden) return `${item.label}: спрятан`;
      if (item.width <= 0 || item.height <= 0) return `${item.label}: нулевой площади`;
      if (item.right <= 0 || item.left >= item.windowWidth) return `${item.label}: уехал по горизонтали`;
      if (item.bottom <= 0 || item.top >= item.windowHeight) return `${item.label}: уехал по вертикали`;
      return null;
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
