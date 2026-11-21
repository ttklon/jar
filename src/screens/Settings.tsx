import { useEffect, useState } from "react";
import { Button, makeStyles, Spinner, Switch, Text, tokens } from "@fluentui/react-components";
import { autostartDisable, autostartEnable, autostartStatus, isTauri } from "../ipc";
import type { Autostart } from "../ipc";
import { t } from "../i18n/ru";
import type { ThemeChoice } from "../lib/theme";
import { UndoCard } from "./Undo";
import { DataPlaces } from "./DataPlaces";
import { SelfCheckCard } from "./SelfCheck";
import { MemoryNote } from "../components/MemoryNote";
import { MemoryBackups } from "../components/MemoryBackups";
import { Diagnostics } from "../components/Diagnostics";

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", gap: "20px", maxWidth: "760px" },
  lead: { color: tokens.colorNeutralForeground2 },
  card: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    padding: "16px 18px",
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground2,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  row: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "16px" },
  muted: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  mono: { fontFamily: tokens.fontFamilyMonospace, fontSize: tokens.fontSizeBase200 },
});

export function Settings({
  theme,
  dark,
  onThemeChange,
  onShowWelcome,
  source,
  version,
}: {
  theme: ThemeChoice;
  dark: boolean;
  onThemeChange: (theme: ThemeChoice) => void;
  onShowWelcome: () => void;
  source: string;
  version: string;
}) {
  const styles = useStyles();
  const [autostart, setAutostart] = useState<Autostart | null>(null);
  const [autostartBusy, setAutostartBusy] = useState(false);
  const [autostartError, setAutostartError] = useState<string | null>(null);

  // Состояние читаем из реестра, а не из своей памяти: «я включил» и «включено» —
  // разные утверждения, и показать надо второе.
  useEffect(() => {
    let alive = true;
    autostartStatus()
      .then((value) => {
        if (alive) setAutostart(value);
      })
      .catch((reason: unknown) => {
        if (alive) setAutostartError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => {
      alive = false;
    };
  }, []);

  const toggleAutostart = async (wanted: boolean) => {
    setAutostartBusy(true);
    setAutostartError(null);
    try {
      const next = wanted ? await autostartEnable() : await autostartDisable();
      setAutostart(next);
    } catch (reason) {
      setAutostartError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setAutostartBusy(false);
    }
  };

  return (
    <div className={styles.root}>
      <div>
        <Text as="h2" size={700} weight="semibold">
          {t.settingsTitle}
        </Text>
        <Text className={styles.lead} block>
          {t.settingsLead}
        </Text>
      </div>

      <div className={styles.card}>
        <div className={styles.row}>
          <div>
            <Text weight="semibold">{t.settingsTheme}</Text>
            <Text className={styles.muted} block>
              {theme === "system"
                ? t.settingsThemeSystem(dark)
                : dark
                  ? t.settingsThemeDark
                  : t.settingsThemeLight}
            </Text>
          </div>
          {/* Три состояния, а не выключатель: «как в системе» — это не «светлая»
              и не «тёмная», и человек должен видеть, что он выбрал именно это. */}
          <div className={styles.row} role="radiogroup" aria-label={t.settingsTheme}>
            {(["light", "dark", "system"] as const).map((option) => (
              <Button
                key={option}
                size="small"
                appearance={theme === option ? "primary" : "subtle"}
                aria-pressed={theme === option}
                onClick={() => onThemeChange(option)}
              >
                {option === "light"
                  ? t.settingsThemeLight
                  : option === "dark"
                    ? t.settingsThemeDark
                    : t.settingsThemeSystemLabel}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.row}>
          <div>
            <Text weight="semibold">{t.settingsAutostart}</Text>
            <Text className={styles.muted} block>
              {autostart ? (autostart.enabled ? t.settingsAutostartOn : t.settingsAutostartOff) : t.settingsAutostartReading}
            </Text>
            {autostart?.note ? (
              <Text className={styles.muted} block>
                {autostart.note}
              </Text>
            ) : null}
          </div>
          <div className={styles.row}>
            {/* Спиннер без слов был понятен только зрению. Строка «читаю
                состояние из реестра…» уже была в словаре — её и объявляем. */}
            {autostartBusy ? (
              <span role="status" aria-live="polite">
                <Spinner size="tiny" />
                <Text className={styles.muted}> {t.settingsAutostartReading}</Text>
              </span>
            ) : null}
            <Switch
              checked={autostart?.enabled ?? false}
              // Без прав администратора: запись идёт в HKCU. В браузере реестра
              // нет — выключатель честно недоступен, а не «включён и не работает».
              disabled={!isTauri() || autostartBusy || autostart === null}
              onChange={(_, data) => void toggleAutostart(data.checked)}
              aria-label={t.settingsAutostart}
            />
          </div>
        </div>
        {autostartError ? (
          <Text role="alert" aria-live="polite" className={styles.muted}>
            {t.settingsAutostartError(autostartError)}
          </Text>
        ) : null}
      </div>

      <div className={styles.card}>
        <div className={styles.row}>
          <div>
            <Text weight="semibold">{t.settingsHotkey}</Text>
            <Text className={styles.muted} block>
              {t.settingsHotkeyHint}
            </Text>
          </div>
          <Text className={styles.mono}>{t.settingsHotkeyValue}</Text>
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.row}>
          <Text weight="semibold">{t.settingsSource}</Text>
          <Text className={styles.mono}>{source}</Text>
        </div>
        <div className={styles.row}>
          <Text weight="semibold">{t.settingsVersion}</Text>
          {/* Как в боковом меню: версия с «v» в одном виде, а не в двух. */}
          <Text className={styles.mono}>v{version}</Text>
        </div>
        <div className={styles.row}>
          <Text weight="semibold">{t.settingsLogs}</Text>
          <Text className={styles.muted}>{t.settingsLogsDev}</Text>
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.row}>
          <div>
            <Text weight="semibold">{t.settingsWelcome}</Text>
            <Text className={styles.muted} block>
              {t.settingsWelcomeHint}
            </Text>
          </div>
          <Button appearance="secondary" onClick={onShowWelcome}>
            {t.settingsWelcomeShow}
          </Button>
        </div>
      </div>

      <MemoryNote />
        <MemoryBackups />
        <Diagnostics />

      <DataPlaces />

      <SelfCheckCard />

      {/* Откат — часть настроек, а не отдельный экран: это редкое дело на случай
          «переложил не туда», и искать его должны там же, где всё про поведение. */}
      <UndoCard />

      <div className={styles.card}>
        <Text weight="semibold">{t.settingsData}</Text>
        <Text className={styles.muted}>{t.settingsDataLead}</Text>
      </div>
    </div>
  );
}
