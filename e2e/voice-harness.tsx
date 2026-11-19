// Test-only entry point, never imported by index.html or the release build.
import ReactDOM from "react-dom/client";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { mockIPC } from "@tauri-apps/api/mocks";
import { emit } from "@tauri-apps/api/event";
import { Voice } from "../src/screens/Voice";

const state = {
  commands: [] as string[],
  queries: [] as string[],
  wavs: [] as { bytes: number; rate: number; samples: number; peak: number }[],
  spoken: [] as string[],
  streams: [] as MediaStream[],
  micRequests: 0,
  asrError: false,
  micError: false,
  unknown: [] as string[],
};
const nativeGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
navigator.mediaDevices.getUserMedia = async (constraints) => {
  state.micRequests++;
  if (state.micError) throw new DOMException("simulated refusal", "NotAllowedError");
  const stream = await nativeGetUserMedia(constraints);
  state.streams.push(stream);
  return stream;
};
Object.defineProperty(window, "SpeechSynthesisUtterance", { configurable: true, value: class {
  lang = "";
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public text: string) {}
} });
Object.defineProperty(window, "speechSynthesis", { configurable: true, value: {
  cancel() {},
  getVoices: () => [{ lang: "ru-RU", name: "Test-only Russian voice" }],
  speak(utterance: SpeechSynthesisUtterance) {
    state.spoken.push(utterance.text);
    // No actual loudspeaker or system voice is used in this contract simulation.
    utterance.dispatchEvent?.(new Event("start"));
  },
} });
mockIPC((command, payload) => {
  state.commands.push(command);
  const args = payload as Record<string, unknown> | undefined;
  switch (command) {
    case "speech_status": return { found: true, program: "SIMULATED whisper", model: "SIMULATED model", search_dir: "fixture", models_dir: "fixture" };
    case "isolation_status": return { available: false, summary: "simulation", note: "No native process" };
    case "facts": return [];
    case "foreground_window": return null;
    case "machine_state": return { available: false, note: "simulation", sample: null, declared: null, budget: { parallel: 1, mode: "near", reason: "simulation", may_start: false } };
    case "set_voice_tray_status": return;
    case "readiness_status": throw new Error("Native readiness intentionally not simulated");
    case "plan_for": return [];
    case "draft_plan": return null;
    case "request_learning": return null;
    case "transcribe_local": {
      const bytes = Uint8Array.from(args?.audio as number[]);
      const view = new DataView(bytes.buffer);
      const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
      if (bytes.length <= 44 || ascii(0, 4) !== "RIFF" || ascii(8, 12) !== "WAVE" ||
          view.getUint16(22, true) !== 1 || view.getUint16(34, true) !== 16 ||
          view.getUint32(40, true) !== bytes.length - 44) throw new Error("Invalid captured WAV");
      let peak = 0;
      for (let at = 44; at < bytes.length; at += 2) peak = Math.max(peak, Math.abs(view.getInt16(at, true)));
      state.wavs.push({ bytes: bytes.length, rate: view.getUint32(24, true), samples: (bytes.length - 44) / 2, peak });
      if (state.asrError) throw new Error("SIMULATED ASR failure");
      // Deliberately NOT recognition: deterministic contract fixture after validating real captured audio.
      return state.wavs.length === 1 ? "привет помощник" : "расскажи что умеешь";
    }
    case "think": {
      const query = args?.query as string;
      state.queries.push(query);
      const question = query === "привет помощник" ? "Здравствуйте! Чем помочь?" : "Могу предложить план. Без подтверждения опасные действия не выполняю.";
      return { prompt: "SIMULATED LLM", answer: question, proposal: { Ask: { question, why: "dialogue fixture" } }, plan: null, learning: null, deeds: null, problem: null };
    }
    default:
      state.unknown.push(command);
      throw new Error(`Unexpected IPC in simulation: ${command}`);
  }
}, { shouldMockEvents: true });

Object.assign(window, { voiceSimulation: {
  state,
  hold: (payload: "down" | "up") => emit("voice://hold", payload),
} });
ReactDOM.createRoot(document.getElementById("root")!).render(
  <FluentProvider theme={webLightTheme}><p>SIMULATION: native Chromium audio; stub ASR, LLM, TTS and Tauri events.</p><Voice /></FluentProvider>,
);
