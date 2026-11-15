import { Button, makeStyles, Switch, Text, tokens } from "@fluentui/react-components";
import { t } from "../i18n/ru";
import { UndoCard } from "./Undo";
import { DataPlaces } from "./DataPlaces";

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
  dark,
  onThemeChange,
  onShowWelcome,
  source,
  version,
}: {
  dark: boolean;
  onThemeChange: (dark: boolean) => void;
  onShowWelcome: () => void;
  source: string;
  version: string;
}) {
  const styles = useStyles();

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
              {dark ? t.settingsThemeDark : t.settingsThemeLight}
            </Text>
          </div>
          <Switch checked={dark} onChange={(_, data) => onThemeChange(data.checked)} />
        </div>
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

      <DataPlaces />

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
