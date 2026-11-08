# Профили приложений: слой «как именно»

Реестр действий ([`docs/ACTIONS.md`](ACTIONS.md)) отвечает на вопрос **что** умеет ZShelper.
Профиль отвечает на вопрос **как** это сделать в конкретной программе: якоря, шаги,
проверка результата, поведение при провале.

Файл генерируется `python3 tools/profiles.py`; руками не править.

**Профилей: 58** · операций: **344** · проблем: **0**

Правила (проверяются автоматически, ошибка = ненулевой код возврата):

1. каждая операция ссылается на существующую строку реестра `domain|verb`;
2. профиль не может **занизить** риск относительно реестра;
3. у каждой операции есть **проверка результата** — «нажал» не значит «получилось».

## Профили

| Приложение / класс | Тип | Процесс | Стек | Версия | Проверен | Якорей | Операций | Файл |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1С:Предприятие 8 (тонкий/толстый клиент) | `app` | `1cv8.exe, 1cv8c.exe` | win32 | 8.3.x (2026-11) | 2026-11-08 | 5 | 6 | `1c.json` |
| 7-Zip | `app` | `7zFM.exe, 7z.exe, 7zG.exe` | win32 | 24.x (2026-11) | 2026-11-08 | 2 | 4 | `7zip.json` |
| Ableton Live 12 | `app` | `Ableton Live 12.exe, Ableton Live 12 Beta.exe` | win32 | 12.x (2026-11) | 2026-11-08 | 7 | 7 | `ableton.json` |
| Adobe Acrobat | `app` | `Acrobat.exe, AcroRd32.exe, AcrobatDC.exe` | uia | 2025.x (2026-11) | 2026-11-08 | 5 | 6 | `acrobat.json` |
| Adobe Photoshop | `app` | `Photoshop.exe` | win32 | 2026 (v27) | 2026-11-08 | 8 | 8 | `photoshop.json` |
| Adobe Premiere Pro | `app` | `Adobe Premiere Pro.exe` | win32 | 2026 (v26) | 2026-11-08 | 8 | 7 | `premiere.json` |
| Audacity | `app` | `audacity.exe` | win32 | 3.7.x (2026-11) | 2026-11-08 | 6 | 6 | `audacity.json` |
| Bitwig Studio | `app` | `Bitwig Studio.exe` | win32 | 5.x (2026-11) | 2026-11-08 | 5 | 5 | `bitwig.json` |
| Blender | `app` | `blender.exe` | qt | 4.x (2026-11) | 2026-11-08 | 3 | 5 | `blender.json` |
| Calibre | `tool` | `calibre.exe, ebook-convert.exe, calibredb.exe` | qt | 8.x (2026-11) | 2026-11-08 | 5 | 4 | `calibre.json` |
| CapCut (Desktop) | `app` | `CapCut.exe` | electron | 6.x (2026-11) | 2026-11-08 | 6 | 12 | `capcut.json` |
| Chrome / Edge / Yandex (Chromium) | `app` | `chrome.exe, msedge.exe, browser.exe` | web | Chrome 131+ / Edge 131+ | 2026-11-08 | 7 | 8 | `browser.json` |
| DBeaver | `app` | `dbeaver.exe, dbeaverc.exe` | qt | 25.x (2026-11) | 2026-11-08 | 6 | 6 | `dbeaver.json` |
| DaVinci Resolve | `app` | `Resolve.exe, DaVinciResolve.exe` | qt | 19.x (2026-11) | 2026-11-08 | 6 | 6 | `davinci.json` |
| Discord (desktop) | `app` | `Discord.exe` | electron | 0.0.9x (2026-11) | 2026-11-08 | 5 | 6 | `discord.json` |
| Docker Desktop | `app` | `Docker Desktop.exe, com.docker.backend.exe` | electron | 4.3x (2026-11) | 2026-11-08 | 5 | 7 | `docker.json` |
| Everything | `app` | `Everything.exe` | win32 | 1.5.x (2026-11) | 2026-11-08 | 4 | 5 | `everything.json` |
| FL Studio | `app` | `FL64.exe, FL.exe` | win32 | FL Studio 2024/2025 (2026-11) | 2026-11-08 | 8 | 6 | `flstudio.json` |
| Figma (desktop / web) | `app` | `Figma.exe, chrome.exe` | web | 2026-11 | 2026-11-08 | 6 | 6 | `figma.json` |
| FileZilla | `app` | `filezilla.exe` | win32 | 3.6x (2026-11) | 2026-11-08 | 5 | 4 | `filezilla.json` |
| Git for Windows (git-bash / git.exe) | `app` | `git-bash.exe, git.exe, bash.exe` | win32 | 2.4x (2026-11) | 2026-11-08 | 2 | 5 | `git-bash.json` |
| HandBrake | `app` | `HandBrake.exe, HandBrakeCLI.exe` | win32 | 1.9.x (2026-11) | 2026-11-08 | 2 | 4 | `handbrake.json` |
| JetBrains IDE (IDEA / PyCharm / WebStorm) | `app` | `idea64.exe, pycharm64.exe, webstorm64.exe, studio64.exe` | qt | 2025.3 (2026-11) | 2026-11-08 | 7 | 5 | `jetbrains.json` |
| LibreOffice | `tool` | `soffice.exe, soffice.com, soffice.bin` | win32 | 25.x (2026-11) | 2026-11-08 | 5 | 6 | `libreoffice.json` |
| Microsoft Excel | `app` | `EXCEL.EXE` | uia | Microsoft 365 (2026-11) | 2026-11-08 | 4 | 8 | `excel.json` |
| Microsoft Outlook (классический и новый) | `app` | `OUTLOOK.EXE, olk.exe` | uia | Microsoft 365 (2026-11) | 2026-11-08 | 8 | 7 | `outlook.json` |
| Microsoft PowerPoint | `app` | `POWERPNT.EXE` | uia | Microsoft 365 (2026-11) | 2026-11-08 | 6 | 6 | `powerpoint.json` |
| Microsoft Visual Studio | `app` | `devenv.exe` | uia | 17.x (2022, 2026-11) | 2026-11-08 | 7 | 5 | `visualstudio.json` |
| Microsoft Word | `app` | `WINWORD.EXE` | uia | Microsoft 365 (2026-11) | 2026-11-08 | 7 | 8 | `word.json` |
| Notion | `app` | `Notion.exe` | electron | 4.x (2026-11) | 2026-11-08 | 5 | 5 | `notion.json` |
| OBS Studio | `app` | `obs64.exe` | qt | 31.x (2026-11) | 2026-11-08 | 7 | 7 | `obs.json` |
| Obsidian | `app` | `Obsidian.exe` | electron | 1.9.x (2026-11) | 2026-11-08 | 5 | 5 | `obsidian.json` |
| Oracle VirtualBox | `app` | `VirtualBox.exe, VBoxManage.exe, VBoxHeadless.exe` | qt | 7.1.x (2026-11) | 2026-11-08 | 5 | 5 | `virtualbox.json` |
| PowerShell 7 / Windows PowerShell | `app` | `pwsh.exe, powershell.exe` | win32 | 7.5 / 5.1 (2026-11) | 2026-11-08 | 3 | 5 | `powershell.json` |
| REAPER | `app` | `reaper.exe` | win32 | 7.x (2026-11) | 2026-11-08 | 4 | 9 | `reaper.json` |
| Slack | `app` | `slack.exe` | electron | 4.4x (2026-11) | 2026-11-08 | 5 | 5 | `slack.json` |
| Steam | `app` | `steam.exe, steamwebhelper.exe` | electron | 2026-11 | 2026-11-08 | 6 | 6 | `steam.json` |
| Telegram Desktop | `app` | `Telegram.exe` | qt | 5.x (2026-11) | 2026-11-08 | 5 | 6 | `telegram.json` |
| VLC media player | `app` | `vlc.exe` | win32 | 3.0.x (2026-11) | 2026-11-08 | 4 | 5 | `vlc.json` |
| Visual Studio Code | `app` | `Code.exe` | electron | 1.9x (2026-11) | 2026-11-08 | 7 | 7 | `vscode.json` |
| WinSCP | `app` | `WinSCP.exe, winscp.com` | win32 | 6.x (2026-11) | 2026-11-08 | 4 | 4 | `winscp.json` |
| Windows Terminal | `app` | `WindowsTerminal.exe, wt.exe` | uia | 1.2x (2026-11) | 2026-11-08 | 6 | 5 | `wt.json` |
| Wireshark / tshark | `tool` | `Wireshark.exe, tshark.exe, dumpcap.exe` | qt | 4.4.x (2026-11) | 2026-11-08 | 6 | 5 | `tshark.json` |
| Zotero | `app` | `zotero.exe` | uia | 7.x (2026-11) | 2026-11-08 | 5 | 4 | `zotero.json` |
| Автоматизация любого приложения (руки и глаза) | `tool` | `python.exe, uia_probe.py` | uia | ZShelper tools/uia_probe.py v1 (2026-11) | 2026-11-08 | 5 | 8 | `apps-generic.json` |
| Банк (веб-кабинет и десктоп-клиент) — только чтение | `app` | `chrome.exe, msedge.exe, browser.exe` | web | 2026-11 | 2026-11-08 | 5 | 6 | `bank.json` |
| Безопасность аккаунтов и данных | `system` | `MpCmdRun.exe, manage-bde.exe, secpol.msc, SystemSettings.exe` | uia | Windows 11 24H2 + Defender (2026-11) | 2026-11-08 | 6 | 5 | `security-access.json` |
| Бэкап и диски Windows (robocopy / wbadmin / smartctl) | `tool` | `robocopy.exe, wbadmin.exe, smartctl.exe, diskmgmt.msc` | win32 | Windows 11 24H2 + smartmontools 7.4 (2026-11) | 2026-11-08 | 6 | 6 | `storage-tools.json` |
| Ввод и макросы (AutoHotkey / Rust input layer) | `tool` | `AutoHotkey64.exe, AutoHotkey.exe, nircmd.exe` | win32 | AHK 2.0.19 + enigo 0.2 (2026-11) | 2026-11-08 | 6 | 7 | `input-macros.json` |
| Диспетчер задач | `app` | `Taskmgr.exe` | uia | Windows 11 24H2 (2026-11) | 2026-11-08 | 5 | 5 | `taskmgr.json` |
| Календарь и задачи | `system` | `OUTLOOK.EXE, olk.exe, schtasks.exe, Calendar.exe` | uia | Outlook 365 + Windows 11 (2026-11) | 2026-11-08 | 5 | 6 | `calendar-tasks.json` |
| Командная строка (cmd.exe) и пакетные файлы | `app` | `cmd.exe` | win32 | Windows 10/11 (2026-11) | 2026-11-08 | 2 | 4 | `cmd.json` |
| Музыкальная библиотека (beets / fpcalc / rsgain) | `tool` | `beet.exe, fpcalc.exe, rsgain.exe, loudgain.exe, ffmpeg.exe` | win32 | beets 2.x, chromaprint 1.5, rsgain 3.x (2026-11) | 2026-11-08 | 5 | 6 | `music-library.json` |
| Параметры Windows | `app` | `SystemSettings.exe, ApplicationFrameHost.exe` | uia | Windows 11 24H2 (2026-11) | 2026-11-08 | 5 | 5 | `windows-settings.json` |
| Проводник Windows | `app` | `explorer.exe` | uia | Windows 11 24H2 / Windows 10 22H2 | 2026-11-08 | 6 | 7 | `explorer.json` |
| Просмотр событий | `app` | `mmc.exe, eventvwr.exe` | uia | Windows 11 24H2 (2026-11) | 2026-11-08 | 5 | 5 | `eventvwr.json` |
| Умный дом (Home Assistant / MQTT / Matter) | `system` | `` | web | HA 2026.1 + Matter 1.3 (2026-11) | 2026-11-08 | 6 | 7 | `home-assistant.json` |
| Устройства Windows (USB / Bluetooth / печать) | `system` | `pnputil.exe, printui.exe, DevicePairingWizard.exe, SystemSettings.exe` | uia | Windows 11 24H2 (2026-11) | 2026-11-08 | 6 | 6 | `devices.json` |

По типу: `app` — 47 · `tool` — 7 · `system` — 4. `app` — конкретная программа, `tool` — командный инструмент без интерфейса, `system` — класс работы в самой Windows (устройства, безопасность, календарь), где «приложение» — это система.

## Риск операций

- `write-local` — 195
- `read` — 106
- `external` — 23
- `destructive` — 16
- `identity` — 3
- `money` — 1

## Покрытие доменов реестра

- `video` — 35
- `music-production` — 26
- `dev-code` — 26
- `files` — 23
- `text-docs` — 18
- `chat-social` — 17
- `virtualization-remote` — 14
- `learning-research` — 13
- `processes-services` — 11
- `slides-pdf-print` — 10
- `audio` — 9
- `apps-generic` — 8
- `creative-3d` — 8
- `web` — 8
- `images` — 8
- `music` — 7
- `apps-windows` — 7
- `smart-home` — 7
- `input` — 7
- `email` — 7
- `business-finance` — 6
- `personal-finance` — 6
- `calendar-tasks` — 6
- `databases` — 6
- `devices` — 6
- `network` — 6
- `games` — 6
- `storage-backup` — 6
- `sheets-data` — 5
- `automation` — 5
- `security-access` — 5
- `video-production` — 3
- `system-power` — 2
- `engineering-3d` — 1
- `distribution` — 1
- `monitoring-triage` — 1
- `hardware-diag` — 1
- `accessibility` — 1
- `accounts-updates` — 1
- `display-sound` — 1

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
