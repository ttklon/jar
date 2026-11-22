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
  AppsListDetailRegular,
  AppGenericRegular,
  BrainCircuitRegular,
  BranchRegular,
  HandRightRegular,
  HistoryRegular,
  HomeRegular,
  MicRegular,
  SearchRegular,
  SettingsRegular,
} from "@fluentui/react-icons";
import { isTauri, registrySnapshot } from "./ipc";
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
const Journal = lazy(() => import("./screens/Journal").then((m) => ({ default: m.Journal })));
const Apps = lazy(() => import("./screens/Apps").then((m) => ({ default: m.Apps })));
const Settings = lazy(() => import("./screens/Settings").then((m) => ({ default: m.Settings })));
import { markWelcomeSeen, shouldShowWelcome } from "./lib/firstRun";
import { filterCommands, type Command } from "./lib/commands";
import { layoutFor } from "./lib/layout";
import {
  DEFAULT_CHOICE,
  THEME_KEY,
  parseChoice,
  prefersDark,
  resolveTheme,
  type ThemeChoice,
} from "./lib/theme";
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
  | "settings";

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
});

// Голос первым и по умолчанию: приложение открывается для задачи, а не для осмотра.
// Остальное — доказательство под капотом, к которому ходят, когда хотят проверить.
const NAV: { id: Screen; label: string; icon: React.ReactElement; keywords: readonly string[] }[] = [
  { id: "voice", label: voice.nav, icon: <MicRegular />, keywords: ["голос", "микрофон", "voice", "сказать"] },
  { id: "overview", label: t.navOverview, icon: <HomeRegular />, keywords: ["обзор", "сводка", "overview"] },
  { id: "catalog", label: t.navCatalog, icon: <AppsListDetailRegular />, keywords: ["каталог", "действия", "catalog"] },
  { id: "ask", label: ask.nav, icon: <SearchRegular />, keywords: ["спросить", "план", "ask", "поиск"] },
  { id: "hands", label: hands.nav, icon: <HandRightRegular />, keywords: ["руки", "инструменты", "hands", "tools"] },
  { id: "flows", label: flows.nav, icon: <BranchRegular />, keywords: ["сценарии", "цепочки", "flows"] },
  { id: "apps", label: apps.nav, icon: <AppGenericRegular />, keywords: ["приложения", "профили", "apps"] },
  { id: "models", label: models.nav, icon: <BrainCircuitRegular />, keywords: ["модели", "движок", "models", "llm"] },
  { id: "journal", label: journal.nav, icon: <HistoryRegular />, keywords: ["история", "журнал", "journal", "logs"] },
  { id: "settings", label: t.navSettings, icon: <SettingsRegular />, keywords: ["настройки", "тема", "settings"] },
];

/** Что палитра знает о навигации: имя экрана плюс слова, по которым его ищут. */
const NAV_COMMANDS: Command[] = NAV.map(({ id, label, keywords }) => ({ id, label, keywords }));

export function App() {
  const styles = useStyles();
  const [screen, setScreen] = useState<Screen>("voice");
  // Знакомство показывается один раз. Решение — в `firstRun`, чтобы его проверяли тесты,
  // а не глаза: «один раз» слишком легко превращается в «каждый раз».
  const [welcome, setWelcome] = useState(() => shouldShowWelcome());
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
  const dark = resolveTheme(choice, systemDark) === "dark";
  // Ширина окна: при 200% масштабе или маленьком окне колонка уходит наверх,
  // иначе содержимое сжимается в полоску. Правило — в `layout.ts`, здесь только подписка.
  const [width, setWidth] = useState(() => globalThis.innerWidth || 1200);
  useEffect(() => {
    const onResize = () => setWidth(globalThis.innerWidth || 1200);
    globalThis.addEventListener("resize", onResize);
    return () => globalThis.removeEventListener("resize", onResize);
  }, []);
  const layout = layoutFor(width);
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
  const matches = filterCommands(NAV_COMMANDS, query);
  const go = (id: string) => {
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

  /** Вернуть фокус туда, откуда палитру открыли. */
  const restoreFocus = () => {
    const target = beforePalette.current;
    beforePalette.current = null;
    // Если запомнить было нечего (открыли сразу после запуска, до первого Tab),
    // ведём в навигацию: это начало пути по приложению, а не пустое тело.
    const fallback = document.querySelector<HTMLElement>("nav button");
    const to = target && document.contains(target) ? target : fallback;
    to?.focus();
  };

  useEffect(() => {
    if (paletteOpen) return;
    restoreFocus();
  }, [paletteOpen]);
  const onThemeChange = (next: ThemeChoice) => {
    setChoice(next);
    try {
      globalThis.localStorage?.setItem(THEME_KEY, next);
    } catch {
      // Запомнить негде — тема всё равно применилась; это не повод падать.
    }
  };
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
            <span>v{APP_VERSION}</span>
          </div>
        </aside>

        <main className={styles.main} style={layout.narrow ? { padding: "16px 14px 40px" } : undefined}>
          {!error && snapshot && !welcome ? (
            <div
              style={{ display: screen === "voice" ? "contents" : "none" }}
              aria-hidden={screen !== "voice"}
            >
              <Voice active={screen === "voice"} onOpen={(next) => setScreen(next as Screen)} />
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
                    <li key={command.id}>
                      <button type="button" className={styles.paletteItem} onClick={() => go(command.id)}>
                        {command.label}
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
