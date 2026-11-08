# Профили приложений: слой «как именно»

Реестр действий ([`docs/ACTIONS.md`](ACTIONS.md)) отвечает на вопрос **что** умеет ZShelper.
Профиль отвечает на вопрос **как** это сделать в конкретной программе: якоря, шаги,
проверка результата, поведение при провале.

Файл генерируется `python3 tools/profiles.py`; руками не править.

**Профилей: 25** · операций: **155** · проблем: **0**

Правила (проверяются автоматически, ошибка = ненулевой код возврата):

1. каждая операция ссылается на существующую строку реестра `domain|verb`;
2. профиль не может **занизить** риск относительно реестра;
3. у каждой операции есть **проверка результата** — «нажал» не значит «получилось».

## Профили

| Приложение | Процесс | Стек | Версия | Проверен | Якорей | Операций | Файл |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1С:Предприятие 8 (тонкий/толстый клиент) | `1cv8.exe, 1cv8c.exe` | win32 | 8.3.x (2026-11) | 2026-11-08 | 5 | 6 | `1c.json` |
| 7-Zip | `7zFM.exe, 7z.exe, 7zG.exe` | win32 | 24.x (2026-11) | 2026-11-08 | 2 | 4 | `7zip.json` |
| Adobe Photoshop | `Photoshop.exe` | win32 | 2026 (v27) | 2026-11-08 | 8 | 8 | `photoshop.json` |
| Adobe Premiere Pro | `Adobe Premiere Pro.exe` | win32 | 2026 (v26) | 2026-11-08 | 8 | 7 | `premiere.json` |
| Blender | `blender.exe` | qt | 4.x (2026-11) | 2026-11-08 | 3 | 5 | `blender.json` |
| CapCut (Desktop) | `CapCut.exe` | electron | 6.x (2026-11) | 2026-11-08 | 6 | 9 | `capcut.json` |
| Chrome / Edge / Yandex (Chromium) | `chrome.exe, msedge.exe, browser.exe` | web | Chrome 131+ / Edge 131+ | 2026-11-08 | 7 | 8 | `browser.json` |
| Discord (desktop) | `Discord.exe` | electron | 0.0.9x (2026-11) | 2026-11-08 | 5 | 6 | `discord.json` |
| FL Studio | `FL64.exe, FL.exe` | win32 | FL Studio 2024/2025 (2026-11) | 2026-11-08 | 8 | 6 | `flstudio.json` |
| Figma (desktop / web) | `Figma.exe, chrome.exe` | web | 2026-11 | 2026-11-08 | 6 | 6 | `figma.json` |
| Git for Windows (git-bash / git.exe) | `git-bash.exe, git.exe, bash.exe` | win32 | 2.4x (2026-11) | 2026-11-08 | 2 | 5 | `git-bash.json` |
| HandBrake | `HandBrake.exe, HandBrakeCLI.exe` | win32 | 1.9.x (2026-11) | 2026-11-08 | 2 | 4 | `handbrake.json` |
| Microsoft Excel | `EXCEL.EXE` | uia | Microsoft 365 (2026-11) | 2026-11-08 | 4 | 8 | `excel.json` |
| Microsoft Outlook (классический и новый) | `OUTLOOK.EXE, olk.exe` | uia | Microsoft 365 (2026-11) | 2026-11-08 | 8 | 7 | `outlook.json` |
| Microsoft Word | `WINWORD.EXE` | uia | Microsoft 365 (2026-11) | 2026-11-08 | 7 | 8 | `word.json` |
| OBS Studio | `obs64.exe` | qt | 31.x (2026-11) | 2026-11-08 | 7 | 7 | `obs.json` |
| PowerShell 7 / Windows PowerShell | `pwsh.exe, powershell.exe` | win32 | 7.5 / 5.1 (2026-11) | 2026-11-08 | 3 | 5 | `powershell.json` |
| REAPER | `reaper.exe` | win32 | 7.x (2026-11) | 2026-11-08 | 4 | 5 | `reaper.json` |
| Steam | `steam.exe, steamwebhelper.exe` | electron | 2026-11 | 2026-11-08 | 6 | 6 | `steam.json` |
| Telegram Desktop | `Telegram.exe` | qt | 5.x (2026-11) | 2026-11-08 | 5 | 6 | `telegram.json` |
| VLC media player | `vlc.exe` | win32 | 3.0.x (2026-11) | 2026-11-08 | 4 | 5 | `vlc.json` |
| Visual Studio Code | `Code.exe` | electron | 1.9x (2026-11) | 2026-11-08 | 7 | 7 | `vscode.json` |
| Банк (веб-кабинет и десктоп-клиент) — только чтение | `chrome.exe, msedge.exe, browser.exe` | web | 2026-11 | 2026-11-08 | 5 | 6 | `bank.json` |
| Командная строка (cmd.exe) и пакетные файлы | `cmd.exe` | win32 | Windows 10/11 (2026-11) | 2026-11-08 | 2 | 4 | `cmd.json` |
| Проводник Windows | `explorer.exe` | uia | Windows 11 24H2 / Windows 10 22H2 | 2026-11-08 | 6 | 7 | `explorer.json` |

## Риск операций

- `write-local` — 95
- `read` — 39
- `external` — 14
- `destructive` — 5
- `money` — 1
- `identity` — 1

## Покрытие доменов реестра

- `video` — 26
- `files` — 13
- `chat-social` — 12
- `dev-code` — 12
- `music-production` — 10
- `creative-3d` — 8
- `web` — 8
- `images` — 8
- `text-docs` — 8
- `email` — 7
- `business-finance` — 6
- `personal-finance` — 6
- `games` — 6
- `sheets-data` — 5
- `automation` — 5
- `video-production` — 3
- `processes-services` — 3
- `audio` — 3
- `apps-windows` — 2
- `engineering-3d` — 1
- `distribution` — 1
- `slides-pdf-print` — 1
- `accessibility` — 1

## Проблемы

Нет. Все ссылки на реестр валидны, риски не занижены, проверки на месте.

## Чего профили не делают

- **Не заменяют реестр**: операция без строки в реестре невозможна по определению.
- **Не содержат секретов**: пароли и токены берутся из `secrets.enc` / persistent-профиля.
- **Не хардкодят координаты** там, где есть UIA-якорь: пиксели ломаются при смене темы и DPI.
- **Не считаются вечными**: поле `verified_at` — обещание перепроверки после обновления приложения.

## Как добавить профиль

1. Записать (если ещё нет) действия в `data/actions.psv` → `python3 tools/actions.py`.
2. Скопировать `data/profiles/capcut.json` как шаблон.
3. Пройти 5–8 операций руками, записав якоря и проверки.
4. `python3 tools/profiles.py` — ноль ошибок.
5. Добавить в eval-набор сценарий «приложение обновилось → якорь не найден → агент не врёт».
