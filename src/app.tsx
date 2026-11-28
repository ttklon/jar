import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  FluentProvider,
  Input,
  makeStyles,
  mergeClasses,
  Spinner,
  Text,
  tokens,
  webDarkTheme,
  webLightTheme,
} from "@fluentui/react-components";
import {
  AccessibilityRegular,
  AppGenericRegular,
  AppsListDetailRegular,
  BrainCircuitRegular,
  BranchRegular,
  CalendarClockRegular,
  DataBarVerticalRegular,
  DocumentBulletListRegular,
  GaugeRegular,
  HandRightRegular,
  HistoryRegular,
  HomeRegular,
  InfoRegular,
  MicRegular,
  PeopleRegular,
  SearchRegular,
  SettingsRegular,
  WrenchRegular,
} from "@fluentui/react-icons";
import { afterWake, engineStatus, isTauri, registrySnapshot } from "./ipc";
import { watchWake } from "./lib/wakeWatch";
import { startBeat } from "./lib/idleBeat";
import { choose } from "./lib/locale";
import type { RegistrySnapshot } from "./ipc";
import { Voice } from "./screens/Voice";
import { Welcome } from "./screens/Welcome";
// Экраны грузятся по требованию (шаги 387/393). Зачем: все одиннадцать в
// первом бандле — это мегабайты разбора до первого кадра, хотя человеку при
// запуске нужен один экран. `Voice` и `Welcome` остаются статическими: они
// показываются сразу, и откладывать их значило бы откладывать первый кадр.
const Overview = lazy(() => import("./screens/Overview").then((m) => ({ default: m.Overview })));
const Catalog = lazy(() => import("./screens/Catalog").then((m) => ({ default: m.Catalog })));
const Hands = lazy(() => import("./screens/Hands").then((m) => ({ default: m.Hands })));
const Flows = lazy(() => import("./screens/Flows").then((m) => ({ default: m.Flows })));
const Ask = lazy(() => import("./screens/Ask").then((m) => ({ default: m.Ask })));
const Models = lazy(() => import("./screens/Models").then((m) => ({ default: m.Models })));
const StateRoute = lazy(() =>
  import("./screens/StateRoute").then((m) => ({ default: m.StateRoute })),
);
const Journal = lazy(() => import("./screens/Journal").then((m) => ({ default: m.Journal })));
const Apps = lazy(() => import("./screens/Apps").then((m) => ({ default: m.Apps })));
const Settings = lazy(() => import("./screens/Settings").then((m) => ({ default: m.Settings })));
const Licenses = lazy(() => import("./screens/Licenses").then((m) => ({ default: m.Licenses })));
const Schedule = lazy(() => import("./screens/Schedule").then((m) => ({ default: m.Schedule })));
const People = lazy(() => import("./screens/People").then((m) => ({ default: m.People })));
const Accessibility = lazy(() => import("./screens/Accessibility").then((m) => ({ default: m.Accessibility })));
const Requirements = lazy(() => import("./screens/Requirements").then((m) => ({ default: m.Requirements })));
const Build = lazy(() => import("./screens/Build").then((m) => ({ default: m.Build })));
const Coverage = lazy(() => import("./screens/Coverage").then((m) => ({ default: m.Coverage })));
import { markWelcomeSeen, shouldShowWelcome } from "./lib/firstRun";
import { DownloadBar, useDownloadProgress } from "./components/DownloadBar";
import { applyScale, readScale } from "./components/TextSizeCard";
import { filterCommands, type Command } from "./lib/commands";
import { readEntry } from "./lib/entry";
import { readScreen, saveScreen } from "./lib/lastScreen";
import { filterFindables, findables, kindLabel } from "./lib/find";
import { fitWork } from "./lib/layout";
import { notice as touchNotice, pointerOf, sizes as touchSizes } from "./lib/touch";
import {
  DEFAULT_CHOICE,
  THEME_KEY,
  parseChoice,
  prefersDark,
  resolveTheme,
  type ThemeChoice,
} from "./lib/theme";
import { ask as askSystem, plan as systemPlan, type System as SystemPrefs } from "./lib/contrast";
import { apply as applyMotion, CSS as MOTION_CSS } from "./lib/motion";
import { apps, ask, flows, hands, journal, models, t, voice } from "./i18n/ru";
import { APP_VERSION } from "./version";

type Screen =
  | "voice"
  | "overview"
  | "catalog"
  | "ask"
  | "hands"
  | "flows"
  | "apps"
  | "models"
  | "journal"
  | "settings"
  | "state"
  | "licenses"
  | "schedule"
  | "people"
  | "accessibility"
  | "requirements"
  | "build"
  | "coverage";

const useStyles = makeStyles({
  shell: {
    display: "grid",
    gridTemplateColumns: "236px 1fr",
    height: "100vh",
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorNeutralForeground1,
    fontFamily: tokens.fontFamilyBase,
  },
  sidebar: {
    display: "flex",
    flexDirection: "column",
    gap: "18px",
    padding: "20px 14px",
    borderRight: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2,
    overflow: "hidden",
  },
  brand: { display: "flex", flexDirection: "column", gap: "2px", padding: "0 8px" },
  paletteList: { listStyle: "none", margin: "10px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: "2px" },
  // Подпись «экран / настройка / возможность». Мелкая и тихая: она отвечает
  // на вопрос «куда я иду», но не спорит с названием за внимание.
  paletteKind: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    marginTop: "2px",
  },
  paletteItem: {
    width: "100%",
    // Палитра открывается с клавиатуры, но выбирают в ней и мышью: 40 px было
    // на грани, 44 — тот же размер, что у навигации.
    minHeight: "44px",
    textAlign: "left",
    padding: "10px 12px",
    borderRadius: tokens.borderRadiusMedium,
    border: "none",
    background: "transparent",
    color: tokens.colorNeutralForeground1,
    fontFamily: tokens.fontFamilyBase,
    fontSize: tokens.fontSizeBase300,
    cursor: "pointer",
    ":hover": { backgroundColor: tokens.colorNeutralBackground2Hover },
    ":focus-visible": { outline: `2px solid ${tokens.colorStrokeFocus2}`, outlineOffset: "2px" },
  },
  paletteEmpty: { display: "block", marginTop: "10px", color: tokens.colorNeutralForeground3 },
  paletteHint: {
    padding: "0 10px",
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
  },
  brandName: { fontSize: "19px", fontWeight: tokens.fontWeightSemibold, letterSpacing: "-0.2px" },
  tagline: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  nav: { display: "flex", flexDirection: "column", gap: "4px" },
  navItem: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    // 44 px — цель, в которую попадает палец и дрожащая рука. Раньше было
    // 36 (8+8 и строка): по правилу доступности (WCAG 2.5.8) это проходит, но
    // шаг 196 просит «крупные цели», а не «минимально допустимые». Вертикальные
    // отступы дали бы разъехавшуюся колонку, поэтому высота задана прямо.
    minHeight: "44px",
    padding: "8px 10px",
    borderRadius: tokens.borderRadiusMedium,
    border: "none",
    backgroundColor: "transparent",
    color: tokens.colorNeutralForeground2,
    fontFamily: tokens.fontFamilyBase,
    fontSize: tokens.fontSizeBase300,
    textAlign: "left",
    cursor: "pointer",
    ":hover": { backgroundColor: tokens.colorNeutralBackground3 },
  },
  navItemActive: {
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorNeutralForeground1,
    fontWeight: tokens.fontWeightSemibold,
    boxShadow: tokens.shadow4,
  },
  spacer: { flex: 1 },
  sourceBox: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    padding: "10px 10px",
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground3,
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase100,
    lineHeight: tokens.lineHeightBase200,
  },
  main: { overflowY: "auto", padding: "30px 36px 60px" },
  center: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "100vh",
    gap: "12px",
    color: tokens.colorNeutralForeground2,
  },
  error: { display: "flex", flexDirection: "column", gap: "10px", maxWidth: "60ch" },
  // Поле единого входа: над содержимым, во всю ширину, но не во всю высоту —
  // это вход, а не экран. Высота 44 px: та же мера, что у кнопок (шаг 196).
  entry: {
    gridColumn: "2",
    display: "flex",
    padding: "10px 20px 0",
  },
  entryField: { width: "100%", minHeight: "44px" },
});

// Голос первым и по умолчанию: приложение открывается для задачи, а не для осмотра.
// Остальное — доказательство под капотом, к которому ходят, когда хотят проверить.
const NAV: { id: Screen; label: string; icon: React.ReactElement; keywords: readonly string[] }[] = [
  { id: "voice", label: voice.nav, icon: <MicRegular />, keywords: ["голос", "микрофон", "voice", "сказать"] },
  { id: "overview", label: t.navOverview, icon: <HomeRegular />, keywords: ["обзор", "сводка", "overview"] },
  // «Состояние» — рядом с «Обзором»: оба отвечают на вопрос «как дела», но
  // обзор — про данные, а состояние — про то, что работает на этой машине.
  { id: "state", label: "Состояние", icon: <InfoRegular />, keywords: ["состояние", "работает", "проверено", "state", "status"] },
  { id: "catalog", label: t.navCatalog, icon: <AppsListDetailRegular />, keywords: ["каталог", "действия", "catalog"] },
  { id: "ask", label: ask.nav, icon: <SearchRegular />, keywords: ["спросить", "план", "ask", "поиск"] },
  { id: "hands", label: hands.nav, icon: <HandRightRegular />, keywords: ["руки", "инструменты", "hands", "tools"] },
  { id: "flows", label: flows.nav, icon: <BranchRegular />, keywords: ["сценарии", "цепочки", "flows"] },
  { id: "apps", label: apps.nav, icon: <AppGenericRegular />, keywords: ["приложения", "профили", "apps"] },
  { id: "models", label: models.nav, icon: <BrainCircuitRegular />, keywords: ["модели", "движок", "models", "llm"] },
  { id: "journal", label: journal.nav, icon: <HistoryRegular />, keywords: ["история", "журнал", "journal", "logs"] },
  { id: "settings", label: t.navSettings, icon: <SettingsRegular />, keywords: ["настройки", "тема", "settings"] },
  // «Лицензии» — рядом с настройками и по той же причине, по которой «Состояние»
  // стоит рядом с «Обзором»: обе отвечают на вопрос о доверии, и обе должны
  // находиться без поиска по документации (шаг 217).
  { id: "licenses", label: "Лицензии", icon: <DocumentBulletListRegular />, keywords: ["лицензии", "licenses", "spdx", "gpl"] },
  // «Расписание» — рядом с журналом: и то и другое про «что происходит само».
  { id: "schedule", label: "Расписание", icon: <CalendarClockRegular />, keywords: ["расписание", "каждый день", "schedule", "авто", "утром"] },
  // «Люди» — рядом с приложениями: и то и другое про «кто чем пользуется».
  { id: "people", label: "Люди", icon: <PeopleRegular />, keywords: ["люди", "профиль", "гость", "people", "семья"] },
  { id: "accessibility", label: "Доступность", icon: <AccessibilityRegular />, keywords: ["доступность", "клавиатура", "диктор", "a11y", "не мышь"] },
  { id: "requirements", label: "Требования", icon: <GaugeRegular />, keywords: ["требования", "батарея", "слабая машина", "экономия", "4 гб"] },
  { id: "build", label: "Сборка", icon: <WrenchRegular />, keywords: ["сборка", "проверки", "тесты", "прогон", "рука", "ci"] },
  { id: "coverage", label: "Покрытие", icon: <DataBarVerticalRegular />, keywords: ["покрытие", "тесты", "coverage", "процент"] },
];

/**
 * Что знают о навигации палитра и единый вход: имя экрана плюс слова, по которым
 * его ищут.
 *
 * Экспортируется, потому что в приложении теперь **два** поля, ведущих по экранам
 * (шаг 181: «скажи или напиши» и `Ctrl+K`), и знать разные имена экранов они не
 * должны: однажды разошлись бы, и «журнал» нашёлся бы в одном поле и не нашёлся
 * в другом.
 */
export const NAV_COMMANDS: Command[] = NAV.map(({ id, label, keywords }) => ({ id, label, keywords }));

export function App() {
  const styles = useStyles();
  // Где человек работал — там и открываем (шаг 191). Не «последний экран вообще»:
  // знакомство не запоминается, и чужое имя не становится местом (см. `lastScreen`).
  const [screen, setScreen] = useState<Screen>(
    () => readScreen(globalThis.localStorage, NAV_COMMANDS.map((item) => item.id)) as Screen,
  );
  // Единый вход (шаг 181): что набрано в поле «скажи или напиши» и что из него
  // передано на экран разговора.
  const [entry, setEntry] = useState("");
  const [handed, setHanded] = useState<{ text: string; at: number } | null>(null);
  // Знакомство показывается один раз. Решение — в `firstRun`, чтобы его проверяли тесты,
  // а не глаза: «один раз» слишком легко превращается в «каждый раз».
  const [welcome, setWelcome] = useState(() => shouldShowWelcome());
  // Опрос идёт только пока есть загрузка; без неё таймера нет (шаг 384).
  const progress = useDownloadProgress();
  // Тема — не украшение: раньше она была зашита тёмной и системная настройка
  // Windows не значила ничего. «Как в системе» — третий выбор рядом с двумя явными.
  const [choice, setChoice] = useState<ThemeChoice>(() => {
    const stored = parseChoice(globalThis.localStorage?.getItem(THEME_KEY));
    return stored ?? DEFAULT_CHOICE;
  });
  const [systemDark, setSystemDark] = useState(() => {
    const mql = globalThis.matchMedia?.("(prefers-color-scheme: dark)");
    return mql ? mql.matches : prefersDark(() => true);
  });
  useEffect(() => {
    const mql = globalThis.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mql) return;
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  /**
   * Шаг 186: система рассказывает не только про тему. Высокий контраст и
   * уменьшение движения — отдельные вопросы, и «тёмная тема» на них не отвечает.
   * Спрашиваем и подписываемся: человек, включивший контраст, не должен
   * перезапускать приложение, чтобы его заметили.
   */
  const [prefs, setPrefs] = useState<SystemPrefs>(() =>
    askSystem((q) => globalThis.matchMedia?.(q).matches ?? false, systemDark),
  );
  useEffect(() => {
    const queries = [
      "(prefers-color-scheme: dark)",
      "(forced-colors: active)",
      "(-ms-high-contrast: active)",
      "(prefers-reduced-motion: reduce)",
    ];
    const lists = queries.map((q) => globalThis.matchMedia?.(q)).filter((mql): mql is MediaQueryList => Boolean(mql));
    if (lists.length === 0) return;
    const onChange = () =>
      setPrefs(askSystem((q) => globalThis.matchMedia?.(q).matches ?? false, systemDark));
    for (const mql of lists) mql.addEventListener("change", onChange);
    return () => {
      for (const mql of lists) mql.removeEventListener("change", onChange);
    };
  }, [systemDark]);
  const prefsPlan = systemPlan(prefs);
  /**
   * Шаг 187: `still` вычислялся и никуда не доходил — настройка, которая ничего
   * не меняет. Теперь она **применяется атрибутом на корне документа**: так её
   * видят и CSS, и чужие компоненты, и не надо передавать проп в сорок мест.
   */
  useEffect(() => {
    const undo = applyMotion(document.documentElement, prefsPlan.still);
    // Правило вставляется один раз: без него атрибут — просто подпись.
    const id = "jar-motion";
    if (!document.getElementById(id)) {
      const style = document.createElement("style");
      style.id = id;
      style.textContent = MOTION_CSS;
      document.head.appendChild(style);
    }
    return undo;
  }, [prefsPlan.still]);
  const dark = prefsPlan.systemColors ? prefsPlan.theme === "dark" : resolveTheme(choice, systemDark) === "dark";
  // Ширина окна: при 200% масштабе или маленьком окне колонка уходит наверх,
  // иначе содержимое сжимается в полоску. Правило — в `layout.ts`, здесь только подписка.
  const [width, setWidth] = useState(() => globalThis.innerWidth || 1200);
  useEffect(() => {
    const onResize = () => setWidth(globalThis.innerWidth || 1200);
    globalThis.addEventListener("resize", onResize);
    return () => globalThis.removeEventListener("resize", onResize);
  }, []);
  // Шаг 222: обещание «от 1024×600» проверяется `fitWork`, а не одной шириной:
  // при экране ниже минимума колонка уходит наверх, чтобы низ не уезжал за край.
  const fit = fitWork({ width, height: globalThis.innerHeight || 800 });
  const layout = fit.layout;
  // Шаг 223: размер цели — не константа, а следствие указателя. 44 px хороши для
  // пальца и разрежают экран там, где мышь; 32 — наоборот. Спрашиваем среду один
  // раз при запуске: тип указателя не меняется от перерисовки, а слушатель
  // `matchMedia` на каждый рендер — это утечка.
  const [pointer] = useState(() =>
    pointerOf((query) => globalThis.matchMedia?.(query) ?? { matches: false }),
  );
  const target = touchSizes(pointer);
  // Язык системы читается один раз за запуск: он не меняется на ходу, а
  // пересчитывать его на каждый кадр — работа без пользы.
  const [localeChoice] = useState(() =>
    choose(typeof navigator === "undefined" ? null : navigator.language, null),
  );
  const localeNotice = () => localeChoice.notice;
  // Палитра: открывается с клавиатуры, ведёт на любой экран по первым буквам.
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [query, setQuery] = useState("");
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // Ctrl+K и Ctrl+K в русской раскладке (л) — одна и та же привычка.
      if (event.ctrlKey && !event.altKey && !event.metaKey && (event.key === "k" || event.key === "л")) {
        event.preventDefault();
        setQuery("");
        // Ctrl+K и закрывает тоже: тогда фокус возвращается, а не теряется.
        if (paletteOpen) togglePalette(false);
        else togglePalette(true);
      }
    };
    globalThis.addEventListener("keydown", onKey);
    return () => globalThis.removeEventListener("keydown", onKey);
  }, []);
  // Одно поле ищет и экраны, и настройки, и возможности (шаг 192). Раньше
  // палитра знала только экраны: на «где тема» она отвечала «Настройки» — то
  // есть человек всё равно искал глазами внутри, — а «скачать модель» не
  // находилось вовсе, потому что такого экрана нет.
  const screenMatches = filterCommands(NAV_COMMANDS, query).map((command) => ({
    ...command,
    kind: "screen" as const,
  }));
  const otherMatches = filterFindables(findables(), query);
  // Экраны первыми: их меньше и они — главный путь. Настройки и возможности
  // следом: если человек искал именно их, слово всё равно выше.
  const matches = [...screenMatches, ...otherMatches];
  const go = (id: string) => {
    // Экран выбран — значит, после закрытия палитры фокус идёт в его поле, а не
    // обратно на кнопку, которой человек уже не пользуется.
    chosen.current = true;
    setScreen(id as Screen);
    // Через `togglePalette`, а не голый `setPaletteOpen`: выбор экрана тоже
    // закрывает палитру, и фокус должен вернуться так же, как после Esc.
    togglePalette(false);
  };

  // Куда вернуть фокус после закрытия палитры. Открыть её можно было и мышью
  // (кнопка), и клавишей (Ctrl+K) — во втором случае «откуда пришли» это то
  // место, где человек был до неё. Без возврата фокус после Esc падает в
  // `document.body`, и следующий Tab начинает с самого начала страницы:
  // для того, кто ходит табуляцией, это потеря места.
  const beforePalette = useRef<HTMLElement | null>(null);
  /** Палитру закрыли выбором экрана (а не Esc) — фокус пойдёт в поле. */
  const chosen = useRef(false);

  /** Открыть/закрыть палитру, запомнив, куда вернуть фокус. */
  const togglePalette = (open: boolean) => {
    if (open) {
      // Запоминать надо **здесь**, а не в эффекте: к моменту, когда эффект
      // увидит `paletteOpen === true`, Fluent уже перехватил фокус в диалог, и
      // «откуда пришли» оказывается самим диалогом. Проверено: сохранялся DIV
      // панели, а не кнопка навигации.
      const active = document.activeElement;
      beforePalette.current =
        active instanceof HTMLElement && active !== document.body ? active : null;
    }
    setPaletteOpen(open);
  };

  /**
   * Куда вернуть фокус после выбора экрана — и почему не туда, откуда пришли.
   *
   * Возврат «туда, откуда открыли» верен для Esc: человек передумал и хочет
   * остаться где был. Для **выбора** экрана это ошибка: он выбрал другой экран,
   * и фокус на старой кнопке навигации заставляет следующую табуляцию идти по
   * меню, а не по делу. Правило `keyboardOnly` говорит это прямым текстом:
   * «Enter → экран дела, поле фразы». Поэтому после выбора ведём в первое поле
   * нового экрана; если полей нет — в его заголовок.
   */
  const toScreenField = () => {
    const field = document.querySelector<HTMLElement>(
      "main input:not([type=hidden]), main textarea, main [role=combobox]",
    );
    if (field) {
      field.focus();
      return true;
    }
    const heading = document.querySelector<HTMLElement>("main h1, main h2, main [role=heading]");
    (heading ?? document.querySelector<HTMLElement>("nav button"))?.focus();
    return false;
  };

  /** Вернуть фокус туда, откуда палитру открыли. */
  const restoreFocus = (byChoice: boolean) => {
    const target = beforePalette.current;
    beforePalette.current = null;
    if (byChoice) {
      toScreenField();
      return;
    }
    // Если запомнить было нечего (открыли сразу после запуска, до первого Tab),
    // ведём в навигацию: это начало пути по приложению, а не пустое тело.
    const fallback = document.querySelector<HTMLElement>("nav button");
    const to = target && document.contains(target) ? target : fallback;
    to?.focus();
  };

  useEffect(() => {
    if (paletteOpen) return;
    restoreFocus(chosen.current);
    chosen.current = false;
  }, [paletteOpen]);
  const onThemeChange = (next: ThemeChoice) => {
    setChoice(next);
    try {
      globalThis.localStorage?.setItem(THEME_KEY, next);
    } catch {
      // Запомнить негде — тема всё равно применилась; это не повод падать.
    }
  };
  // Сон машины (шаг 142). После долгого отсутствия окна проверяем движок: он
  // мог не пережить сон, и тогда разговор начался бы с мёртвым движком, сделав
  // вид, что всё в порядке. Проверяем только на экране разговора — на остальных
  // движок никому не нужен, и поднимать его там значило бы тратить память на
  // работу, которую не просили.
  const screenRef = useRef(screen);
  screenRef.current = screen;
  useEffect(() => {
    if (!isTauri()) return;
    return watchWake(
      () => {
        void afterWake().catch(() => {
          // Молча: не удалось проверить — разговор сам скажет об этом, когда
          // человек попробует говорить. Писать «сон не проверен» на экран
          // значило бы пугать тем, чего человек не просил.
        });
      },
      { talking: () => screenRef.current === "voice" },
    );
  }, []);

  // Шаг 227: движок в простое отпускается **независимо от экрана**.
  //
  // Дефект: `engine_status` спрашивали только из экрана «Модели», и
  // `release_if_idle` не вызывался вовсе, пока экран закрыт. Механизм выгрузки
  // был, а выгрузки не было: движок жил в памяти весь день, грел ноутбук и ел
  // батарею. Здесь — редкий тик раз в минуту, и только когда окно видимо: в
  // скрытом окне приложение не «в простое», а не работает.
  useEffect(() => {
    if (!isTauri()) return;
    const visibility = () =>
      typeof document === "undefined" ? true : document.visibilityState === "visible";
    const stop = startBeat(() => {
      // Скрытое окно — не простой, а «не работаем»: спрашивать незачем.
      if (!visibility()) return;
      // Спрашиваем ядро: оно само решит, истёк ли простой и надо ли отпускать.
      // Порог остаётся **один** — в `idle.rs`, а не здесь: второй порог в
      // интерфейсе разошёлся бы с первым, и никто бы не заметил.
      void engineStatus().catch(() => {
        // Молча: не удалось спросить — не повод шуметь. Следующий тик через
        // минуту попробует снова.
      });
    });
    return stop;
  }, []);

  /**
   * Масштаб текста — при запуске, а не только по нажатию (шаг 10).
   *
   * Выбор человека сохраняется, значит при следующем запуске он должен
   * действовать с первого кадра: иначе человек с плохим зрением каждое утро
   * видит мелкий текст и идёт его увеличивать заново. Читаем тем же правилом,
   * что и настройка, — двух разных «что было выбрано» быть не должно.
   */
  useEffect(() => {
    applyScale(readScale(globalThis.localStorage), globalThis.document?.documentElement ?? null);
  }, []);

  // Место запоминается одним эффектом, а не `setItem` в каждой кнопке: переходов
  // пять (лента, палитра, единый вход, «Знакомство», кнопки экранов), и забыть
  // один из них — вопрос времени.
  useEffect(() => {
    saveScreen(globalThis.localStorage, screen);
  }, [screen]);

  const [snapshot, setSnapshot] = useState<RegistrySnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    registrySnapshot()
      .then((data) => {
        if (alive) setSnapshot(data);
      })
      .catch((reason: unknown) => {
        if (alive) setError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => {
      alive = false;
    };
  }, []);

  const source = isTauri() ? t.dataSource.core : t.dataSource.dev;

  return (
    <FluentProvider theme={dark ? webDarkTheme : webLightTheme} style={{ height: "100vh" }}>
      <div
        className={styles.shell}
        style={
          layout.narrow
            ? { gridTemplateColumns: "1fr", gridTemplateRows: "auto 1fr" }
            : { gridTemplateColumns: `${layout.sidebarWidth}px 1fr` }
        }
      >
        <aside
          className={styles.sidebar}
          style={
            layout.narrow
              ? {
                  // Колонки больше нет; рамка справа осталась бы полосой вдоль
                  // всего экрана, будто там что-то есть. Полоса теперь снизу —
                  // она и отделяет ленту навигации от содержимого.
                  // `0`, а не `none`: jsdom и браузер выбрасывают «значение по
                  // умолчанию» из сериализованного стиля, и проверить `none`
                  // в тесте невозможно — он «не применяется» и тогда, когда
                  // применён.
                  borderRight: 0,
                  borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
                  // `overflow: hidden` был нужен, чтобы длинная навигация не
                  // растягивала колонку. В ленте он режет перенос: кнопки
                  // уезжают за край, и на узком экране их не достать.
                  overflow: "visible",
                  padding: "10px 14px",
                  gap: "10px",
                }
              : undefined
          }
        >
          <div className={styles.brand}>
            <span className={styles.brandName}>{t.appName}</span>
            <span className={styles.tagline}>{t.appTagline}</span>
          </div>

          <nav
            className={styles.nav}
            // Стрелки между экранами (шаг 191). Все пункты — настоящие кнопки, и
            // Tab по ним уже ходит; стрелки добавляются потому, что ими идут
            // люди, привыкшие к меню, и потому, что это не отнимает у Tab
            // ничего: вниз/вправо — следующий пункт, вверх/влево — предыдущий,
            // Home/End — крайние. Фокус двигается явно, а не «куда-нибудь»:
            // иначе человек не знает, где окажется.
            onKeyDown={(event) => {
              const keys = ["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft", "Home", "End"];
              if (!keys.includes(event.key)) return;
              const buttons = Array.from(
                (event.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>("button"),
              );
              if (buttons.length === 0) return;
              const at = buttons.findIndex((button) => button === document.activeElement);
              const forward = event.key === "ArrowDown" || event.key === "ArrowRight";
              const backward = event.key === "ArrowUp" || event.key === "ArrowLeft";
              if (at === -1 && !forward && !backward && event.key !== "Home" && event.key !== "End") {
                return;
              }
              let next = at;
              if (event.key === "Home") next = 0;
              else if (event.key === "End") next = buttons.length - 1;
              else if (forward) next = (at + 1 + buttons.length) % buttons.length;
              else if (backward) next = (at - 1 + buttons.length) % buttons.length;
              if (next < 0 || next >= buttons.length) return;
              event.preventDefault();
              buttons[next]?.focus();
            }}
            style={
              layout.narrow
                ? { flexDirection: "row", flexWrap: "wrap", gap: "4px" }
                : undefined
            }
          >
            {NAV.map((item) => (
              <button
                key={item.id}
                type="button"
                className={mergeClasses(styles.navItem, screen === item.id && styles.navItemActive)}
                onClick={() => setScreen(item.id)}
                // Палец попадает в пункт, а не мимо: высота идёт от указателя.
                style={{ minHeight: `${target.control}px` }}
                aria-current={screen === item.id ? "page" : undefined}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </nav>

          {layout.narrow ? null : <div className={styles.paletteHint}>{t.paletteHint}</div>}

          {/* Распорка нужна, чтобы подпись прилипла к низу колонки. В ленте
              она съедает высоту экрана и выталкивает подпись за край. */}
          {layout.narrow ? null : <div className={styles.spacer} />}

          <div className={styles.sourceBox}>
            <span>
              {snapshot ? `${snapshot.stats.actions} ${t.statActions}` : "—"} ·{" "}
              {snapshot ? snapshot.stats.domains : "—"} {t.statDomains}
            </span>
            <span>{source}</span>
            {/* Шаг 223: молчаливое изменение размера читается как «сломалось».
                Одна фраза объясняет, почему цели стали крупнее. */}
            {touchNotice(pointer) ? <span>{touchNotice(pointer)}</span> : null}
            {/* Шаг 229: на нерусской системе человек видел русский интерфейс
                без единого слова о том, почему. Он не отличал «перевода нет»
                от «сломалось», а второе читается как недоверие ко всему
                приложению. Одна строка — и причина названа. */}
            {localeNotice() ? <span>{localeNotice()}</span> : null}
            <span>v{APP_VERSION}</span>
          </div>
        </aside>

          {/*
            Шаг 33: загрузка видна с любого экрана. Стоит в `main`, а не в
            карточке готовности: карточка живёт на знакомстве, и ушедший в
            «Историю» человек полчаса не знал бы, идёт ли скачивание.
          */}
          <DownloadBar progress={progress} />

        {/*
          Шаг 181: один вход, всегда на виду. До этого поле было только на экране
          «Голос»: ушёл в «Историю» — и чтобы что-то сказать, надо вспомнить, что
          говорить надо не здесь, и вернуться. Два поля, которые ведут по экранам
          (это и Ctrl+K), берут имена из одного списка `NAV_COMMANDS`.
        */}
        <form
          className={styles.entry}
          onSubmit={(event) => {
            event.preventDefault();
            const outcome = readEntry(NAV_COMMANDS, entry);
            if (outcome.kind === "empty") return;
            if (outcome.kind === "screen") {
              setScreen(outcome.id as Screen);
            } else {
              // Не отправляем за человека: кладём фразу в поле разговора, чтобы
              // он её видел, мог поправить и отправил сам.
              setHanded({ text: outcome.text, at: Date.now() });
              setScreen("voice");
            }
            setEntry("");
          }}
        >
          <Input
            className={styles.entryField}
            value={entry}
            onChange={(_, data) => setEntry(data.value)}
            placeholder={t.entryPlaceholder}
            aria-label={t.entryPlaceholder}
          />
        </form>

        <main className={styles.main} style={layout.narrow ? { padding: "16px 14px 40px" } : undefined}>
          {!error && snapshot && !welcome ? (
            <div
              style={{ display: screen === "voice" ? "contents" : "none" }}
              aria-hidden={screen !== "voice"}
            >
              <Voice
                active={screen === "voice"}
                handed={handed}
                onOpen={(next) => setScreen(next as Screen)}
              />
            </div>
          ) : null}
          {error ? (
            <div className={styles.error} role="alert" aria-live="assertive">
              <Text as="h2" size={600}>
                {t.loadError}
              </Text>
              {/* Здесь заголовок уже сказал «ошибка», поэтому без подписи
                  диктора: дважды «ошибка» в одном объявлении — шум. */}
              <Text>{error}</Text>
            </div>
          ) : snapshot === null ? (
            // Словами «Читаю реестр…» — и как `status`: диктор узнаёт о
            // загрузке, а не остаётся в тишине перед внезапным экраном.
            <div className={styles.center} role="status" aria-live="polite">
              <Spinner size="small" />
              <Text>{t.loading}</Text>
            </div>
          ) : welcome ? (
            <Welcome
              source={source}
              onStart={() => {
                markWelcomeSeen();
                setWelcome(false);
                setScreen("voice");
              }}
              onOpen={(target) => {
                markWelcomeSeen();
                setWelcome(false);
                setScreen(target);
              }}
            />
          ) : screen === "voice" ? null : (
            // Пока экран грузится, говорим, что грузится: пустое место на
            // месте экрана читается как «сломалось».
            <Suspense
              fallback={
                // Заглушка объявляет себя: диктор должен сказать «загружаю
                // экран», а не оставить человека в тишине перед подменой.
                <div role="status" aria-live="polite" aria-label={t.screenLoading}>
                  <Spinner size="small" label={t.screenLoading} />
                </div>
              }
            >
              {screen === "overview" ? (
                <Overview snapshot={snapshot} />
              ) : screen === "state" ? (
                <StateRoute onGo={(next) => setScreen(next as Screen)} />
              ) : screen === "catalog" ? (
                <Catalog snapshot={snapshot} />
              ) : screen === "ask" ? (
                <Ask />
              ) : screen === "hands" ? (
                <Hands />
              ) : screen === "flows" ? (
                <Flows />
              ) : screen === "apps" ? (
                <Apps />
              ) : screen === "models" ? (
                <Models />
              ) : screen === "journal" ? (
                <Journal
                  onOpenSettings={() => setScreen("settings")}
                  onOpenAsk={() => setScreen("ask")}
                />
              ) : screen === "licenses" ? (
                <Licenses />
              ) : screen === "schedule" ? (
                <Schedule />
              ) : screen === "people" ? (
                <People />
              ) : screen === "accessibility" ? (
                <Accessibility />
              ) : screen === "requirements" ? (
                <Requirements />
              ) : screen === "build" ? (
                <Build />
              ) : screen === "coverage" ? (
                <Coverage />
              ) : (
                <Settings
                  theme={choice}
                  dark={dark}
                  onThemeChange={onThemeChange}
                  onShowWelcome={() => setWelcome(true)}
                  source={source}
                  version={APP_VERSION}
                />
              )}
            </Suspense>
          )}
        </main>
      </div>

      {/*
        Палитра — путь к любому экрану без мыши. Она же выход из «я не помню,
        где это было»: человек помнит слово, а не пункт меню.
      */}
      <Dialog open={paletteOpen} onOpenChange={(_, data) => togglePalette(data.open)}>
        <DialogSurface aria-label={t.paletteTitle}>
          <DialogBody>
            <DialogTitle>{t.paletteTitle}</DialogTitle>
            <DialogContent>
              <Input
                autoFocus
                aria-label={t.paletteSearch}
                placeholder={t.palettePlaceholder}
                value={query}
                onChange={(_, data) => setQuery(data.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && matches[0]) {
                    event.preventDefault();
                    go(matches[0].id);
                    return;
                  }
                  // Esc внутри палитры — тот же выход, что и у диалога, но с
                  // возвратом фокуса. Fluent закрывает сам, но без возврата.
                  if (event.key === "Escape") {
                    event.preventDefault();
                    togglePalette(false);
                  }
                }}
              />
              {matches.length === 0 ? (
                <Text className={styles.paletteEmpty}>{t.paletteEmpty(query)}</Text>
              ) : (
                <ul className={styles.paletteList} data-testid="palette">
                  {matches.map((command) => (
                    // Ключ — не `id`: на «Настройки» ведут и сама настройка, и
                    // несколько возможностей, и одинаковый ключ заставил бы
                    // React переиспользовать чужие строки.
                    <li key={`${command.kind}:${command.id}:${command.label}`}>
                      <button
                        type="button"
                        className={styles.paletteItem}
                        onClick={() => go(command.id)}
                      >
                        {command.label}
                        {/* «Тема» и «экран» — разные вещи; человек должен видеть,
                            куда именно он идёт, до нажатия. */}
                        <Text className={styles.paletteKind} block>
                          {kindLabel(command.kind)}
                        </Text>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </DialogContent>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </FluentProvider>
  );
}
