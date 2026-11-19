# 02 — Профилировщик железа и бюджеты

Цель: за 3–8 секунд при первом запуске (и при каждом изменении железа) понять, **что этот
конкретный ПК реально может**, и выдать конфигурацию моделей — без «универсальных» настроек,
которые на слабой машине превращаются в слайд-шоу.

## 1. Что собираем

### 1.1 Статика (быстро, без бенчмарков)

| Что | Откуда | Зачем |
| --- | --- | --- |
| CPU: модель, ядра/потоки, база/буст, кэш L3, AVX2/AVX-512/AMX | `systeminformation` (`cpu()`), далее `Get-CimInstance Win32_Processor`, CPUID через нативный модуль | выбор числа потоков, доступность быстрых квантов |
| RAM: объём, частота, каналы, доступно | `si.mem()`, `Win32_PhysicalMemory` | потолок моделей, пропускная способность |
| GPU: имя, вендор, VRAM (dedicated/shared), драйвер, DirectX feature level | `si.graphics()`, `Win32_VideoController`, `dxdiag /t`, NVML/nvidia-smi | тип инференса, `n_gpu_layers` |
| iGPU/NPU | `Win32_PnPEntity` (класс `ComputeAccelerator`), признаки «Intel(R) AI Boost», «AMD IPU», «Snapdragon Hexagon» | OpenVINO / Windows ML пути |
| Диск: тип (SSD/HDD/NVMe), свободное место, скорость чтения | `MSFT_PhysicalDisk.MediaType`, `si.fsSize()` | загрузка весов, кэш, workspace |
| ОС: версия, билд, арх., редакция, наличие WSL | `si.osInfo()` | Win10 1809+ vs Win11, фичи |
| Питание: батарея, AC | `si.battery()`, `powerMonitor` | троттлинг на батарее |
| Виртуалка/контейнер | `Win32_ComputerSystem.Model`, признаки Hyper-V/VMware | отключить «глупые» оптимизации GPU |
| Экран: разрешение, DPI, число мониторов | `screen`, `EnumDisplayMonitors` | координаты кликов, скриншоты |
| Аудио: устройства ввода/вывода, частота | WASAPI enumerator | захват/воспроизведение |
| Установленные рантаймы | реестр, PATH | Ollama/LM Studio/Python/Git |

### 1.2 Динамика (калибровка, один раз, ~5–10 с)

Без этого любые таблицы «сколько токенов в секунду» — фикция.

1. **Тест памяти**: последовательное чтение буфера 512 МБ → ГБ/с (главный предиктор tok/s на CPU).
2. **Тест CPU**: короткий мат-бенч + проверка AVX2 (от этого зависит, будет ли Q4 быстрее Q8).
3. **Тест GPU**: загрузить крошечную модель через llama.cpp на N слоёв, замерить tok/s; повторить
   с 0 слоёв (CPU) — получаем реальное ускорение и потолок VRAM.
4. **Тест диска**: чтение 200 МБ случайно → МБ/с (важно для холодного старта модели).
5. **Тест ASR**: 5-секундный wav → реальное время обработки (RTF).
6. **Тест аудио-латентности**: запись→обработка→воспроизведение, чтобы понять, нужен ли
   меньший буфер (и не будет ли щелчков).

Результат — `profile.json`:

```jsonc
{
  "fingerprint": "sha256(cpu|gpu|ram|disk|os|driver)",
  "capturedAt": "2026-11-08T11:40:00Z",
  "tier": "T2",
  "cpu": { "model": "...", "threads": 16, "avx2": true, "avx512": false, "memBandwidthGBs": 41.2 },
  "ram": { "totalGB": 32, "availableGB": 21.4 },
  "gpu": [{ "vendor": "nvidia", "name": "RTX 4060 Laptop", "vramGB": 8, "sharedGB": 7.9,
            "tokPerSec7B": 38.5, "backend": "cuda" }],
  "npu": { "present": true, "vendor": "intel", "via": "openvino" },
  "disk": { "type": "nvme", "readMBs": 2400, "freeGB": 210 },
  "audio": { "inLatencyMs": 42, "outLatencyMs": 30 },
  "bench": { "asrRtf": 0.28, "llmTokPerSec": { "1.7B_q4": 74, "8B_q4": 12.4 } },
  "limits": { "ramPct": 60, "vramPct": 70, "cpuPct": 50, "threadsForInference": 12 }
}
```

## 2. Как считаются бюджеты (формулы, не магия)

**Вес модели в памяти** (GGUF, квант `Qx`):

```
bytes ≈ params × bytesPerWeight × 1.02   // + служебные тензоры
Q4_K_M ≈ 0.56 Б/параметр · Q5_K_M ≈ 0.70 · Q6_K ≈ 0.82 · Q8_0 ≈ 1.06 · F16 = 2.0
```

| Модель | Q4_K_M | Q8_0 | F16 |
| --- | --- | --- | --- |
| 0.6B | 0.4 ГБ | 0.7 ГБ | 1.2 ГБ |
| 1.7B | 1.1 ГБ | 1.9 ГБ | 3.4 ГБ |
| 3B | 1.9 ГБ | 3.3 ГБ | 6.0 ГБ |
| 4B | 2.4 ГБ | 4.4 ГБ | 8.0 ГБ |
| 8B | 4.7 ГБ | 8.6 ГБ | 16.0 ГБ |
| 14B | 8.4 ГБ | 15 ГБ | 28 ГБ |
| 30B-A3B (MoE) | 18 ГБ (активно ~3B) | 32 ГБ | 60 ГБ |

**KV-кэш** (главный скрытый пожиратель VRAM):

```
bytes/token ≈ 2 (K и V) × n_layers × n_kv_heads × head_dim × bytes_per_element
           ≈ 2 × n_layers × hidden_size_KV × 2 байта (f16)
```

Пример: 4B-модель, 36 слоёв, GQA 8 KV-голов × 128 → ≈ 144 КБ/токен →
8k контекст ≈ **1.15 ГБ**, 32k ≈ 4.6 ГБ. Поэтому «контекст побольше» часто важнее, чем
«модель побольше»: на 8 ГБ VRAM 4B с 16k контекстом полезнее, чем 8B с 2k.

**Правило подбора**: `weights + kv(desiredCtx) + 0.8 ГБ overhead ≤ vramLimit`.
Если не влезает — сначала урезать контекст, потом квант (Q4→Q3 при экстремуме), потом модель.

**Число потоков**: `min(physicalCores - 1, 8)` для CPU-инференса; больше — не быстрее
(память упирается), но системой становится некомфортно.

**Ожидаемая скорость (CPU, оценка)**: `tok/s ≈ bandwidth_GBs / (bytesPerWeight × params_B) × 0.35`.
Для 8 ГБ/с и 1.7B Q4 (≈1 ГБ): 8/1 × 0.35 ≈ 2.8 tok/s — то есть на старом ноутбуке 8B
Q4 будет ~0.6 tok/s, что неприемлемо. Отсюда: на T0/T1 — только 0.6–1.7B, остальное
делегируется правилам/скиллам.

## 3. Определение Tier

```ts
tier = T0
if (ramGB >= 8  && (avx2 || gpu))                    tier = T1
if (ramGB >= 16 && (vramGB >= 6 || cpuCores >= 8))    tier = T2
if (ramGB >= 32 && (vramGB >= 12 || npu))             tier = T3
// поправки:
if (disk.type === "hdd")      → запретить модели > 4 ГБ в «горячем» наборе
if (isVM && vramGB < 4)       → tier = min(tier, T1)
if (bench.llmTokPerSec.8B < 3) → tier = min(tier, T1)   // даже если VRAM хватает
```

Ключевое: **tier определяется не паспортом, а замером**. Бывает 16 ГБ VRAM и 9 tok/s из-за
throttling ноутбука — и это T1 по факту.

## 4. Что подбирается автоматически

| Параметр | Как выбирается |
| --- | --- |
| Набор моделей | по tier + свободной RAM/VRAM + наличию диска |
| Квант | Q4_K_M по умолчанию; Q5/Q6 если есть запас VRAM; Q3 только в аварийном режиме |
| `n_gpu_layers` | бинарный поиск по VRAM до первого OOM (с кэшированием результата) |
| Контекст | `min(модельMax, 4096×k)` где k подбирается под бюджет KV |
| Потоки | по числу физ. ядер, минус 1, максимум 8 |
| Размер аудио-буфера | по замеренной латентности (цель: ≤ 100 мс до partial-результата) |
| Политика троттлинга | если CPU/GPU занят играми > 80 % — пауза тяжёлых задач |

## 5. Мониторинг в рантайме

- `si.currentLoad()`, `si.mem()`, `mem.graphics()`, `nvidia-smi --query-gpu` раз в 2 с.
- Триггеры: RAM > 60 %, VRAM > 70 %, температура > 85 °C (LibreHardwareMonitor), батарея < 30 %.
- Реакции: выгрузить LRU-модель → понизить tier задач → пауза фоновых джобов → уведомление.
- **Уважение к пользователю**: если в фокусе полноэкранное приложение (игра/видео) — фоновый
  инференс приостанавливается, кроме явно запрошенных задач.

## 6. Реализация: порядок и код

```ts
// kernel/hardware/probe.ts
const staticInfo = await Promise.all([si.cpu(), si.mem(), si.graphics(), si.diskLayout(),
                                      si.fsSize(), si.osInfo(), si.battery(), psCim()]);
const previous = await loadProfile();
if (previous?.fingerprint === fingerprintOf(staticInfo)) return previous; // калибровку не повторяем
const bench = await runCalibration({ budgetMs: 9000, skipGpuIfNoVram: true });
const profile = buildProfile(staticInfo, bench);
await saveProfile(profile);
```

Практические мелочи, на которых обычно спотыкаются:
- `si.graphics()` на гибридных ноутбуках отдаёт **оба** адаптера и часто занижает VRAM —
  сверять с `nvidia-smi` и реестром.
- `Win32_VideoController.AdapterRAM` — 32-битное поле, врёт для > 4 ГБ; брать `nvidia-smi`
  или DXGI `DedicatedVideoMemory` (через нативный вызов).
- PowerShell может быть отключён политикой → держать fallback на чистом Node + WMI через
  нативный модуль, и **никогда не блокировать старт приложения** из-за провала сбора данных.
- Антивирус может блокировать запуск `nvidia-smi` → таймаут 800 мс и деградация.
- Профиль кэшируется по `fingerprint`; при обновлении драйвера — пересчёт GPU-части.

## 7. Источники в vault

| Тема | Файл |
| --- | --- |
| `systeminformation` (основной источник статики) | `sources/windows-automation/npm__systeminformation.md` |
| Датчики/температуры Windows | `sources/windows-automation/LibreHardwareMonitor__LibreHardwareMonitor/README.md` |
| GPU-мониторинг (Python) | `sources/windows-automation/pypi__gpustat.md`, `pypi__nvidia-ml-py.md` |
| CPU/GPU инфо через WMI/CIM | `sources/windows-automation/PowerShell__PowerShell/README.md`, `MicrosoftDocs__win32/` |
| Windows AI стек (NPU/Phi Silica/Foundry Local) | заметка `04-runtimes.md` §5 |
| llama.cpp: как считается VRAM и слои | `sources/inference-runtimes/ggml-org__llama.cpp/files/docs__build.md` |

## 8. Открытые вопросы

- Нужен ли отдельный «профиль пользователя» (когда он работает, играет, на батарее) — да,
  но собирать его только локально и агрегированно.
- Паспортный `AdapterRAM` vs DXGI: обязательно проверить на 3–4 разных машинах, включая
  ноутбук с Optimus и ПК с 24 ГБ.
- Сколько времени допустимо на первичную калибровку? Гипотеза: ≤ 8 с, с прогресс-баром
  «настраиваюсь под ваш компьютер» (это ещё и хороший первый экран).
