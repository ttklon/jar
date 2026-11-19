import { defineConfig } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// A reproducible local tone, not a user's recording. Chromium loops this virtual input.
mkdirSync("artifacts", { recursive: true });
const fakeAudio = resolve("artifacts/virtual-microphone.wav");
const samples = 16000 * 2;
const wav = Buffer.alloc(44 + samples * 2);
wav.write("RIFF", 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write("WAVEfmt ", 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(16000, 24); wav.writeUInt32LE(32000, 28);
wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36);
wav.writeUInt32LE(samples * 2, 40);
for (let i = 0; i < samples; i++) wav.writeInt16LE(Math.round(8000 * Math.sin(2 * Math.PI * 440 * i / 16000)), 44 + i * 2);
writeFileSync(fakeAudio, wav);

export default defineConfig({
  testDir: "./e2e",
  testMatch: "*.pw.ts",
  timeout: 30_000,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  outputDir: "artifacts/voice-simulation",
  reporter: [["list"], ["html", { outputFolder: "artifacts/voice-report", open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:5173",
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
      args: ["--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${fakeAudio}`, "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required", "--no-sandbox"],
    },
  },
  webServer: {
    command: "npm run dev -- --host 0.0.0.0",
    url: "http://127.0.0.1:5173/e2e/voice.html",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
