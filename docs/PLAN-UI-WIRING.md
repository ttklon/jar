# План подключения: 221 модуль → приложение

**Дата:** 2026-11-20. **Ветка:** `arena/5ba91ea6-jar`.
**Основание:** план на 500 шагов закрыт, но проверка «достижимо ли правило из интерфейса»
показала: **162 модуля достижимы, 221 — нет**. Это не забытые шаги, а **недостающий слой**.

## Что произошло и почему это не провал

План на 500 шагов называл работы вида «правило: как должно быть». Он честно сделан:
у каждого модуля тест, мутация, объяснение «почему так, а не иначе». Но **ни один из
пятисот шагов не назывался «вставить правило в экран»»**. Отсюда 221 модуль, живущий
в библиотеке: он существует, проверен и никому не виден.

Дополнительно проверено и оказалось **лучше, чем я сказал в прошлый раз**:

| Говорил | На самом деле |
|---|---|
| «палитры нет» | палитра **есть** в `app.tsx` (`Ctrl+K` и `Ctrl+Л`), мой `commandPalette.ts` — дубль |
| «темы не переключаются» | темы **есть** (`lib/theme.ts` + `THEME_KEY` + `resolveTheme`), мой `themeChoice.ts` — дубль |
| «словаря состояния нет» | словарь **есть** (`lib/state.ts`: `not-installed`/`not-checked`/`proven-here`/`failed`) |
| «диктор не подключён» | есть проверка `a11y.test.ts` по исходникам экранов, но **словаря объявлений нет** |
| «экраны не проверяются» | **35 `.tsx`-тестов** на экраны — интерфейс проверяется больше, чем я думал |

Значит настоящих «дублей» меньше, чем казалось, но проблема другая и серьёзнее:
**много правил описывают одно и то же с разных сторон**, и человек, подключая их,
должен выбрать, какое главное. Это и есть работа этапа.

## Урок первых четырёх шагов

Проверка оказалась жёстче ожиданий: **все четыре «неподключённых» модуля дублировали уже
работающий код**. Палитра работала, темы переключались, словарь состояния был богаче
моего, а перебивание уже мерило задержку в 200 мс.

Значит правило этапа меняется: **первый вопрос про модуль — не «как подключить», а
«а не дубль ли это»**. Из 221 модуля дублями окажутся не два-три, а десятки, и удалить
дубль — такой же результат, как подключить: кода меньше, путаницы меньше.

Поэтому в фазе 1 работа идёт так: **открыть экран → посмотреть, чего в нём не хватает →
взять из 221 то, чего нет → остальное удалить**. Не наоборот.

## Из чего состоит этап

Три вида работ, и они не равны по цене:

1. **Подключить готовое** (дёшево): правило есть, экран есть, нужен вызов и строка.
2. **Свести дубли** (средне): два-три модуля про одно — выбрать главный, остальные
   оставить ссылками или удалить.
3. **Собрать и увидеть** (дорого): Windows-сборка, запуск, глазами, починка того, что
   видно только глазами.

## Правило этапа

Каждый шаг заканчивается **видимым результатом** — тем, что можно проверить не тестом,
а глазами: «открыл приложение, нажал, увидел». Шаг, который заканчивается «модуль
подключён к другому модулю» и не виден в приложении, **не считается**.

И второе: **никаких новых правил.** На этапе только подключение, сведение и удаление.
Новое правило — это новая версия плана (шаг 500 говорит то же самое).

## Порядок

Сначала то, что видно при первом запуске (фаза 1), потом ежедневное (фаза 2), потом
редкое (фаза 3), потом сборка и приёмка (фаза 4). Внутри фазы — от дешёвого к дорогому.

---

## Фаза 1 · Первый запуск: приложение открывается и что-то делает (40 шагов)

Цель фазы: человек запускает, за двадцать секунд видит результат, может всё сделать с
клавиатуры и без мыши.

| # | Шаг | Модули | Проверка глазами |
|---|---|---|---|
| ✅ 1 | Свести темы: `themeChoice` → `theme` | `themeChoice` удалён | переключатель **уже был** в `Settings.tsx`: дубль убран, поведение не менялось |
| ✅ 2 | Свести палитру: `commandPalette` → `commands` | `commandPalette` удалён | `Ctrl+K` **уже был**; добавил опетку в одну букву («журнла» → «Журнал») и порядок «точное раньше похожего» |
| ✅ 3 | Свести словарь состояния: `stateWords` → `state` | `stateWords` удалён | старый `state.ts` **богаче** (понижает «проверено» без доказательства); взял одно улучшение — `провал` → `не работает` |
| ✅ 4 | Свести перебивание: `bargeIn` → `barge.ts` | `bargeIn` удалён | в `barge.ts` уже был замер 200 мс; добавил переключение состояния: свой голос не перебивает, фраза договаривается |
| ✅ 5 | Первое дело в `Welcome` | `firstDeed` удалён | `firstScreen` (три примера) **уже** в `Welcome`; `firstWords` — про поток ответа, другая тема |
| 6 | Подключить сценарий без мыши | `keyboardOnly` | пять нажатий до дела, Escape возвращает |
| ✅ 7 | Уведомления: настройка + где человек | `noticePolicy` главный, `resultNotice` — текст | **в `Settings` три кнопки уровней**, выбор в `localStorage`, объявляется словами, выключателя ошибок нет |
| 8 | Подключить страницу 20 фраз | `starterPage` | на первом экране видно 20 фраз |
| ✅ 9 | Трей: подсказка и меню | `trayNative` главный, `trayStart` — старт | **настоящий дефект**: Rust показывал «ZShelper — готово», правило требует состояние без имени; Rust приведён в соответствие, `trayRust.test.ts` читает `tray.rs` и держит их вместе |
| 10 | Подключить часы/цифры на экране | `textScale`, `zoom`, `narrowCard` | окно в узком виде не ломается |

## Фаза 2 · Ежедневное: дело, журнал, память (55 шагов)

Цель: то, чем пользуются каждый день, — сказать фразу, увидеть дело, понять, что было.

| # | Шаг | Модули | Проверка глазами |
|---|---|---|---|
| 🟡 41 | Память: экран «что я о вас помню» | `memoryView` и `deedMemory` подключены; `plainMemory` — нет | **в `Settings` карточка «Что я о вас помню»**: один список, у каждого факта одна кнопка «забыть», итог назван словами правила («больше не будет предлагаться. Вернуть нельзя»). `fromStored` переводит пары ключ-значение ядра в читаемые подписи — внутренние ключи (`folder:`) на экран не попадают. `deedMemory`: карточка дела называет **возраст** («вчера, 14:32», «3 дня назад», старая — датой) — **дефект**: строка показывала только время суток, и дело недельной давности читалось как сегодняшнее; по дороге найдена и исправлена ошибка формулы: вечернее дело «молодело» на день. Осталось: файл памяти руками — `plainMemory` |
| 42 | Подключить «почему так» в дело | `whyScreen`, `reason`, `reasonWords` | у каждого дела видно причину словами |
| 43 | Подключить «что происходит прямо сейчас» | `rightNow`, `whatNow` | кнопка показывает текущее состояние |
| 44 | Подключить счётчики недели | `weekCounters`, `myStats`, `quarterly` | «на этой неделе 12 дел» — цифра правдивая |
| 45 | Подключить воспроизведение из журнала | `reproduce`, `logReader`, `logSurvives` | журнал открывается и повторяет дело |
| ✅ 46 | Выгрузка журнала | `journalExport` подключён | кнопка «выгрузить журнал за сутки»: секреты вычищены, пути сокращены, **числа** в подтверждении |
| ✅ 47 | Отчёт для поддержки | `copyReport` подключён | **кнопка «копировать» в каждой строке журнала**: текст собирает правило (без путей и JSON), подтверждение — его словами |
| 48 | Подключить «что ты умеешь лучше» | `ownStrengths`, `betterButNo`, `scenarioOnly` | своими словами, без рекламы |
| 49 | Подключить тайминги шагов дела | `stepTimingView`, `latencyProof`, `measured` | видно, сколько шёл каждый шаг |
| 50 | Подключить доверие и доказательства | `earnedTrust`, `proof`, `triedLog` | доверие растёт от доказанного, а не от времени |
| 51–95 | остальные 45 модулей фазы | приложение А | каждый — видимый результат |

## Фаза 3 · Редкое, но важное: система, обновление, люди (70 шагов)

Цель: то, что случается раз в месяц, но ломается больно.

| # | Шаг | Модули | Проверка глазами |
|---|---|---|---|
| ✅ 96 | Автозапуск | три дубля удалены | **уже работает** в `Settings.tsx`: `Switch`, состояние из реестра, спиннер с `aria-live`, `HKCU` без прав админа |
| 97 | Подключить горячие клавиши | `hotkeySaved`, `hotkeyFree`, `hotkeyFullscreen`, `hotkeyHold`, `windowsKeys` | занятая клавиша предлагает другую |
| 98 | Подключить значок в трее | `trayNative`, `runningGlobally`, `waitingGlobally`, `switchNoRestart` | меню трея полно и «выход» последним |
| 99 | Подключить экран обновления | `updateVerify`, `updateManifest`, `signedPackage`, `signedArtifacts` | хеш и подпись видны до установки |
| 100 | Подключить «обновление не мешает» | `quietUpdate`, `notMidTask`, `updateOver`, `betaWarning` | обновление не лезет посреди дела |
| 101 | Подключить откат | `rollbackButton`, `freshWins`, `updateDrill` | кнопка «вернуть как было» работает |
| 102 | Подключить профили людей | `peopleProfiles`, `whoNow`, `whoAsked`, `localProfile`, `personRights` | переключение человека не теряет дело |
| 103 | Подключить права гостя | `guestHands`, `guestCannotDanger`, `profileRightsGuest`, `midDeedRights` | гость не может опасного, и это сказано |
| 104 | Подключить перенос профиля | `profileTransfer`, `profileExport`, `importChecks`, `anonTransfer` | перенос проходит проверку до записи |
| 105 | Подключить удаление и очистку | `cleanUninstall`, `uninstallChoice`, `wipeListing`, `cleanMachine` | удаление перечисляет, что уйдёт |
| 106 | Подключить сон и завершение | `sleepRelease`, `shutdownSave` | при сне запись стоп, дело сохранено |
| 107 | Подключить мультимонитор | `monitors` | окно не уезжает за экран |
| 108–165 | остальные 58 модулей фазы | приложение А | каждый — видимый результат |

## Фаза 4 · Сборка, запуск, глаза (35 шагов)

Цель: то, чего не было ни разу, — **приложение, которое существует как файл и работает
на живой машине**.

| # | Шаг | Модули | Проверка глазами |
|---|---|---|---|
| 166 | Собрать `cargo check` без ошибок | `src-tauri` | Rust компилируется |
| 167 | Собрать frontend (`npm run build`) | — | `dist/` получается |
| 168 | Собрать `tauri build` для Windows | — | `.msi`/`.exe` существует |
| 169 | Запустить на живой машине | — | окно открывается, не падает |
| 170 | Пройти первый запуск глазами | `firstDeed`, `starterPage` | за 20 секунд видно результат |
| 171 | Проверить `--self-check` | `src-tauri/src/selfcheck.rs` | отчёт без ошибок |
| 172 | Проверить установку и удаление | `uninstallChoice`, `cleanUninstall` | после удаления не остаётся мусора |
| 173 | Проверить на слабой машине | `threeMachines`, `harshEnv`, `battery` | не падает на 4 ГБ |
| 174 | Сверить «одна страница результата» с реальностью | `resultPage`, `whatItDoesnt` | страница не врёт |
| 175 | Записать, что осталось | — | список честный, а не «готово» |
| 176–200 | починка того, что видно только глазами | — | каждый дефект — видимый результат |

## Чего этот план не делает

- **не добавляет правил**: этап только про подключение, сведение дублей и удаление;
- **не обещает «полностью готово»** в конце: он обещает **проверяемое** — приложение
  запускается, первое дело видно, сценарий без мыши работает, сборка существует;
- **не считает подключение к другому модулю результатом**: результат — то, что видно.

## Признак, что фаза закончена

Не «все шаги отмечены», а: **человек, который не видел проект, открывает приложение и
без подсказок делает первое дело**. Всё остальное — детали.


## Точный замер на 2026-11-20 (после шагов 1–5)

| Число | Что |
|---|---|
| 383 | модулей правил всего |
| 167 | достижимы из интерфейса |
| **216** | **не достижимы** |
| 78 | из них стоят в **29 группах по понятию** (например, автозапуск: 3 модуля) |
| 138 | одиночные — у них нет «соседа», с которым можно свести |

**Вывод для плана:** 78 модулей решаются **сведением** (выбрать одного из группы,
остальное — в него или вон), 138 — **подключением** (по одному в экран). Это две разные
работы, и оценивать их одинаково нельзя.

Группы по понятиям (звёздочкой — неподключённые):
`autostart` (3), `borrowed` (2), `cancel` (3), `changelog` (2), `command` (2),
`danger` (3), `first` (2+), `hotkey` (4), `journal` (4), `latency` (3), `licenses` (2),
`memory` (5), `network` (2), `notice` (2), `person` (2), `policy` (2), `refuse` (2),
`repeat` (2), `right` (2), `secret` (3), `start` (2), `three` (2), `when` (3) и ещё шесть.

## Порядок внутри фазы 1 — по «сколько человек увидит»

Не по алфавиту и не по номеру, а по тому, **сколько людей это заметит**:

1. **Автозапуск и горячие клавиши** (7 модулей) — их видит каждый, кто запустил;
2. ✅ **Уведомления** (2 сведены, 1 подключён) — видно каждый день;
3. **Журнал и отчёт** (6) — видно, когда что-то пошло не так;
4. **Память и повтор** (7) — видно на второй неделе;
5. остальное — по группам из приложения А.

## Приложение А · Все 221 модуль по группам


### безопасность данных (17)
`cancelFromFeed`, `cancelPlaces`, `dangerPolicy`, `deleteKeepsShared`, `dontStore`, `editReplaces`, `harshEnv`, `localOnly`, `matrix`, `notSecurity`, `oldFormat`, `policyDrift`, `portableParity`, `requirements`, `schemaVersion`, `secretWriteTest`, `wipeListing`

### документация (15)
`devGuide`, `docDated`, `docsGenerated`, `examplePhrases`, `faqTen`, `guidePromises`, `guideTenMinutes`, `handIn30`, `limitsLive`, `linksInCi`, `oneDoc`, `recipes20`, `resultPage`, `screenShots`, `whatItDoesnt`

### журнал и отчёт (24)
`changelogGen`, `changelogHuman`, `commandTrace`, `copyReport`, `decisionLog`, `errorHelps`, `faultKind`, `journalAuthor`, `journalExport`, `logLevels`, `logPerProfile`, `logReader`, `logSurvives`, `memoryJournal`, `memoryReport`, `onePersonDefault`, `reason`, `reasonWords`, `reportStructure`, `secretNeverLogged`, `supportArchive`, `supportOneReply`, `supportQuestions`, `triedLog`

### интерфейс (23)
`alertA11y`, `bargeIn`, `commandPalette`, `firstDeed`, `firstScreen`, `firstWords`, `keyboardOnly`, `meaning`, `narrowCard`, `noticePolicy`, `noticesNative`, `plainCondition`, `preferences`, `resultNotice`, `screenSight`, `skippedHonest`, `stateWords`, `systemNotices`, `textScale`, `themeChoice`, `uxNotCode`, `visualSnap`, `zoom`

### модель и скорость (13)
`aging`, `battery`, `benchmark`, `economy`, `latencyProof`, `lifetime`, `llmStream`, `micLevel`, `modelVsMine`, `noiseGate`, `rateLimit`, `sharedEngine`, `stopWords`

### обновление (12)
`betaWarning`, `freshWins`, `postUpdateSelfCheck`, `quietUpdate`, `rollbackButton`, `shotsFresh`, `signedArtifacts`, `signedPackage`, `updateDrill`, `updateManifest`, `updateOver`, `updateVerify`

### окно и оболочка (23)
`autostartCheckbox`, `autostartChoice`, `autostartTest`, `cleanMachine`, `cleanUninstall`, `fullscreenGames`, `hotkeyFree`, `hotkeyFullscreen`, `hotkeyHold`, `hotkeySaved`, `noAdmin`, `noShellIntegration`, `paletteStart`, `runningGlobally`, `starterPage`, `switchNoRestart`, `trayNative`, `trayStart`, `uninstallChoice`, `waitingGlobally`, `windowsKeys`, `windowsUsers`, `wontStart`

### память и доверие (14)
`beforeDoing`, `deedMemory`, `earnedTrust`, `factEdit`, `factOrigin`, `feedCancelProof`, `memoryFile`, `memoryGuard`, `memoryView`, `notRepeated`, `plainMemory`, `proof`, `recall`, `repeatEdited`

### профили людей (19)
`anonTransfer`, `borrowed`, `borrowedLicense`, `forgetProfile`, `guestCannotDanger`, `guestHands`, `importChecks`, `localProfile`, `newPersonCan`, `peopleProfiles`, `personRights`, `profileExport`, `profileRightsGuest`, `profileSearchScope`, `profileTransfer`, `profilesOptional`, `twoProfilesApart`, `whoAsked`, `whoNow`

### разное (33)
`adversarial`, `antivirusPeace`, `autoHistory`, `barge`, `betterButNo`, `diskChoice`, `failIsolated`, `feedFilters`, `firstMonth`, `fromOneDeed`, `licenseNote`, `measured`, `midDeedRights`, `monitors`, `myStats`, `nameAfterDeed`, `networkManifest`, `notMidTask`, `ownStrengths`, `painFirst`, `parsing200`, `pauseAll`, `quarterly`, `refuseFast`, `reproduce`, `rightNow`, `scenarioOnly`, `shutdownSave`, `sleepRelease`, `stepTimingView`, `weekCounters`, `whatNow`, `whyScreen`

### расписание и напоминания (10)
`catchUp`, `dndRespect`, `nightGreen`, `nightQuiet`, `nightTasks`, `plainSchedule`, `scheduleScreen`, `scheduleSurvives`, `whenThen`, `whenTriggers`

### сборка и проверки (18)
`cacheDeps`, `coverageHonest`, `cutUnproven`, `cycleRepeat`, `dataGenerated`, `fiveMinutes`, `methods`, `metrics`, `noNewPromises`, `noSkippedTests`, `oneCommand`, `parallelChecks`, `planBoundary`, `remeasure`, `riskShortList`, `sbom`, `threeMachines`, `typesAllFiles`
