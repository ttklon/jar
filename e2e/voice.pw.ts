import { test, expect, type Page } from "@playwright/test";

type SimState = {
  commands: string[]; queries: string[]; micRequests: number; spoken: string[]; unknown: string[];
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
  await expect(page.getByText(/локальное распознавание готово/)).toBeVisible();
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
  expect(state.commands).not.toContain("run_plan");
});
