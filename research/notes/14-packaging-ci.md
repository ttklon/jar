# 14 — Сборка, подпись, автообновление и GitHub Actions

Требование R-25 + «GitHub Action безлимитен — нашпигуй по максимуму».

## 1. Что собираем

| Артефакт | Зачем | Инструмент |
| --- | --- | --- |
| `ThisHelper-Setup-x.y.z.exe` (NSIS, x64) | основной установщик | electron-builder `nsis` |
| `ThisHelper-x.y.z-portable.exe` | «запустить без установки» | electron-builder `portable` |
| `.msi`/MSIX (опционально) | корпоративная установка | electron-builder `msi` / `msix` |
| `*.zip` + `latest.yml` | ручное обновление | electron-builder |
| SBOM (`sbom.spdx.json`) | прозрачность зависимостей | `anchore/sbom-action` |
| `SHA256SUMS` + подписи | проверка целостности | собственный шаг |

Поддержка: Windows 10 1809+ и 11, x64 (arm64 — отдельная матрица, если найдётся время).

## 2. Структура установки

```
%LOCALAPPDATA%\Programs\ThisHelper\
├── ThisHelper.exe
├── resources\app.asar            # код
├── resources\bin\{llama-server,whisper,fmpeg}.exe   # нативные бинарники
├── resources\models\             # НЕ в установщике — качаются при первом запуске
└── resources\licenses\           # тексты лицензий всех компонентов
%APPDATA%\ThisHelper\             # данные пользователя (см. 01-architecture.md)
```

Решения:
- **Модели не входят в установщик** (0.5–8 ГБ) — качаются с прогрессом и проверкой sha256.
- Бинарники (llama.cpp, ffmpeg, whisper) — в установщике: первый запуск не должен требовать
  `npx`/`pip`.
- Установка **per-user** по умолчанию (без UAC); per-machine — опцией для админов.
- Antivirus-дружелюбность: подпись, отсутствие «самораспаковывающихся» скриптов, стабильные пути.

## 3. Подпись кода (без неё SmartScreen будет пугать)

- **EV/OV-сертификат** или облачная подпись (Azure Trusted Signing / SignPath) — идеально.
- Если сертификата нет (проект бесплатный, личный): собираем **неподписанные** сборки,
  но: (а) публикуем SHA256, (б) пишем честно «SmartScreen предупредит, это нормально»,
  (в) даём portable-вариант, (г) добавляем инструкцию «Подробнее → Выполнить всё равно».
- `electron-builder` + `signtool` для подписи exe и установщика; подпись **бинарников тоже**.

## 4. Автообновление

- `electron-updater` + GitHub Releases (`latest.yml`) — бесплатно и без сервера.
- Каналы: `stable` / `beta` (pre-release в GitHub).
- **Дифференциальные обновления** (blockmap) — экономия трафика.
- Правила:
  - проверка раз в 6 часов + по кнопке;
  - никогда не перезапускать во время задачи: «обновление готово, применить после завершения»;
  - откат на предыдущую версию из меню (держим один предыдущий установщик);
  - миграции БД — вперёд-совместимые, с бэкапом `data.db` перед обновлением.

## 5. CI: GitHub Actions (максимум пользы, минимум времени)

```yaml
# .github/workflows/ci.yml — концепт
name: ci
on:
  push: { branches: [main], paths-ignore: ['research/**', 'docs/**'] }
  pull_request:
  workflow_dispatch:
concurrency: { group: ci-${{ github.ref }}, cancel-in-progress: true }
jobs:
  lint-typecheck:
    runs-on: windows-latest
    steps: [checkout, setup-node(22, cache: pnpm), pnpm i --frozen-lockfile,
            pnpm lint, pnpm typecheck, pnpm format:check]
  test:
    runs-on: windows-latest
    strategy: { matrix: { shard: [1,2] } }
    steps: [..., pnpm test -- --shard=${{matrix.shard}}]
  build:
    needs: [lint-typecheck]
    runs-on: windows-latest
    steps: [..., pnpm build, electron-builder --dir, upload-artifact]
  e2e:
    needs: [build]
    runs-on: windows-latest
    steps: [playwright install, pnpm test:e2e]     # Playwright _Electron
  package:
    if: startsWith(github.ref, 'refs/tags/v')
    needs: [test, e2e]
    runs-on: windows-latest
    permissions: { contents: write, id-token: write, attestations: write }
    steps:
      - pnpm build && electron-builder --publish never
      - softprops/action-gh-release@v2
      - actions/attest-build-provenance@v2
      - anchore/sbom-action@v0
  security:
    runs-on: ubuntu-latest
    steps: [gitleaks, trivy fs, osv-scanner, codeql]
```

Дополнительно (все бесплатны в публичном репо):
- `codeql` (SAST для JS/TS), `dependency-review-action` на PR, `renovate`/dependabot,
- `harden-runner` (egress-аудит), `scorecard`,
- кэш `pnpm store` и `electron` (иначе сборка на Windows ~8 мин),
- матрица `windows-latest` только (Linux/macOS не цель — не тратим минуты),
- `paths-ignore` для `research/**` — иначе каждая правка заметки пересобирает приложение.

## 6. Тесты в CI

| Уровень | Что | Время |
| --- | --- | --- |
| unit (vitest) | планировщик, политики, парсеры, бюджет памяти, retrieval | < 60 с |
| contract | схемы инструментов, MCP-клиент против фейкового сервера | < 60 с |
| integration | SQLite-миграции, очередь задач, восстановление после «краха» | < 120 с |
| e2e (Playwright + Electron) | запуск приложения, первый экран, создание папки (мок), подтверждения | 3–5 мин |
| security | набор prompt-injection атак, policy-тесты, gitleaks | < 60 с |
| perf-smoke | старт < 4 с, память в простое < 350 МБ | < 60 с |

Все тесты — на Windows-раннере: нативные модули ведут себя иначе.

## 7. Релизный процесс

1. `main` защищён: PR + 1 review (или self-review с чеклистом) + зелёный CI.
2. Conventional Commits → `release-please` создаёт PR с CHANGELOG и версией.
3. Merge → тег → сборка → артефакты + `latest.yml` + SBOM + аттестация → Release.
4. Проверка «дымом» на чистой ВМ (Windows 10 и 11) — ручной чеклист из 10 пунктов.
5. Публикация: GitHub Releases (основное), зеркала — по желанию.

## 8. Гигиена репозитория

- `.gitignore`: `node_modules`, `dist`, `out`, `release`, `models/`, `artifacts/`, `*.gguf`,
  `*.db`, `.env*`, `research/**/_cache*` (по необходимости).
- `research/**` — в репозитории (это ценный актив), но без бинарников и без «сырых» дампов > 1 МБ.
- LICENSE: код — MIT (или Apache-2.0); модели — их собственные лицензии в `NOTICE`.
- `SECURITY.md`: как сообщить об уязвимости; политика «агент не должен уметь X».
- `CONTRIBUTING.md`: как добавить скилл/MCP-сервер/модель в каталог.
- `docs/decisions/ADR-*.md`: архитектурные решения (см. `16-open-questions.md`).

## 9. Локальная сборка (то, что должно работать у пользователя-разработчика)

```powershell
corepack enable
pnpm install
pnpm run rebuild        # @electron/rebuild для нативных модулей
pnpm dev                # electron-vite dev
pnpm build && pnpm dist # установщик в ./release
```

Требования: Node 22+, pnpm 9+, Windows 10/11, ~2 ГБ свободного места,
(для нативных модулей) Visual Studio Build Tools + Python 3.11.

## 10. Источники в vault

| Тема | Файл |
| --- | --- |
| electron-builder (конфиг, NSIS, автообновление) | `sources/electron-shell/electron-userland__electron-builder/README.md` |
| electron-vite | `sources/electron-shell/alex8088__electron-vite/README.md` |
| electron-rebuild / fuses | `sources/electron-shell/electron__rebuild/`, `electron__fuses/` |
| electron/windows-sign | `sources/electron-shell/electron__windows-sign/README.md` |
| Шаблон vite-electron-builder (лучшие практики) | `sources/packaging-and-ci/cawa-93__vite-electron-builder/README.md` |
| Релиз-автоматизация | `sources/packaging-and-ci/googleapis__release-please/`, `semantic-release__semantic-release/`, `softprops__action-gh-release/` |
| Артефакты/аттестации | `sources/packaging-and-ci/actions__attest-build-provenance/`, `anchore__sbom-action/` |
| Scaners | `sources/safety-and-security/gitleaks__gitleaks/`, `aquasecurity__trivy/`, `google__osv-scanner/` |
| Windows runner образы | `sources/packaging-and-ci/actions__runner-images/README.md` |

## 11. Открытые вопросы

- Подпись: без сертификата SmartScreen будет «Неизвестный издатель». Нужен честный экран
  первого запуска с объяснением и хешами. Рассмотреть SignPath (бесплатно для OSS).
- Ставить ли бинарники llama.cpp в репозиторий через Git LFS или качать в CI из релизов
  llama.cpp (пиннинг версии + sha256)? Гипотеза: качать в CI, кэшировать.
- Нужен ли arm64-билд (Snapdragon X)? Растёт быстро; отложить до v1.2.
