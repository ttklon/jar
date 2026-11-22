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
 * Причина падения — в отчёт, а не в тишину.
 *
 * Первый прогон этого теста упал без причины: лог задания и артефакт были
 * недоступны, и оставалось гадать. Поэтому теперь любая ошибка страницы
 * прикладывается к тесту текстом: `App` в симуляции живёт на подставных данных,
 * и «какая-то команда не ответила» — самая вероятная причина.
 */
async function collectErrors(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  return errors;
}

async function loaded(page: Page) {
  await page.goto("/e2e/entry.html");
  // Приложение открывается голосом: это и есть «загрузилось».
  await expect(page.getByRole("textbox", { name: /скажи или напиши/ })).toBeVisible({ timeout: 15_000 });
}

test("Tab доходит до входа, слово и Enter — и оно в разговоре (шаг 190)", async ({ page }) => {
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    return url.hostname === "127.0.0.1" ? route.continue() : route.abort("blockedbyclient");
  });
  const errors = await collectErrors(page);
  await loaded(page);
  // Если вход не появился — тест падает ниже, но без причины. Прикладываем её.
  await expect(page.getByRole("textbox", { name: /скажи или напиши/ }), errors.join("; ") || "вход не отрисовался").toBeVisible({ timeout: 15_000 });

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
  await expect(page.getByRole("textbox", { name: "Услышал" })).toHaveValue("первое дело");
});

test("название экрана, набранное с клавиатуры, уводит на экран (шаг 181)", async ({ page }) => {
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    return url.hostname === "127.0.0.1" ? route.continue() : route.abort("blockedbyclient");
  });
  await loaded(page);

  const entry = page.getByRole("textbox", { name: /скажи или напиши/ });
  await entry.click();
  await page.keyboard.type("история");
  await page.keyboard.press("Enter");

  // Увели на «Историю»: виден её заголовок, и поле входа очистилось.
  await expect(page.getByRole("heading", { name: "История", level: 2 })).toBeVisible();
  await expect(entry).toHaveValue("");
});
