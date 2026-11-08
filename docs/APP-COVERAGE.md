# Каталог приложений: что ZShelper должен уметь автоматизировать

Данные — [`data/app_targets.psv`](../data/app_targets.psv), файл генерируется
`python3 tools/app_targets.py`, руками не править.

**Приложений в каталоге: 136** · категорий: **17** · профиль найден по процессу: **92** · без профиля (визуальный агент): **44**

## Три уровня покрытия (почему не «профиль на каждую программу руками»)

| Tier | Что это | Сколько | Как появляется |
| --- | --- | --- | --- |
| **A** | ручной профиль: якоря, шаги, проверки | 77 | пишется человеком/агентом по UIA-дампу |
| **B** | авто-профиль из UIA + подтверждение | 25 | `tools/uia_probe` → кандидаты → подтверждение |
| **C** | только визуальный агент (скриншот→OCR/VLM→клик) | 34 | профиля нет, работает универсальный цикл |

Подробно — [`PROFILE-STRATEGY.md`](PROFILE-STRATEGY.md). Правило: приложение без профиля
всё равно **работает**, просто медленнее и с меньшей надёжностью.

## Каналы автоматизации

Предпочтение: **api → cli → com → web → midi → jsx → remote → uia → vision**.

| Основной канал | Приложений |
| --- | --- |
| `cli` | 54 |
| `uia` | 43 |
| `api` | 26 |
| `web` | 8 |
| `com` | 5 |

## Приоритеты

| Приоритет | Приложений |
| --- | --- |
| P0 | 22 |
| P1 | 29 |
| P2 | 49 |
| P3 | 36 |

## Инвариант: tier A ⇒ есть профиль

Все приложения tier A имеют профиль в `data/profiles/`. ✅

## Полный каталог

### Разработка (22)

| Приложение | exe | Канал | Tier | Приоритет | Профиль | Заметка |
| --- | --- | --- | --- | --- | --- | --- |
| Git for Windows | `git-bash.exe` | cli | A | P0 | ✅ |  |
| PowerShell | `powershell.exe` | cli | A | P0 | ✅ | основной канал автоматизации |
| Visual Studio Code | `Code.exe` | cli | A | P0 | ✅ | профиль готов |
| Windows Terminal | `WindowsTerminal.exe` | cli+uia | A | P0 | ✅ | профили, panes |
| Командная строка | `cmd.exe` | cli | A | P0 | ✅ |  |
| Docker Desktop | `Docker Desktop.exe` | cli | A | P1 | ✅ | docker CLI |
| DBeaver | `dbeaver.exe` | cli | A | P2 | ✅ | JDBC, но лучше напрямую |
| FileZilla | `filezilla.exe` | cli+uia | A | P2 | ✅ |  |
| PostgreSQL CLI | `psql.exe` | cli | A | P2 | ✅ | профиль готов; psql/pg_dump/pg_restore |
| PuTTY | `putty.exe` | cli | A | P2 | ✅ | plink; профиль готов |
| SQLite CLI | `sqlite3.exe` | cli | A | P2 | ✅ | профиль готов; бэкап только VACUUM INTO |
| Visual Studio | `devenv.exe` | cli+com | A | P2 | ✅ | msbuild/dotnet |
| WinSCP | `WinSCP.exe` | cli | A | P2 | ✅ | winscp.com скрипты |
| Wireshark | `Wireshark.exe` | cli | A | P2 | ✅ | tshark |
| Android Studio | `studio64.exe` | cli | A | P3 | ✅ | gradle/adb |
| IntelliJ IDEA | `idea64.exe` | cli | A | P3 | ✅ |  |
| JetBrains Rider | `rider64.exe` | cli | A | P3 | ✅ | профиль готов |
| Postman | `Postman.exe` | api | A | P3 | ✅ | newman; профиль готов |
| PyCharm | `pycharm64.exe` | cli | A | P3 | ✅ |  |
| SQL Server Management Studio | `Ssms.exe` | cli | C | P3 | — | sqlcmd |
| Windows Terminal Preview | `WindowsTerminal.exe` | cli+uia | C | P3 | ✅ |  |
| pgAdmin | `pgAdmin4.exe` | cli | C | P3 | — | psql |

### Медиа (17)

| Приложение | exe | Канал | Tier | Приоритет | Профиль | Заметка |
| --- | --- | --- | --- | --- | --- | --- |
| CapCut | `CapCut.exe` | uia | A | P0 | ✅ | профиль готов |
| HandBrake | `HandBrake.exe` | cli | A | P0 | ✅ | HandBrakeCLI |
| OBS Studio | `obs64.exe` | api | A | P0 | ✅ | профиль готов (websocket) |
| VLC | `vlc.exe` | cli | A | P0 | ✅ | --intf dummy |
| Adobe Photoshop | `Photoshop.exe` | uia | A | P1 | ✅ | профиль готов |
| Adobe Premiere Pro | `Adobe Premiere Pro.exe` | uia | A | P1 | ✅ | профиль готов |
| Audacity | `audacity.exe` | cli | A | P1 | ✅ | макросы |
| Adobe After Effects | `AfterFX.exe` | uia+jsx | C | P2 | — |  |
| Adobe Illustrator | `Illustrator.exe` | uia | C | P2 | — | скрипты ExtendScript |
| Adobe Lightroom | `Lightroom.exe` | uia | C | P2 | — |  |
| DaVinci Resolve | `Resolve.exe` | api+uia | A | P2 | ✅ | скриптовый API Python/Lua |
| Spotify | `Spotify.exe` | api+uia | B | P2 | — | Web API (нужен токен) |
| foobar2000 | `foobar2000.exe` | cli+uia | A | P2 | ✅ | /command; профиль готов |
| Adobe InDesign | `InDesign.exe` | uia+jsx | C | P3 | — |  |
| Kdenlive | `kdenlive.exe` | api | B | P3 | — | MLT-скрипты, рендер через melt |
| MusicBee | `MusicBee.exe` | uia | C | P3 | — |  |
| VEGAS Pro | `vegas.exe` | uia | C | P3 | — |  |

### Система (12)

| Приложение | exe | Канал | Tier | Приоритет | Профиль | Заметка |
| --- | --- | --- | --- | --- | --- | --- |
| Диспетчер задач | `Taskmgr.exe` | uia+cli | A | P0 | ✅ | быстрее через WMI/Get-Process |
| Планировщик заданий | `mmc.exe` | cli | B | P0 | ✅ | schtasks |
| Проводник | `explorer.exe` | uia | A | P0 | ✅ | профиль готов |
| Службы | `mmc.exe` | uia+cli | B | P0 | ✅ | sc.exe/PowerShell надёжнее GUI |
| Ножницы/Snip&Sketch | `SnippingTool.exe` | cli+uia | A | P1 | ✅ | screenshot через Win32 проще |
| Панель управления | `control.exe` | uia | B | P1 | ✅ | часть настроек через CLI/реестр |
| Параметры Windows | `SystemSettings.exe` | uia | A | P1 | ✅ | частые экраны: обновления, звук, дисплей |
| Просмотр событий | `mmc.exe` | cli | A | P1 | ✅ | wevtutil/Get-WinEvent |
| Диспетчер устройств | `mmc.exe` | uia+cli | B | P2 | ✅ | pnputil |
| Редактор реестра | `regedit.exe` | cli | C | P2 | — | reg.exe, GUI — последний вариант |
| Управление дисками | `diskmgmt.msc` | uia | C | P2 | ✅ | опасно, только с подтверждением |
| Монитор ресурсов | `resmon.exe` | uia | C | P3 | ✅ |  |

### Утилиты (11)

| Приложение | exe | Канал | Tier | Приоритет | Профиль | Заметка |
| --- | --- | --- | --- | --- | --- | --- |
| 7-Zip | `7zFM.exe` | cli | A | P0 | ✅ | 7z.exe |
| CrystalDiskInfo | `crystaldiskinfo.exe` | cli | A | P1 | ✅ | SMART через smartctl |
| Everything | `Everything.exe` | cli | A | P1 | ✅ | ES CLI, индексация по имени |
| HWiNFO | `HWiNFO64.exe` | api | A | P1 | ✅ | shared memory/датчики |
| KeePassXC | `KeePassXC.exe` | cli | A | P1 | ✅ | keepassxc-cli: чтение записей без UI |
| PowerToys | `PowerToys.exe` | uia | B | P2 | — | часть функций через API |
| WinRAR | `WinRAR.exe` | cli | A | P2 | ✅ | rar.exe; профиль готов |
| WizTree | `WizTree.exe` | cli | B | P2 | — | экспорт CSV |
| qBittorrent | `qbittorrent.exe` | api | A | P2 | ✅ | Web API /api/v2, сессии и лимиты |
| CPU-Z | `cpuz.exe` | uia | C | P3 | — | лучше WMI |
| JDownloader | `JDownloader.exe` | api | C | P3 | — | MyJDownloader API, капчи — вручную |

### Офис (10)

| Приложение | exe | Канал | Tier | Приоритет | Профиль | Заметка |
| --- | --- | --- | --- | --- | --- | --- |
| Microsoft Excel | `EXCEL.EXE` | com+uia | A | P0 | ✅ | профиль готов |
| Microsoft Word | `WINWORD.EXE` | com+uia | A | P0 | ✅ | профиль готов |
| Microsoft PowerPoint | `POWERPNT.EXE` | com+uia | A | P1 | ✅ | COM-объектная модель |
| Adobe Acrobat Reader | `AcroRd32.exe` | cli+uia | A | P2 | ✅ | pdf-библиотеки надёжнее |
| LibreOffice Calc | `soffice.exe` | cli | A | P2 | ✅ |  |
| LibreOffice Writer | `soffice.exe` | cli | A | P2 | ✅ | --headless конвертация |
| Microsoft OneNote | `ONENOTE.EXE` | com | B | P2 | — |  |
| Notepad++ | `notepad++.exe` | cli+uia | B | P2 | — |  |
| Foxit Reader | `FoxitReader.exe` | uia | C | P3 | — |  |
| Sublime Text | `sublime_text.exe` | cli | B | P3 | — | subl --command |

### Бизнес (10)

| Приложение | exe | Канал | Tier | Приоритет | Профиль | Заметка |
| --- | --- | --- | --- | --- | --- | --- |
| 1С:Предприятие | `1cv8.exe` | uia | A | P1 | ✅ | профиль готов |
| Jira (web) | `chrome.exe` | web | B | P1 | ✅ | REST API |
| Банк (веб/клиент) | `chrome.exe` | web | A | P1 | ✅ | профиль готов (read-only) |
| SAP GUI | `saplogon.exe` | uia+com | C | P2 | — |  |
| Trello (web) | `chrome.exe` | api | B | P2 | ✅ |  |
| amoCRM (web) | `chrome.exe` | web | B | P2 | ✅ |  |
| Битрикс24 (web) | `chrome.exe` | web | B | P2 | ✅ | REST |
| Miro (web) | `chrome.exe` | api | B | P3 | ✅ |  |
| Гарант | `garant.exe` | uia | C | P3 | — |  |
| КонсультантПлюс | `cons.exe` | uia | C | P3 | — |  |

### Знания (9)

| Приложение | exe | Канал | Tier | Приоритет | Профиль | Заметка |
| --- | --- | --- | --- | --- | --- | --- |
| Notion | `Notion.exe` | api+uia | A | P1 | ✅ | API |
| Obsidian | `Obsidian.exe` | cli | A | P1 | ✅ | markdown-файлы напрямую |
| Zotero | `zotero.exe` | api | A | P1 | ✅ | локальная БД + connector |
| Calibre | `calibre.exe` | cli | A | P2 | ✅ | ebook-convert |
| Joplin | `Joplin.exe` | cli | A | P2 | ✅ | CLI + markdown; профиль готов |
| OneNote (классический) | `ONENOTE.EXE` | com | B | P2 | — |  |
| Evernote | `Evernote.exe` | uia | C | P3 | — |  |
| Kindle | `Kindle.exe` | uia | C | P3 | — |  |
| Mendeley | `MendeleyDesktop.exe` | uia | C | P3 | — |  |

### Мессенджер (7)

| Приложение | exe | Канал | Tier | Приоритет | Профиль | Заметка |
| --- | --- | --- | --- | --- | --- | --- |
| Telegram Desktop | `Telegram.exe` | api+uia | A | P0 | ✅ | профиль готов |
| Discord | `Discord.exe` | api | A | P1 | ✅ | профиль готов (Bot API) |
| WhatsApp Desktop | `WhatsApp.exe` | uia | A | P1 | ✅ | web-клиент в оболочке |
| Slack | `slack.exe` | api+uia | A | P2 | ✅ | Slack API |
| Discord Canary | `DiscordCanary.exe` | api | C | P3 | — |  |
| Microsoft Teams | `ms-teams.exe` | uia | C | P3 | — | Graph API лучше |
| Signal Desktop | `Signal.exe` | uia | C | P3 | — | нет API, только GUI |

### Дизайн (7)

| Приложение | exe | Канал | Tier | Приоритет | Профиль | Заметка |
| --- | --- | --- | --- | --- | --- | --- |
| Figma | `Figma.exe` | api | A | P1 | ✅ | профиль готов |
| GIMP | `gimp-2.10.exe` | cli | A | P2 | ✅ | Script-Fu/batch |
| GIMP | `gimp-2.10.exe` | api | A | P2 | ✅ | Script-Fu/Python-Fu, консольный batch |
| Inkscape | `inkscape.exe` | cli | A | P2 | ✅ | --export |
| Inkscape | `inkscape.exe` | cli | A | P2 | ✅ | --export-type, векторизация трассировкой |
| Krita | `krita.exe` | uia | C | P2 | — |  |
| Krita | `krita.exe` | api | B | P3 | — | Python-плагины, batch-экспорт |

### Музыка (6)

| Приложение | exe | Канал | Tier | Приоритет | Профиль | Заметка |
| --- | --- | --- | --- | --- | --- | --- |
| FL Studio | `FL64.exe` | uia+midi | A | P0 | ✅ | нет полного API: MIDI+шаблоны |
| REAPER | `reaper.exe` | api | A | P0 | ✅ | ReaScript — полная автоматизация |
| Ableton Live | `Ableton Live 12.exe` | uia+remote | A | P1 | ✅ | MIDI Remote Scripts |
| Bitwig Studio | `Bitwig Studio.exe` | api | A | P1 | ✅ | Java API |
| PreSonus Studio One | `Studio One.exe` | uia | C | P3 | — |  |
| Steinberg Cubase | `Cubase12.exe` | uia | C | P3 | — |  |

### 3D (5)

| Приложение | exe | Канал | Tier | Приоритет | Профиль | Заметка |
| --- | --- | --- | --- | --- | --- | --- |
| Blender | `blender.exe` | api | A | P0 | ✅ | bpy headless |
| FreeCAD | `FreeCAD.exe` | api+cli | A | P1 | ✅ | FreeCADCmd + Python API, профиль готов |
| Blender (аддоны и скрипты) | `blender.exe` | api | B | P2 | ✅ | bpy: аддоны, геоноды, пакетный рендер |
| OrcaSlicer | `orca-slicer.exe` | cli | A | P2 | ✅ | CLI-нарезка и профили печати, профиль готов |
| PrusaSlicer | `prusa-slicer.exe` | cli | A | P2 | ✅ | консольная нарезка --export-gcode, профиль готов |

### Игры (5)

| Приложение | exe | Канал | Tier | Приоритет | Профиль | Заметка |
| --- | --- | --- | --- | --- | --- | --- |
| Steam | `steam.exe` | api+uia | A | P1 | ✅ | профиль готов |
| Battle.net | `Battle.net.exe` | uia | C | P3 | — |  |
| Epic Games Launcher | `EpicGamesLauncher.exe` | uia | C | P3 | — |  |
| Game Bar | `GameBar.exe` | uia | C | P3 | — | запись лучше через OBS |
| Xbox | `xbox.exe` | uia | C | P3 | — |  |

### Браузер (4)

| Приложение | exe | Канал | Tier | Приоритет | Профиль | Заметка |
| --- | --- | --- | --- | --- | --- | --- |
| Google Chrome | `chrome.exe` | web | A | P0 | ✅ | профиль готов |
| Microsoft Edge | `msedge.exe` | web | A | P0 | ✅ | тот же профиль Chromium |
| Firefox | `firefox.exe` | web | A | P1 | ✅ | отдельный профиль (Marionette) |
| Яндекс Браузер | `browser.exe` | web | B | P2 | ✅ |  |

### Почта (3)

| Приложение | exe | Канал | Tier | Приоритет | Профиль | Заметка |
| --- | --- | --- | --- | --- | --- | --- |
| Microsoft Outlook | `OUTLOOK.EXE` | api+uia | A | P1 | ✅ | профиль готов (Graph) |
| Mozilla Thunderbird | `thunderbird.exe` | uia | B | P2 | — | IMAP/SMTP напрямую лучше |
| Mozilla Thunderbird | `thunderbird.exe` | cli | B | P2 | — | профиль mbox/IMAP, без COM |

### Виртуализация (3)

| Приложение | exe | Канал | Tier | Приоритет | Профиль | Заметка |
| --- | --- | --- | --- | --- | --- | --- |
| VirtualBox | `VirtualBox.exe` | cli | A | P1 | ✅ | VBoxManage |
| Hyper-V Manager | `mmc.exe` | cli | B | P2 | ✅ | PowerShell Hyper-V |
| VMware Workstation | `vmware.exe` | cli | A | P2 | ✅ | vmrun; профиль готов |

### Удалённый доступ (3)

| Приложение | exe | Канал | Tier | Приоритет | Профиль | Заметка |
| --- | --- | --- | --- | --- | --- | --- |
| RustDesk | `rustdesk.exe` | cli+uia | B | P2 | — |  |
| AnyDesk | `AnyDesk.exe` | uia | C | P3 | — |  |
| TeamViewer | `TeamViewer.exe` | uia | C | P3 | — |  |

### Связь (2)

| Приложение | exe | Канал | Tier | Приоритет | Профиль | Заметка |
| --- | --- | --- | --- | --- | --- | --- |
| Zoom | `Zoom.exe` | cli+uia | B | P2 | — | Zoom CLI, запись |
| Skype | `Skype.exe` | uia | C | P3 | — |  |

## Как каталог пополняется

1. Пользователь просит «сделай что-то в программе X».
2. Программа определяется по имени процесса (или файла).
3. Если её нет в каталоге — ZShelper спрашивает разрешение на «осмотр» окна,
   снимает UIA-дерево, создаёт черновик профиля tier B и работает через него.
4. После подтверждения человеком черновик становится tier A (с `verified_at`).
5. Если UIA-дерева нет (игра, канвас) — включается визуальный агент (tier C).

Так «умеет всё» становится процессом, а не обещанием: каталог растёт сам, по мере
реальных запросов, и каждое новое приложение оставляет после себя артефакт.

## Проблемы данных

Нет.
