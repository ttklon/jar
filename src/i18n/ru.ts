/**
 * Все строки интерфейса. В компонентах русских литералов нет — только ключи отсюда,
 * чтобы позже можно было добавить en.json без переписывания экранов.
 */

import type { Risk, Tier } from "../ipc";

export const RISK_LABEL: Record<Risk, string> = {
  read: "чтение",
  "write-local": "запись",
  external: "наружу",
  destructive: "разрушает",
  identity: "личность",
  money: "деньги",
};

export const RISK_HINT: Record<Risk, string> = {
  read: "можно выполнять без подтверждения",
  "write-local": "пишет на диск — нужен откат и проверка",
  external: "выходит в сеть — подтверждение человеком",
  destructive: "удаляет или перезаписывает — подтверждение и бэкап",
  identity: "учётные данные и подпись — только человек",
  money: "деньги — система их не двигает",
};

export const TIER_LABEL: Record<Tier, string> = {
  T0: "T0 · офисное железо",
  T1: "T1 · нужен помощнее",
  T2: "T2 · сильная машина",
  T3: "T3 · топовое железо",
};

export const t = {
  appName: "ZShelper",
  appTagline: "локальный агент-оператор для Windows",
  navOverview: "Обзор",
  navCatalog: "Что умею",
  navSettings: "Настройки",

  dataSource: {
    core: "данные из ядра",
    dev: "данные из репозитория (браузер)",
  },
  loading: "Читаю реестр…",
  loadError: "Не удалось прочитать реестр действий",

  overviewTitle: "Что уже умею",
  overviewLead:
    "Это не обещания, а реестр: каждая строка — действие с каналом исполнения, риском и проверкой. Каталог собирается из data/actions.json при запуске.",

  statActions: "действий",
  statDomains: "доменов",
  statVerbs: "глаголов",
  statManual: "требуют человека",

  riskTitle: "Как распределён риск",
  riskLead: "Чем правее, тем внимательнее: подтверждение человеком обязательно.",
  riskColumnRisk: "Риск",
  riskColumnCount: "Действий",
  riskColumnMeaning: "Что значит для работы",

  domainsTitle: "Домены",
  domainsLead: "По убыванию объёма. Внутри — глаголы, которые домен понимает.",

  catalogTitle: "Каталог действий",
  catalogLead: "Поиск по фразе, риску и домену. Ничего не выполняется — это карта возможностей.",
  searchPlaceholder: "например, папку, дубликаты, скриншот",
  filterRisk: "Риск",
  filterAll: "все",
  foundPrefix: "Найдено",
  foundSuffix: "из",
  emptyResult: "Ничего не найдено. Попробуй другое слово — поиск идёт по примеру фразы и каналу.",
  resetFilters: "Сбросить фильтры",

  columnPhrase: "Как сказать",
  columnRisk: "Риск",
  columnChannels: "Канал",
  columnTier: "Железо",
  columnStatus: "Готовность",

  statusV1: "есть",
  statusV2: "позже",
  statusLater: "потом",
  statusNever: "никогда",

  settingsTitle: "Настройки",
  settingsLead: "Пока здесь только то, что уже работает. Остальное появится вместе с ядром.",
  settingsTheme: "Тема",
  settingsThemeLight: "светлая",
  settingsThemeDark: "тёмная",
  settingsSource: "Источник данных",
  settingsVersion: "Версия",
  settingsLogs: "Журнал",
  settingsLogsDev: "в браузере журнал не пишется — он есть только в приложении",
  settingsData: "Данные",
  settingsDataLead:
    "Реестр, профили и скиллы лежат в репозитории и проверяются CI. Приложение читает их при запуске и не изменяет.",

  stageTitle: "Этап 1 — каркас",
  stageLead: "Что готово и что дальше по BUILD-GUIDE §19.",
  stageDone: "готово",
  stageNext: "дальше",
} as const;

/** Экран «Руки» — инструменты, которые выполняются на этой машине. */
export const hands = {
  nav: "Руки",
  title: "Руки",
  lead:
    "Инструменты выполняются на этой машине. Каждый привязан к строке реестра: риск берётся оттуда, " +
    "а результат подтверждается независимой проверкой, а не словом «готово».",
  count: (n: number) => `${n} инструментов`,
  readOnly: "В браузере инструменты не выполняются — интерфейс показывает их состав и политику.",
  run: "Выполнить",
  cancel: "Отменить",
  running: "Выполняю…",
  params: "Параметры",
  implementation: "Чем выполняется",
  evidence: "Доказательство",
  output: "Вывод",
  empty_output: "вывод пуст",
  duration: (ms: number) => `${ms} мс`,
  deny: "Недоступно",
  needsConfirm: "Требует подтверждения",
  all: "Все инструменты",
  filterAll: "все",
  confirmTitle: "Подтвердите действие",
  confirmLead:
    "Это изменение на вашем компьютере. Проверьте, что именно будет сделано — подтверждение действует один раз.",
  confirmAction: "Подтвердить и выполнить",
  confirmCancel: "Отмена",
  willDo: "Что будет сделано",
  riskNote: (risk: string) => `Риск: ${risk}`,
  ok: "готово",
  failed: "не выполнено",
  timedOut: "истекло время",
  cancelled: "отменено",
  fillParam: (label: string) => `Заполните «${label}»`,
  loadError: "Не удалось получить список инструментов",
} as const;
