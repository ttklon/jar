// Test-only entry point, never imported by index.html or the release build.
import ReactDOM from "react-dom/client";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { mockIPC } from "@tauri-apps/api/mocks";
import { emit } from "@tauri-apps/api/event";
import { Voice } from "../src/screens/Voice";

const state = {
  commands: [] as string[],
  asrRequests: [] as string[],
  cancelledRequests: [] as string[],
  queries: [] as string[],
  wavs: [] as { bytes: number; rate: number; samples: number; peak: number }[],
  spoken: [] as string[],
  streams: [] as MediaStream[],
  micRequests: 0,
  asrError: false,
  delayAsr: false,
  micError: false,
  unknown: [] as string[],
};
let activeRequest: string | null = null;
let nextRequest = 0;
let resolveAsr: ((text: string) => void) | null = null;
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
    // Экран «что сейчас» (rightNowLive) спрашивает дела, движок и реестр.
    // Заглушка отвечала на них неизвестностью, и e2e падал на «unknown» —
    // то есть валился тест голоса, а причина была в неподключённой заглушке.
    // Отвечаем тем же, что сказало бы ядро на пустой машине.
    case "memory_runs": return [];
    case "engine_status": return { found: false, program: null, search_dir: "fixture", running: false, port: null, pid: null };
    case "registry_snapshot": return {
      actions: [],
      stats: {
        actions: 0, domains: 0, verbs: 0,
        byRisk: { read: 0, "write-local": 0, external: 0, destructive: 0, identity: 0, money: 0 },
        byTier: { T0: 0, T1: 0, T2: 0, T3: 0 },
        byStatus: { v1: 0, v2: 0, later: 0, never: 0 },
      },
    };
    // Дальше — команды, которые вызываются по действию человека, а не при
    // загрузке. Отвечаем так же, как ответило бы ядро на пустой машине: ничего
    // не наврали, и «unknown» больше не маскируется под сломанный голос.
    // Формы возврата — настоящие, а не «похожие»: заглушка, которая отвечает
    // не тем полем, врёт тихо, и следующий тест падает уже на разборе ответа.
    case "adopt_hand": return { key: "fixture", title: "фикстура", code: "", risk: "read", source: "simulation", created_ms: 0 };
    case "draft_hand": return { key: "fixture", goal: "", code: "", why: "simulation", created_ms: 0 };
    case "trial_hand": return { key: "fixture", ran: false, ok: false, exit_code: null, stdout: "", stderr: "", timed_out: false, cell: "simulation" };
    case "declare_presence": return { available: false, note: "simulation", sample: null, declared: null, budget: { parallel: 1, mode: "near", reason: "simulation", may_start: false } };
    case "fill_plan": return { plan: null, problems: [], gates: [], questions: [] };
    case "model_prompt": return { prompt: "SIMULATED prompt", answer: "" };
    case "remember_fact": return;
    case "cancel_tool": return;
    case "plan_checkpoint": return null;
    case "run_plan": return { goal: "simulation", steps: [], stopped: "simulation: no real plan", run_id: null, sight: null, resume_at: null, ask_on_resume: null };
    case "say": return "";
    case "smoke_check": return { ok: false, answer: null, model: null, port: null, note: "simulation: no real model" };
    case "ui_dump": return { title: "simulation", process: "simulation", elements: [], truncated: false, note: "simulation: no real screen", text: "" };
    case "ui_press": return { target: { name: "simulation", kind: "button", id: "fixture", actions: [] }, sent: false, changed: false, note: "simulation: nothing pressed" };
    case "ui_type": return { target: { name: "simulation", kind: "edit", id: "fixture", actions: [] }, text: "", read_back: "", verified: false, note: "simulation: nothing typed" };
    case "undo_report": return { session: "simulation", steps: [], note: "simulation: nothing to undo" };
    case "undo_apply": return { session: "simulation", undone: 0, refused: [] };
    case "audit_tail": return [];
    case "list_tools": return [];
    case "foreground_window": return null;
    case "machine_state": return { available: false, note: "simulation", sample: null, declared: null, budget: { parallel: 1, mode: "near", reason: "simulation", may_start: false } };
    case "set_voice_tray_status": return;
    case "readiness_status": throw new Error("Native readiness intentionally not simulated");
    case "plan_for": return [];
    case "draft_plan": return null;
    case "request_learning": return null;
    case "begin_transcription": {
      if (activeRequest !== null) throw new Error("SIMULATED ASR busy");
      activeRequest = String(++nextRequest);
      state.asrRequests.push(activeRequest);
      return activeRequest;
    }
    case "cancel_transcription": {
      const id = args?.requestId as string;
      state.cancelledRequests.push(id);
      if (id === activeRequest) {
        activeRequest = null;
        resolveAsr?.("SIMULATED cancelled ASR result");
        resolveAsr = null;
      }
      return;
    }
    case "transcribe_local": {
      if (args?.requestId !== activeRequest) throw new Error("SIMULATED ASR invalid ID");
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
      if (state.delayAsr) return new Promise<string>((resolve) => { resolveAsr = resolve; });
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
  resolveAsr: (text: string) => { resolveAsr?.(text); resolveAsr = null; },
  hold: (payload: "down" | "up") => emit("voice://hold", payload),
} });
ReactDOM.createRoot(document.getElementById("root")!).render(
  <FluentProvider theme={webLightTheme}><p>SIMULATION: native Chromium audio; stub ASR, LLM, TTS and Tauri events.</p><Voice /></FluentProvider>,
);
