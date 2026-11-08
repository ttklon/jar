# Зависимости v1 — предложение и аудит лицензий

_Сгенерировано из исследовательского vault (`python3 tools/deps_report.py`). Версии — последние на момент сбора источников; при старте кода фиксируем точные._

Правило проекта: в бандл идут только **MIT / Apache-2.0 / BSD / ISC / MPL-2.0 / CC-BY-4.0**. GPL/AGPL — только отдельными процессами по желанию пользователя (и никогда не линкуются).

## Оболочка и сборка

| Пакет | Версия | Лицензия | Зачем |
| --- | --- | --- | --- |
| `electron` | 45.2.3 | ✅ `MIT` | рантайм десктопа |
| `electron-vite` | 6.0.0 | ✅ `MIT` | dev/сборка main+preload+renderer |
| `electron-builder` | 26.18.0 | ✅ `MIT` | установщик NSIS/portable, автообновление |
| `electron-updater` | 6.8.11 | ✅ `MIT` | обновления через GitHub Releases |
| `typescript` | 7.0.2 | ✅ `Apache-2.0` | строгая типизация |
| `vite` | 8.3.6 | ✅ `MIT` | бандлер |
| `@vitejs/plugin-react` | 6.2.1 | ✅ `MIT` | React в vite |
| `esbuild` | 0.28.2 | ✅ `MIT` | быстрые сборки скриптов |
| `tsup` | 9.0.0 | ✅ `MIT` | сборка библиотек/воркеров |
| `concurrently` | 10.0.7 | ✅ `MIT` | параллельные dev-процессы |
| `cross-env` | 10.1.0 | ✅ `MIT` | кроссплатформенные env (Windows!) |
| `rimraf` | 6.1.4 | ✅ `BlueOak-1.0.0` | чистка артефактов |
| `husky` | 9.1.7 | ✅ `MIT` | git-хуки |
| `lint-staged` | 17.6.0 | ✅ `MIT` | линт изменённых файлов |
| `prettier` | 3.9.10 | ✅ `MIT` | форматирование |
| `eslint` | 10.14.0 | ✅ `MIT` | линт |
| `@biomejs/biome` | 2.6.6 | ❓ `MIT OR Apache-2.0` | быстрый линт/формат (альтернатива) |

## UI

| Пакет | Версия | Лицензия | Зачем |
| --- | --- | --- | --- |
| `react` | 19.3.1 | ✅ `MIT` | интерфейс |
| `react-dom` | 19.3.1 | ✅ `MIT` | рендер |
| `tailwindcss` | 4.3.5 | ✅ `MIT` | стили |
| `tailwind-merge` | 3.7.0 | ✅ `MIT` | мерж классов |
| `clsx` | 2.1.1 | ✅ `MIT` | условные классы |
| `class-variance-authority` | 0.7.1 | ✅ `Apache-2.0` | варианты компонентов |
| `@radix-ui/react-dialog` | 1.3.1 | ✅ `MIT` | доступные примитивы |
| `@radix-ui/react-tooltip` | 1.4.1 | ✅ `MIT` | подсказки |
| `@radix-ui/react-dropdown-menu` | 2.2.1 | ✅ `MIT` | меню |
| `@radix-ui/react-tabs` | 1.2.1 | ✅ `MIT` | табы |
| `@radix-ui/react-popover` | 1.3.1 | ✅ `MIT` | поповеры |
| `@radix-ui/react-scroll-area` | 1.4.0 | ✅ `MIT` | скролл |
| `@radix-ui/react-switch` | 1.4.1 | ✅ `MIT` | переключатели |
| `@radix-ui/react-slider` | 1.6.1 | ✅ `MIT` | слайдеры |
| `@radix-ui/react-progress` | 1.2.1 | ✅ `MIT` | прогресс |
| `@radix-ui/react-toast` | 1.3.1 | ✅ `MIT` | тосты |
| `@radix-ui/react-separator` | 1.2.0 | ✅ `MIT` | разделители |
| `@radix-ui/react-accordion` | 1.3.1 | ✅ `MIT` | аккордеоны |
| `@radix-ui/react-select` | 2.4.1 | ✅ `MIT` | селекты |
| `@radix-ui/react-avatar` | 1.3.1 | ✅ `MIT` | аватары |
| `motion` | 14.10.1 | ✅ `MIT` | анимации |
| `lucide-react` | 1.70.0 | ✅ `ISC` | иконки |
| `zustand` | 5.1.0 | ✅ `MIT` | состояние |
| `@tanstack/react-query` | 5.107.1 | ✅ `MIT` | серверное состояние/кэш |
| `@tanstack/react-virtual` | 3.14.26 | ✅ `MIT` | виртуализация длинных логов |
| `@tanstack/react-table` | 9.3.1 | ✅ `MIT` | таблицы |
| `recharts` | 3.10.1 | ✅ `MIT` | графики метрик |
| `cmdk` | 1.1.1 | ✅ `MIT` | палитра команд |
| `sonner` | 2.0.8 | ✅ `MIT` | уведомления |
| `react-markdown` | 10.1.0 | ✅ `MIT` | рендер отчётов |
| `remark-gfm` | 4.0.1 | ✅ `MIT` | GFM в markdown |
| `rehype-highlight` | 7.0.2 | ✅ `MIT` | подсветка кода |
| `dompurify` | 3.4.17 | ❓ `(MPL-2.0 OR Apache-2.0)` | XSS-защита markdown/HTML |
| `fuse.js` | 7.5.0 | ✅ `Apache-2.0` | fuzzy-поиск по командам/файлам |
| `i18next` | 27.0.1 | ✅ `MIT` | локализация |
| `react-i18next` | 18.0.0 | ✅ `MIT` | локализация React |
| `date-fns` | 4.4.0 | ✅ `MIT` | даты |
| `react-hook-form` | 7.91.0 | ✅ `MIT` | формы настроек |
| `@hookform/resolvers` | 7.0.3 | ✅ `MIT` | формы + zod |
| `monaco-editor` | 0.57.0 | ✅ `MIT` | просмотр кода и diff |
| `xterm` | 5.3.0 | ✅ `MIT` | встроенный терминал агента |
| `@xterm/addon-fit` | 0.11.0 | ✅ `MIT` | вписывание терминала |

## Ядро и данные

| Пакет | Версия | Лицензия | Зачем |
| --- | --- | --- | --- |
| `zod` | 4.6.7 | ✅ `MIT` | схемы контрактов и инструментов |
| `better-sqlite3` | 13.0.3 | ✅ `MIT` | основная БД (синхронная, быстрая) |
| `sqlite-vec` | 0.1.9 | ❓ `MIT OR Apache` | векторный поиск в том же файле |
| `drizzle-orm` | 0.45.4 | ✅ `Apache-2.0` | миграции/типизированные запросы |
| `kysely` | 0.29.8 | ✅ `MIT` | альтернатива query builder |
| `pino` | 10.4.0 | ✅ `MIT` | структурные логи |
| `pino-pretty` | 13.2.0 | ✅ `MIT` | читаемые логи в dev |
| `electron-log` | 5.4.4 | ✅ `MIT` | логи в файлы из main |
| `electron-store` | 12.0.0 | ✅ `MIT` | настройки (не секреты!) |
| `p-queue` | 10.0.0 | ✅ `MIT` | конкурентность задач |
| `p-retry` | 9.0.0 | ✅ `MIT` | повторы с бэкоффом |
| `bree` | 9.2.9 | ✅ `MIT` | планировщик в процессе |
| `croner` | — | ❓ нет в vault | cron-расписания |
| `execa` | 10.2.1 | ✅ `MIT` | запуск процессов |
| `tree-kill` | 1.2.2 | ✅ `MIT` | убийство дерева процессов (Windows) |
| `ps-list` | 9.0.0 | ✅ `MIT` | список процессов |
| `pidusage` | 4.1.0 | ✅ `MIT` | ресурсы процессов |
| `chokidar` | 6.0.0 | ✅ `MIT` | наблюдение за файлами |
| `fs-extra` | 11.4.1 | ✅ `MIT` | ФС-утилиты |
| `fast-glob` | 3.3.3 | ✅ `MIT` | поиск файлов |
| `archiver` | 8.0.0 | ✅ `MIT` | архивы |
| `adm-zip` | 0.6.1 | ✅ `MIT` | zip |
| `yauzl` | 3.4.0 | ✅ `MIT` | чтение zip |
| `tar` | 7.5.22 | ✅ `BlueOak-1.0.0` | tar-архивы |
| `undici` | 8.12.4 | ✅ `MIT` | HTTP-клиент |
| `ws` | 8.22.1 | ✅ `MIT` | websocket |

## Модели и инференс

| Пакет | Версия | Лицензия | Зачем |
| --- | --- | --- | --- |
| `node-llama-cpp` | 3.22.3 | ✅ `MIT` | лёгкий путь к llama.cpp в воркере |
| `onnxruntime-node` | 1.31.1 | ✅ `MIT` | ONNX для ASR/OCR/embed/VAD |
| `@huggingface/transformers` | 4.3.2 | ✅ `Apache-2.0` | transformers.js (мелкие модели) |
| `@modelcontextprotocol/sdk` | 1.32.2 | ✅ `MIT` | MCP-клиент/сервер |
| `sherpa-onnx-node` | 2.0.1 | ✅ `Apache-2.0` | ASR/TTS/KWS в одном рантайме |
| `piscina` | 5.3.2 | ✅ `MIT` | пул воркеров для CPU-задач |
| `@dqbd/tiktoken` | 1.0.22 | ✅ `MIT` | подсчёт токенов |
| `gpt-tokenizer` | 4.1.0 | ✅ `MIT` | токенайзер без нативных зависимостей |
| `sharp` | 0.35.5 | ✅ `Apache-2.0` | изображения/скриншоты |
| `tesseract.js` | 7.0.0 | ✅ `Apache-2.0` | OCR-fallback |
| `ffmpeg-static` | 5.3.0 | ❓ `GPL-3.0-or-later` | ffmpeg без установки |
| `fluent-ffmpeg` | 2.1.3 | ✅ `MIT` | удобный ffmpeg API |

## Windows: руки и глаза

| Пакет | Версия | Лицензия | Зачем |
| --- | --- | --- | --- |
| `uiohook-napi` | 1.5.5 | ✅ `MIT` | глобальные хоткеи |
| `@nut-tree-fork/nut-js` | 4.2.6 | ✅ `Apache-2.0` | ввод/скриншоты (прототип) |
| `node-window-manager` | 2.2.4 | ✅ `MIT` | окна Windows |
| `active-win` | 9.0.0 | ✅ `MIT` | активное окно |
| `screenshot-desktop` | 1.15.8 | ✅ `MIT` | захват экрана |
| `clipboardy` | 5.3.2 | ✅ `MIT` | буфер обмена |
| `node-pty` | 1.1.0 | ✅ `MIT` | терминал (ConPTY) |
| `koffi` | 3.3.7 | ✅ `MIT` | FFI для Win32 (альтернатива нативному модулю) |
| `regedit` | 5.1.4 | ✅ `MIT` | реестр |
| `systeminformation` | 5.33.19 | ✅ `MIT` | железо/ОС |
| `ps-list` | 9.0.0 | ✅ `MIT` | процессы |
| `officeparser` | 8.6.0 | ✅ `MIT` | текст из docx/pptx/xlsx/pdf |
| `exceljs` | 4.4.0 | ✅ `MIT` | Excel |
| `docx` | 9.15.3 | ✅ `MIT` | генерация Word |
| `pdf-lib` | 1.17.1 | ✅ `MIT` | PDF-манипуляции |
| `pdf-parse` | 2.4.5 | ✅ `Apache-2.0` | текст из PDF |
| `mammoth` | 1.13.0 | ✅ `BSD-2-Clause` | docx → html/markdown |
| `xlsx` | 0.18.5 | ✅ `Apache-2.0` | чтение/запись таблиц |

## Коннекторы

| Пакет | Версия | Лицензия | Зачем |
| --- | --- | --- | --- |
| `grammy` | 1.46.0 | ✅ `MIT` | Telegram-бот |
| `telegraf` | 4.16.3 | ✅ `MIT` | альтернатива Telegram |
| `googleapis` | 189.0.0 | ✅ `Apache-2.0` | Google Calendar/Gmail/Drive |
| `google-auth-library` | 11.3.3 | ✅ `Apache-2.0` | OAuth для Google |
| `imapflow` | 2.11.0 | ✅ `MIT` | почта IMAP |
| `nodemailer` | 10.4.0 | ❓ `MIT-0` | SMTP/черновики |
| `mailparser` | 3.14.2 | ✅ `MIT` | разбор писем |
| `ical-generator` | 11.1.3 | ✅ `MIT` | ICS-события |
| `rss-parser` | 3.13.0 | ✅ `MIT` | RSS |
| `mqtt` | 5.16.1 | ✅ `MIT` | умный дом |
| `@slack/web-api` | 8.3.0 | ✅ `MIT` | Slack |
| `keytar` | 7.9.0 | ✅ `MIT` | секреты (или safeStorage) |
| `@napi-rs/keyring` | 2.1.2 | ✅ `MIT` | Credential Manager |

## Тесты и качество

| Пакет | Версия | Лицензия | Зачем |
| --- | --- | --- | --- |
| `vitest` | 5.1.0 | ✅ `MIT` | юнит-тесты |
| `@testing-library/react` | 16.3.3 | ✅ `MIT` | тесты UI |
| `@testing-library/user-event` | 14.6.8 | ✅ `MIT` | события UI |
| `jsdom` | 31.0.0 | ✅ `MIT` | DOM в тестах |
| `playwright` | 1.65.0 | ✅ `Apache-2.0` | e2e (Electron) |
| `@playwright/test` | 1.65.0 | ✅ `Apache-2.0` | раннер e2e |
| `eslint` | 10.14.0 | ✅ `MIT` | линт |
| `@typescript-eslint/parser` | 8.72.1 | ✅ `MIT` | TS-линт |
| `@typescript-eslint/eslint-plugin` | 8.72.1 | ✅ `MIT` | правила TS |
| `dependency-cruiser` | 18.7.2 | ✅ `MIT` | архитектурные границы модулей |
| `@types/node` | 26.6.6 | ✅ `MIT` | типы Node |
| `tsx` | 4.23.15 | ✅ `MIT` | запуск TS без сборки |

## Лицензионная картина по всему vault (npm+PyPI)

| Лицензия | Пакетов |
| --- | --- |
| MIT | 308 |
| не указана | 160 |
| Apache-2.0 | 83 |
| BSD-3-Clause | 23 |
| ISC | 11 |
| BSD-2-Clause | 6 |
| NOASSERTION | 4 |
| GPL-3.0-or-later | 3 |
| MPL-2.0 | 3 |
| Apache License, Version 2.0 | 3 |
| LGPL-3.0 | 3 |
| Unlicense | 2 |
| BlueOak-1.0.0 | 2 |
| Apache-2.0 OR MIT | 2 |
| PSF | 1 |

Всего пакетов в vault: **663**. Не найдено в vault (дозакачать): 1.

## Не найдено в vault

- `npm:croner`

