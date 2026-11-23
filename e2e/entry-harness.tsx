// Test-only entry point, never imported by index.html or the release build.
//
// Зачем отдельный харнесс с полным `App`, когда есть `voice-harness`. Тот рендерит
// только экран «Голос»: он про звук. А шаг 190 — про **весь** путь клавишами, и
// проверить его можно только на настоящем приложении: Tab, порядок фокуса и
// `<form>` живут в шапке `App`, до которой харнесс голоса не достаёт.
import ReactDOM from "react-dom/client";
import { mockIPC } from "@tauri-apps/api/mocks";
import { App } from "../src/app";

// Знакомство не показываем: оно проверяется своим тестом, а здесь нужен главный
// сценарий сразу.
localStorage.setItem("zshelper.welcome.seen", "1");

const actions: unknown[] = [];

mockIPC((command) => {
  switch (command) {
    case "plugin:event|listen":
    case "plugin:event|unlisten":
      return 1;
    case "engine_status":
    case "readiness_status":
      // Полный `ReadinessStatus`, а не «что успел вспомнить». Половина полей
      // выглядела необязательной, и первый прогон упал на них: `readiness.ts`
      // читает `runtime_spec.bytes` и `model_spec.bytes`, а харнесс их не
      // отдавал — `App` падал при рендере, поле входа не появлялось вовсе, и
      // Playwright три раунда подряд говорил «element was detached from the DOM»,
      // хотя поле просто не рождалось. Готовность здесь «всё уже есть»: сценарий
      // про клавиатуру, и ждать скачивания ему незачем.
      return {
        download_name: null,
        runtime_managed: true,
        runtime_supported: true,
        engine_found: true,
        engine_running: true,
        engine_program: "llama-server.exe",
        engine_search_dir: "sidecars",
        model_present: true,
        model_name: "test.gguf",
        model_bytes: 1,
        models_dir: "models",
        free_bytes: 1_000_000_000,
        speech_found: true,
        speech_model: "ggml-base.bin",
        speech_search_dir: "sidecars",
        speech_runtime_managed: true,
        ready: true,
        missing: [],
        model_spec: {
          id: "m",
          title: "тестовая модель",
          file: "test.gguf",
          url: "",
          sha256: "",
          bytes: 1,
          license: "Apache-2.0",
          source: "тест",
          min_ram_gb: 1,
          description: "тест",
        },
        runtime_spec: {
          id: "r",
          title: "тестовый движок",
          asset: "llama.zip",
          url: "",
          sha256: "",
          bytes: 1,
          license: "MIT",
          source: "тест",
          program: "llama-server.exe",
          description: "тест",
        },
        speech_runtime_spec: {
          id: "w",
          title: "тестовый whisper",
          asset: "whisper.zip",
          url: "",
          sha256: "",
          bytes: 1,
          license: "MIT",
          source: "тест",
          program: "whisper-server.exe",
          description: "тест",
        },
        speech_model_spec: {
          id: "wm",
          title: "тестовая модель распознавания",
          file: "ggml-base.bin",
          url: "",
          sha256: "",
          bytes: 1,
          license: "MIT",
          source: "тест",
          min_ram_gb: 1,
          description: "тест",
        },
      };
    case "app_status":
      return { version: "test", started_ms: 0, window_ready_ms: 0, engine: null };
    case "registry_snapshot":
      return { stats: { actions: 1, domains: 1 }, actions, generated: "test", source: "test" };
    case "autostart_status":
      return { enabled: false, supported: false, note: "тест" };
    case "set_voice_tray_status":
      return undefined;
    case "voice_tray_status":
      return { hotkey: "Ctrl+Alt+Space", listening: false, note: "тест" };
    case "plan_checkpoint":
      return null;
    case "list_models":
      return { models: [], role: null, roles: [], dir: "models", free_bytes: 1_000_000_000, note: "тест" };
    default:
      // Всё остальное — `null`, а не падение: сценарий про клавиатуру, а не про
      // данные, и неизвестная команда не должна валить страницу до первого кадра.
      //
      // Но `null` — не «пустой объект»: экран, который ждёт `status.engine_found`,
      // на `null` падает, и падает **до** первого кадра. Поэтому всё, что зовётся
      // при запуске, названо выше поимённо; `default` остаётся только для
      // редких путей (журнал, настройки), до которых сценарий не доходит.
      return null;
  }
}, { shouldMockEvents: true });

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
