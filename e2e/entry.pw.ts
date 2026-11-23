import { test, expect, type Page } from "@playwright/test";

/**
 * Главный сценарий без мыши (шаг 190), в настоящем Chromium.
 *
 * Почему это здесь, а не в jsdom. jsdom не двигает фокус по Tab: там можно
 * проверить «элемент фокусируем», но не «Tab до него доходит». А весь шаг именно
 * про второе — человек без мыши идёт Tab'ом и должен попасть во вход. Здесь Tab
 * настоящий, и путь проходит целиком: клавиши, слово, Enter, фраза в разговоре.
 */

/**
 * Открыть страницу один раз без проверок, чтобы Vite не перезагрузил её потом.
 *
 * Первый запрос к `entry.html` заставляет Vite досчитать зависимости и
 * **перезагрузить** страницу. Если это случится посреди теста, элемент будет
 * «отделён от DOM» при каждом обращении (так и падало: `element was detached
 * from the DOM, retrying`, вечно). Поэтому первый заход — пустой.
 */
async function warmup(page: Page) {
  await page.goto("/e2e/entry.html");
  await page.waitForLoadState("networkidle");
}

async function loaded(page: Page) {
  await warmup(page);
  await page.goto("/e2e/entry.html");

  // Ждём появлением в DOM, а не локатором Playwright. Причина: живое приложение
  // перерисовывается, пока подтягивает готовность, и `toBeVisible()` ждёт
  // «стабильности» узла — с перерисовками это может тянуться до таймаута.
  // Нам нужно «поле на экране», а не «узел не менялся две кадра».
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const field = document.querySelector<HTMLInputElement>(
            '[aria-label="скажи или напиши — или назови экран"]',
          );
          const root = document.getElementById("root");
          if (!field) {
            // Что вместо поля: пусто, ошибка, «читаю реестр». Без этого «поля нет»
            // одинаково звучит для «ещё грузится», «упало» и «не смонтировалось».
            const text = (root?.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
            return `поля нет; в окне: «${text || "<пусто>"}»`;
          }
          const box = field.getBoundingClientRect();
          return box.width > 0 && box.height > 0 ? "на экране" : "нулевой размер";
        }),
      { timeout: 20_000, message: "единый вход не появился" },
    )
    .toBe("на экране");
}

test("Tab доходит до входа, слово и Enter — и оно в разговоре (шаг 190)", async ({ page }) => {
  await loaded(page);

  // Считаем нажатия Tab, а не «сколько получится»: число шагов — это и есть
  // проверка. Если вход окажется за краем порядка фокуса, тест упадёт на
  // ограничении, а не пройдёт молча.
  let reached = false;
  for (let step = 0; step < 40; step += 1) {
    await page.keyboard.press("Tab");
    reached = await page.evaluate(() => {
      const active = document.activeElement;
      return !!active && active.getAttribute("aria-label") === "скажи или напиши — или назови экран";
    });
    if (reached) break;
  }
  expect(reached, "Tab не доходит до единого входа за 40 шагов").toBe(true);

  // Печатаем и отправляем Enter'ом — так, как это сделал бы человек без мыши.
  await page.keyboard.type("первое дело");
  await page.keyboard.press("Enter");

  // Фраза доехала до поля разговора.
  await expect
    .poll(async () =>
      page.evaluate(() =>
        document.querySelector<HTMLInputElement>('[aria-label="Услышал"]')?.value,
      ),
    )
    .toBe("первое дело");
});

test("название экрана, набранное с клавиатуры, уводит на экран (шаг 181)", async ({ page }) => {
  await loaded(page);

  // Печатаем и жмём Enter **в одном действии** и проверяем, что фокус действительно
  // в поле: экран живой (`Voice` подтягивает готовность), и между `focus()` и
  // `type()` узел может смениться — тогда буквы уйдут в никуда, а тест скажет
  // «поле не очистилось», хотя виноват не код.
  const typed = await page.evaluate(() => {
    const find = () =>
      document.querySelector<HTMLInputElement>('[aria-label="скажи или напиши — или назови экран"]');
    const field = find();
    if (!field) return { ok: false, why: "поля нет" };
    field.focus();
    return { ok: document.activeElement === field, why: "фокус не в поле" };
  });
  expect(typed.ok, typed.why).toBe(true);

  await page.keyboard.type("история");
  // Что реально в поле и где фокус — до Enter. Если буквы не дошли, причина в
  // этом, а не в переходе.
  const before = await page.evaluate(() => ({
    value:
      document.querySelector<HTMLInputElement>(
        '[aria-label="скажи или напиши — или назови экран"]',
      )?.value ?? "<нет поля>",
    focused: document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.tagName ?? "нет",
  }));
  expect(before.value, `после печати в поле «${before.value}», фокус в «${before.focused}»`).toBe(
    "история",
  );

  await page.keyboard.press("Enter");

  // Увели на «Историю»: виден её заголовок. Ищем по документу: локатор Playwright
  // ждёт стабильности узла, а экран только что смонтировался и ещё грузит данные.
  await expect
    .poll(
      async () =>
        page.evaluate(() =>
          Array.from(document.querySelectorAll("h2")).some(
            (item) => item.textContent?.trim() === "История",
          ),
        ),
      { timeout: 15_000, message: "экран «История» не открылся" },
    )
    .toBe(true);
});

test("страница не перезагружается и не перерисовывается сама", async ({ page }) => {
  // Диагностика, а не обещание: если поле входа отделяется от DOM, значит
  // приложение перерисовывается или страница перезагружается. Здесь это видно
  // числом: сколько раз сменился узел поля за две секунды.
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("crash", () => errors.push("crash"));
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) errors.push(`navigated: ${frame.url()}`);
  });

  await page.goto("/e2e/entry.html");
  await expect
    .poll(
      async () =>
        page.evaluate(
          () => !!document.querySelector('[aria-label="скажи или напиши — или назови экран"]'),
        ),
      { timeout: 20_000 },
    )
    .toBe(true);

  const changes = await page.evaluate(async () => {
    const seen = new Set<Element>();
    const started = Date.now();
    let missing = 0;
    while (Date.now() - started < 2000) {
      const el = document.querySelector('[aria-label="скажи или напиши — или назови экран"]');
      if (el) seen.add(el);
      else missing += 1;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return { nodes: seen.size, missing, url: location.href, title: document.title };
  });

  expect(
    changes.nodes,
    `поле входа пересоздавалось ${changes.nodes} раз; отсутствовало ${changes.missing} раз; ` +
      `адрес ${changes.url}; заголовок ${changes.title}; события: ${errors.join("; ")}`,
  ).toBe(1);
});
