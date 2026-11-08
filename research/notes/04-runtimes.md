# 04 — Рантаймы инференса

Задача: один внутренний интерфейс, за которым могут стоять разные движки — в зависимости от
железа и от того, что уже установлено у пользователя.

## 1. Карта движков

| Движок | Что даёт | Windows | Лицензия | Наша роль |
| --- | --- | --- | --- | --- |
| **llama.cpp / `llama-server`** | GGUF, CPU/AVX2/CUDA/Vulkan/SYCL/HIP, грамматики, tool-calling, спекулятивное декодирование | ✅ отлично | MIT | **Основной LLM-движок** |
| **Ollama** | удобный менеджер моделей + API, поверх llama.cpp | ✅ | MIT | Опционально: используем, если уже стоит |
| **node-llama-cpp** | llama.cpp в Node-процессе, JS-API, грамматики | ✅ (нужна пересборка) | MIT | Только для лёгких задач/эмбеддингов в воркере |
| **ONNX Runtime** (Node/C++) | универсальные модели: ASR, OCR, embed, VAD, детекторы | ✅ CPU/DirectML/WebGPU EP | MIT | **Основной движок для не-LLM** |
| **ONNX Runtime GenAI** | генерация LLM на ONNX (в т.ч. Phi) | ✅ | MIT | Экспериментально |
| **OpenVINO / OpenVINO GenAI** | Intel iGPU/NPU, заметный буст на Iris/Xe | ✅ | Apache-2.0 | Опция для Intel-машин |
| **Windows ML** | ONNX с автоматическим выбором EP (CPU/GPU/NPU), встроен в ОС (2026) | ✅ | — | Опция: «системный» путь без своих бинарников |
| **Foundry Local** | локальный OpenAI-совместимый сервер + каталог моделей от MS | ✅ | — | Опция для пользователей с Copilot+ ПК |
| **Phi Silica (Windows AI APIs)** | системная LLM для суммаризации/OCR на NPU (RTX 30+ 6 ГБ — с 2026 в Dev) | ✅ (ограниченно) | — | Бонус-путь: «есть системная модель — используем» |
| **whisper.cpp** | ASR, квантованные ggml, CPU/CUDA | ✅ | MIT | Основной ASR-рантайм |
| **sherpa-onnx** | ASR+TTS+KWS+VAD одним рантаймом, много моделей | ✅ | Apache-2.0 | Сильный кандидат: один бинарь на всю речь |
| **vLLM / SGLang / TensorRT-LLM** | максимум throughput | сервер | Apache-2.0 | ❌ не для десктопа |
| **MLC / WebLLM** | WebGPU в браузере/Electron | ✅ | Apache-2.0 | Эксперимент: «нет нативных зависимостей» |
| **Transformers.js** | ONNX в WASM/Node, маленькие модели | ✅ | Apache-2.0 | Для embed/классификации в рендерере/воркере |

## 2. Почему `llama-server`, а не встроенная библиотека

1. **Изоляция**: падение/утечка нативной библиотеки не убивает ядро.
2. **Swap моделей**: убил процесс — освободил VRAM (в процессе это почти невозможно надёжно).
3. **OpenAI-совместимый API**: `/v1/chat/completions`, `/v1/embeddings`, стриминг SSE.
4. **Грамматики и JSON-схемы**: `response_format` + GBNF — критично для tool-calling.
5. **Учёт ресурсов**: pid → RSS/VRAM, можно прибить по таймауту.

Схема запуска (одна модель — один процесс):

```bash
llama-server \
  -m "%APPDATA%/ZShelper/models/qwen3-8b-q4_k_m.gguf" \
  --host 127.0.0.1 --port 0 \                # 0 = свободный порт, узнаём из stdout
  -c 16384 -ngl 999 --flash-attn on \
  --cache-type-k q8_0 --cache-type-v q8_0 \
  --jinja \                                  # шаблоны чата и tool-calling
  --threads 8 --parallel 1 --no-webui \
  --mlock=false                              # на Windows mlock чаще вредит
```

Важные флаги и грабли:
- `--jinja` + корректный chat-template = работающие tool-calls. Без него многие модели
  «сыпят» JSON в текст.
- `--flash-attn` требует поддержки; на старых GPU может падать → проба с fallback.
- `--parallel > 1` множит KV-кэш; для десктопа обычно `1`, а параллелизм делаем на уровне
  очереди задач.
- `-ngl 999` не всегда optimum: пробуем 999 → при OOM снижаем бинарным поиском (кэшируем).
- Порт `0` — чтобы не конфликтовать с Ollama/LM Studio (11434/1234) и вторыми копиями приложения.

## 3. Внутренний интерфейс (единственное, что видит остальной код)

```ts
export interface InferenceBackend {
  readonly name: "llama.cpp" | "ollama" | "openvino" | "onnx" | "foundry" | "windowsml";
  probe(): Promise<BackendStatus>;                       // есть ли бинарь, версия, бэкенды GPU
  ensureModel(spec: ModelSpec): Promise<ModelHandle>;    // скачать/проверить sha/загрузить
  release(handle: ModelHandle): Promise<void>;           // выгрузить (LRU-политика снаружи)
  chat(req: ChatRequest): AsyncIterable<ChatChunk>;      // стриминг токенов + tool_calls
  embed(req: EmbedRequest): Promise<Float32Array[]>;
  rerank?(q: string, docs: string[]): Promise<number[]>;
  transcribe?(audio: Float32Array, opts: TranscribeOpts): AsyncIterable<AsrChunk>;
  speak?(text: string, voice: string): AsyncIterable<Float32Array>;
  classify?(text: string, labels: string[]): Promise<Record<string, number>>;
  stats(): { vramMb: number; ramMb: number; tokPerSec: number; queue: number };
}
```

Правила реализации:
- Каждый бэкенд обязан **деградировать**, а не падать: нет CUDA → Vulkan → CPU; нет бинаря →
  попытка скачать при первом использовании (с согласия) → иначе честное «не могу».
- Все ошибки нормализуются в `InferenceError{ code, retryable, hint }` (`oom`, `ctx_overflow`,
  `model_corrupt`, `backend_down`, `timeout`, `template_mismatch`).
- Каждый вызов несёт `deadlineMs`; по истечении — `abort` и понятное сообщение пользователю.
- Метрики: tok/s, time-to-first-token, очередь, потребление — в UI и в трейсы.

## 4. Кто что использует (таблица соответствия)

| Роль | Дефолт | Fallback 1 | Fallback 2 |
| --- | --- | --- | --- |
| LLM (чат/план/код) | llama.cpp | Ollama (если стоит) | Foundry Local / Phi Silica |
| Embeddings | ONNX Runtime (bge-m3/e5) | llama.cpp `--embeddings` | Transformers.js |
| Rerank | ONNX (bge-reranker) | — | без rerank (хуже точность) |
| ASR | whisper.cpp | sherpa-onnx | faster-whisper (если есть Python) |
| TTS | sherpa-onnx / Kokoro-ONNX | Piper (бинарь) | Windows SAPI |
| VAD | Silero (ONNX) | WebRTC VAD | энергопорог |
| Wake word | sherpa-onnx KWS | openWakeWord (ONNX) | PTT-only |
| OCR | RapidOCR (ONNX) | Tesseract | VLM-описание |
| VLM/grounding | llama.cpp + mmproj | OmniParser + текстовая LLM | только UIA-дерево |
| Детектор UI-элементов | OmniParser (ONNX) | CV-эвристики | UIA |

## 5. Windows-специфика, которую нужно знать заранее

- **Драйверы**: CUDA 12.x требует свежих драйверов; на старых картах — Vulkan-бэкенд
  (медленнее, но работает) или CPU. Проверка `nvidia-smi` + версия драйвера → выбор бэкенда.
- **Гибридная графика (Optimus)**: приложение может «сесть» на iGPU. Решение: явно выбирать
  адаптер через DXGI/`NvOptimusEnablement`, плюс инструкция пользователю в настройках.
- **Антивирус/Controlled Folder Access**: запуск бинарников из `%APPDATA%` может блокироваться —
  ставим в `%LOCALAPPDATA%\Programs\ZShelper\bin` и подписываем.
- **Длинные пути** (>260 символов) в workspace моделей/проектов → префикс `\\?\`.
- **WSL**: не зависим, но если есть — можем использовать как песочницу для кода.
- **Windows ML / Foundry Local 2026**: дают «системные» модели без своих весов (Phi Silica,
  OCR-API, генерация изображений). Правильно: **опциональный ускоритель**, не фундамент.
  Phi Silica на RTX 30+ (≥6 ГБ VRAM) — только Dev/Experimental канал, требует Windows App SDK
  2.2.2-experimental → значит, не может быть обязательным путём. ⚠️ проверить на целевой машине.

## 6. Управление моделями: жизненный цикл

```
resolve(role) ──> model-lock.json ──> есть файл? ──нет──> download(с прогрессом, зеркала, resume)
                        │                                     │
                        └── sha256 ok? ──нет──> перекачать    │
                        │
                   spawn backend ──> health(/health) ──> ready
                        │
                   idle > N мин ──> release (освободить VRAM/RAM)
                        │
                   OOM при загрузке ──> уменьшить ngl/ctx ──> retry (max 2) ──> tier down
```

Политика кэша (LRU по «стоимости загрузки»):
- `llm.workhorse`, `asr`, `vad`, `embed` — держим постоянно (в пределах бюджета).
- `llm.coder`, `vlm` — грузим по требованию, выгружаем через 5 минут простоя.
- `tts` — грузим на первое «скажи».

## 7. Оценка производительности «на глаз» (для UI-подсказок)

`tokens/s ≈ (memoryBandwidth_GBs × efficiency) / (bytesPerWeight × paramsB)`
- CPU, DDR4-3200 dual: ~40 ГБ/с, efficiency ~0.35.
- GPU, RTX 4060: ~272 ГБ/с, efficiency ~0.25–0.4 (зависит от батча и кванта).

Это позволяет показать в настройках «ожидаемо ~12 tok/s» и не удивлять пользователя.
Реальные значения берём из калибровки (`02-hardware-profiler.md`).

## 8. Источники в vault

| Тема | Файл |
| --- | --- |
| llama.cpp: сборка, бэкенды, кванты | `sources/inference-runtimes/ggml-org__llama.cpp/README.md`, `files/docs__build.md` |
| GGUF/типы квантов | `sources/inference-runtimes/ggml-org__ggml/README.md` |
| Ollama API/FAQ | `sources/inference-runtimes/ollama__ollama/` |
| node-llama-cpp | `sources/inference-runtimes/withcatai__node-llama-cpp/README.md` |
| ONNX Runtime (+GenAI) | `sources/screen-understanding/microsoft__onnxruntime/README.md`, `…onnxruntime-genai/` |
| OpenVINO | `sources/inference-runtimes/openvinotoolkit__openvino/README.md` |
| BitNet (1-битные модели на CPU) | `sources/inference-runtimes/microsoft__BitNet/README.md` |
| sherpa-onnx | `sources/whisper-and-asr/k2-fsa__sherpa-onnx/README.md` |
| Foundry Local / Windows ML / Phi Silica | `16-open-questions.md` § внешние обзоры (справки MS Learn) |

## 9. Открытые вопросы

- Даёт ли `llama-server` на Windows стабильный `--jinja` tool-calling для Qwen3 — проверить на
  3 моделях; если нет, использовать грамматику GBNF из нашей JSON-схемы (надёжнее).
- Стоит ли ship'ить собственные бинарники llama.cpp (CUDA+Vulkan+CPU, ~150–250 МБ) или
  качать по требованию под железо (меньше установщик, дольше первый запуск).
- OpenVINO на Intel iGPU: реальный прирост против Vulkan — замерить, иначе не тащить лишние 300 МБ.
