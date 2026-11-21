import { useEffect, useState } from "react";
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
import { Overview } from "./screens/Overview";
import { Voice } from "./screens/Voice";
import { Catalog } from "./screens/Catalog";
import { Hands } from "./screens/Hands";
import { Flows } from "./screens/Flows";
import { Ask } from "./screens/Ask";
import { Models } from "./screens/Models";
import { Journal } from "./screens/Journal";
import { Apps } from "./screens/Apps";
import { Settings } from "./screens/Settings";
import { Welcome } from "./screens/Welcome";
import { markWelcomeSeen, shouldShowWelcome } from "./lib/firstRun";
import { filterCommands, type Command } from "./lib/commands";
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
  // Палитра: открывается с клавиатуры, ведёт на любой экран по первым буквам.
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [query, setQuery] = useState("");
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // Ctrl+K и Ctrl+K в русской раскладке (л) — одна и та же привычка.
      if (event.ctrlKey && !event.altKey && !event.metaKey && (event.key === "k" || event.key === "л")) {
        event.preventDefault();
        setQuery("");
        setPaletteOpen((open) => !open);
      }
    };
    globalThis.addEventListener("keydown", onKey);
    return () => globalThis.removeEventListener("keydown", onKey);
  }, []);
  const matches = filterCommands(NAV_COMMANDS, query);
  const go = (id: string) => {
    setScreen(id as Screen);
    setPaletteOpen(false);
  };
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
      <div className={styles.shell}>
        <aside className={styles.sidebar}>
          <div className={styles.brand}>
            <span className={styles.brandName}>{t.appName}</span>
            <span className={styles.tagline}>{t.appTagline}</span>
          </div>

          <nav className={styles.nav}>
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

          <div className={styles.paletteHint}>{t.paletteHint}</div>

          <div className={styles.spacer} />

          <div className={styles.sourceBox}>
            <span>
              {snapshot ? `${snapshot.stats.actions} ${t.statActions}` : "—"} ·{" "}
              {snapshot ? snapshot.stats.domains : "—"} {t.statDomains}
            </span>
            <span>{source}</span>
            <span>v{APP_VERSION}</span>
          </div>
        </aside>

        <main className={styles.main}>
          {!error && snapshot && !welcome ? (
            <div
              style={{ display: screen === "voice" ? "contents" : "none" }}
              aria-hidden={screen !== "voice"}
            >
              <Voice active={screen === "voice"} onOpen={(next) => setScreen(next as Screen)} />
            </div>
          ) : null}
          {error ? (
            <div className={styles.error}>
              <Text as="h2" size={600}>
                {t.loadError}
              </Text>
              <Text>{error}</Text>
            </div>
          ) : snapshot === null ? (
            <div className={styles.center}>
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
          ) : screen === "voice" ? null : screen === "overview" ? (
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
            <Journal />
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
        </main>
      </div>

      {/*
        Палитра — путь к любому экрану без мыши. Она же выход из «я не помню,
        где это было»: человек помнит слово, а не пункт меню.
      */}
      <Dialog open={paletteOpen} onOpenChange={(_, data) => setPaletteOpen(data.open)}>
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
                  }
                }}
              />
              {matches.length === 0 ? (
                <Text className={styles.paletteEmpty}>{t.paletteEmpty(query)}</Text>
              ) : (
                <ul className={styles.paletteList}>
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
