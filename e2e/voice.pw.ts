import { test, expect, type Page } from "@playwright/test";

type SimState = {
  commands: string[]; asrRequests: string[]; cancelledRequests: string[]; queries: string[]; micRequests: number; spoken: string[]; unknown: string[];
  wavs: { bytes: number; rate: number; samples: number; peak: number }[];
  streams: MediaStream[]; asrError: boolean; delayAsr: boolean; micError: boolean;
};
declare global {
  interface Window { voiceSimulation: { state: SimState; resolveAsr(text: string): void; hold(payload: "down" | "up"): Promise<void> } }
}
async function hold(page: Page) {
  const button = page.getByRole("button", { name: "Держать и говорить", exact: true });
  await button.dispatchEvent("pointerdown");
  await expect.poll(() => page.evaluate(() => window.voiceSimulation.state.streams.filter(s => s.active).length)).toBe(1);
  await page.waitForTimeout(900); // real audio frames, not a mocked recording promise
  await button.dispatchEvent("pointerup");
}
/**
 * Отметка «про микрофон уже объясняли» (шаг 24).
 *
 * Эти тесты проверяют звук, а не первый разговор: человек, вернувшийся на
 * экран, объяснение уже видел, и первое нажатие сразу включает микрофон. Сам
 * первый разговор проверяется отдельным тестом ниже — он эту отметку не ставит.
 */
async function micExplained(page: Page) {
  await page.evaluate(() => localStorage.setItem("zshelper.mic.explained", "1"));
}

async function released(page: Page) {
  await expect.poll(() => page.evaluate(() => window.voiceSimulation.state.streams.every(s => s.getTracks().every(t => t.readyState === "ended")))).toBe(true);
}

test.beforeEach(async ({ page }) => {
  // Block unintended external transfers even if production code changes.
  await page.route("**/*", route => {
    const url = new URL(route.request().url());
    return url.hostname === "127.0.0.1" ? route.continue() : route.abort("blockedbyclient");
  });
  await page.goto("/e2e/voice.html");
  await expect(page.getByText(/локальное распознавание работает здесь/)).toBeVisible();
  await micExplained(page);
});

test("первый разговор сначала объясняет, что услышит, и только потом слушает (шаг 24)", async ({ page }) => {
  // Настоящий первый раз: объяснения не было. Отметку, поставленную в
  // `beforeEach`, снимаем — это и есть состояние нового человека.
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByText(/локальное распознавание работает здесь/)).toBeVisible();

  const button = page.getByRole("button", { name: "Держать и говорить", exact: true });
  await button.dispatchEvent("pointerdown");

  // Микрофон ещё не открыт: сначала объяснение, а не системный запрос вслепую.
  await expect(page.getByText("первый раз с микрофоном")).toBeVisible();
  expect(await page.evaluate(() => window.voiceSimulation.state.streams.length)).toBe(0);

  await page.getByRole("button", { name: "Понятно, включить микрофон" }).click();
  // Объяснение убрано и запомнено — второй раз его не будет.
  await expect(page.getByText("первый раз с микрофоном")).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem("zshelper.mic.explained"))).toBe("1");

  // После согласия обычный путь работает как раньше: держим и говорим.
  await hold(page);
  await expect(page.getByLabel("Услышал", { exact: true })).toHaveValue("привет помощник");
});

test("native virtual mic → WAV → simulated ASR/LLM → spoken reply, two turns", async ({ page }) => {
  expect(await page.evaluate(() => window.voiceSimulation.state.micRequests)).toBe(0);
  await hold(page);
  await expect(page.getByLabel("Услышал", { exact: true })).toHaveValue("привет помощник");
  await expect.poll(() => page.evaluate(() => window.voiceSimulation.state.spoken)).toContain("модель переспрашивает: Здравствуйте! Чем помочь?");
  await released(page);
  await hold(page);
  await expect(page.getByLabel("Услышал", { exact: true })).toHaveValue("расскажи что умеешь");
  await expect.poll(() => page.evaluate(() => window.voiceSimulation.state.spoken)).toContain("модель переспрашивает: Могу предложить план. Без подтверждения опасные действия не выполняю.");
  await released(page);
  const state = await page.evaluate(() => window.voiceSimulation.state);
  expect(state.queries).toEqual(["привет помощник", "расскажи что умеешь"]);
  expect(state.wavs).toHaveLength(2);
  for (const wav of state.wavs) {
    expect(wav.rate).toBe(16000);
    expect(wav.samples).toBeGreaterThan(3200);
    expect(wav.peak).toBeGreaterThan(100);
  }
  expect(state.commands).not.toContain("run_plan");
  expect(state.unknown).toEqual([]);
});

test("local diagnostic gets real Chromium frames and releases device", async ({ page }) => {
  await page.getByRole("button", { name: "Проверить микрофон локально", exact: true }).click();
  await expect(page.getByText(/Звуковой сигнал получен/)).toBeVisible();
  await released(page);
  expect(await page.evaluate(() => window.voiceSimulation.state.wavs)).toEqual([]);
});

test("cancel discards captured audio without ASR or model calls", async ({ page }) => {
  await page.getByRole("button", { name: "Держать и говорить", exact: true }).dispatchEvent("pointerdown");
  await expect.poll(() => page.evaluate(() => window.voiceSimulation.state.streams.length)).toBe(1);
  await page.getByRole("button", { name: "Отмена", exact: true }).click();
  await released(page);
  const state = await page.evaluate(() => window.voiceSimulation.state);
  expect(state.wavs).toEqual([]);
  expect(state.queries).toEqual([]);
  await expect(page.getByLabel("Услышал", { exact: true })).toHaveValue("");
});

test("ASR failure is visible, device released, retry works", async ({ page }) => {
  await page.evaluate(() => { window.voiceSimulation.state.asrError = true; });
  await hold(page);
  await expect(page.getByText("SIMULATED ASR failure", { exact: true })).toBeVisible();
  await released(page);
  expect(await page.evaluate(() => window.voiceSimulation.state.queries)).toEqual([]);
  await page.evaluate(() => { window.voiceSimulation.state.asrError = false; });
  await hold(page);
  await expect.poll(() => page.evaluate(() => window.voiceSimulation.state.queries.length)).toBe(1);
  await released(page);
});

test("permission denial never reaches ASR", async ({ page }) => {
  await page.evaluate(() => { window.voiceSimulation.state.micError = true; });
  await page.getByRole("button", { name: "Держать и говорить", exact: true }).dispatchEvent("pointerdown");
  await expect(page.getByText(/микрофон закрыт: разрешите доступ/)).toBeVisible();
  expect(await page.evaluate(() => window.voiceSimulation.state.wavs)).toEqual([]);
});

test("simulated native hold event uses the same real audio path", async ({ page }) => {
  await page.evaluate(() => window.voiceSimulation.hold("down"));
  await expect.poll(() => page.evaluate(() => window.voiceSimulation.state.streams.length)).toBe(1);
  await page.waitForTimeout(900);
  await page.evaluate(() => window.voiceSimulation.hold("up"));
  await expect.poll(() => page.evaluate(() => window.voiceSimulation.state.queries.length)).toBe(1);
  await released(page);
});


test("Escape after release rejects delayed ASR before it becomes a task", async ({ page }) => {
  await page.evaluate(() => { window.voiceSimulation.state.delayAsr = true; });
  await hold(page);
  await expect.poll(() => page.evaluate(() => window.voiceSimulation.state.wavs.length)).toBe(1);
  await released(page);
  await page.keyboard.press("Escape");
  await page.evaluate(() => window.voiceSimulation.resolveAsr("удали файлы"));
  // Drain promise continuations and render work after the deliberately late result.
  await page.waitForTimeout(300);
  await expect(page.getByLabel("Услышал", { exact: true })).toHaveValue("");
  const state = await page.evaluate(() => window.voiceSimulation.state);
  expect(state.queries).toEqual([]);
  expect(state.cancelledRequests).toContain(state.asrRequests[0]);
  expect(state.commands).not.toContain("run_plan");
});


test("processing remains visible after release and can be cancelled by button", async ({ page }) => {
  await page.evaluate(() => { window.voiceSimulation.state.delayAsr = true; });
  await hold(page);
  await expect(page.getByText("Распознаю локально… Можно отменить, не дожидаясь результата.", { exact: true })).toBeVisible();
  await released(page);
  await expect(page.getByRole("button", { name: "Проверить микрофон локально", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Отменить распознавание", exact: true }).click();
  await expect(page.getByText("распознавание отменено — результат не станет задачей", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Отменить распознавание", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Проверить микрофон локально", exact: true })).toBeEnabled();
  await expect(page.getByLabel("Услышал", { exact: true })).toHaveValue("");
  const state = await page.evaluate(() => window.voiceSimulation.state);
  expect(state.queries).toEqual([]);
  expect(state.cancelledRequests).toContain(state.asrRequests[0]);
});

test("successful delayed ASR clears processing and delivers its actual text", async ({ page }) => {
  await page.evaluate(() => { window.voiceSimulation.state.delayAsr = true; });
  await hold(page);
  await expect(page.getByRole("button", { name: "Отменить распознавание", exact: true })).toBeVisible();
  await page.evaluate(() => window.voiceSimulation.resolveAsr("расскажи что умеешь"));
  await expect(page.getByLabel("Услышал", { exact: true })).toHaveValue("расскажи что умеешь");
  await expect(page.getByRole("button", { name: "Отменить распознавание", exact: true })).toHaveCount(0);
  await released(page);
});
