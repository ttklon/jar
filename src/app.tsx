import { useEffect, useState } from "react";
import {
  FluentProvider,
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
  HomeRegular,
  SettingsRegular,
} from "@fluentui/react-icons";
import { isTauri, registrySnapshot } from "./ipc";
import type { RegistrySnapshot } from "./ipc";
import { Overview } from "./screens/Overview";
import { Catalog } from "./screens/Catalog";
import { Settings } from "./screens/Settings";
import { t } from "./i18n/ru";
import { APP_VERSION } from "./version";

type Screen = "overview" | "catalog" | "settings";

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

const NAV: { id: Screen; label: string; icon: React.ReactElement }[] = [
  { id: "overview", label: t.navOverview, icon: <HomeRegular /> },
  { id: "catalog", label: t.navCatalog, icon: <AppsListDetailRegular /> },
  { id: "settings", label: t.navSettings, icon: <SettingsRegular /> },
];

export function App() {
  const styles = useStyles();
  const [screen, setScreen] = useState<Screen>("overview");
  const [dark, setDark] = useState(true);
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
          ) : screen === "overview" ? (
            <Overview snapshot={snapshot} />
          ) : screen === "catalog" ? (
            <Catalog snapshot={snapshot} />
          ) : (
            <Settings
              dark={dark}
              onThemeChange={setDark}
              source={source}
              version={APP_VERSION}
            />
          )}
        </main>
      </div>
    </FluentProvider>
  );
}
