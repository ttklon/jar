import { Button, makeStyles, Text, tokens } from "@fluentui/react-components";
import { welcome } from "../i18n/ru";

/**
 * Экран знакомства — то, что человек видит при первом запуске.
 *
 * Здесь нет ни одной кнопки, которая что-то меняет на машине: только «начать» и три
 * перехода туда, где можно посмотреть. Так первый экран не может стать первым
 * неожиданным действием.
 *
 * Оговорка про браузер стоит на экране, а не в документации: в браузере приложение
 * показывает состав и политику, но ничего не выполняет, и человек должен узнать это
 * здесь, а не из упавшей кнопки.
 */

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", gap: "20px", maxWidth: "760px" },
  lead: { color: tokens.colorNeutralForeground2, lineHeight: tokens.lineHeightBase300 },
  rules: { display: "flex", flexDirection: "column", gap: "12px" },
  card: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    padding: "14px 16px",
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground2,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  ruleText: { color: tokens.colorNeutralForeground2 },
  actions: { display: "flex", flexWrap: "wrap", gap: "8px" },
  note: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
});

export type WelcomeTarget = "ask" | "catalog" | "journal";

export function Welcome({
  source,
  onStart,
  onOpen,
}: {
  source: string;
  onStart: () => void;
  onOpen: (target: WelcomeTarget) => void;
}) {
  const styles = useStyles();

  return (
    <div className={styles.root}>
      <div>
        <Text as="h2" size={700} weight="semibold">
          {welcome.title}
        </Text>
        <Text className={styles.lead} block>
          {welcome.lead}
        </Text>
      </div>

      <div className={styles.rules}>
        {welcome.rules.map((rule) => (
          <div key={rule.title} className={styles.card}>
            <Text weight="semibold">{rule.title}</Text>
            <Text className={styles.ruleText}>{rule.text}</Text>
          </div>
        ))}
      </div>

      <div className={styles.actions}>
        <Button appearance="primary" onClick={onStart}>
          {welcome.start}
        </Button>
        <Button appearance="secondary" onClick={() => onOpen("ask")}>
          {welcome.openAsk}
        </Button>
        <Button appearance="secondary" onClick={() => onOpen("catalog")}>
          {welcome.openCatalog}
        </Button>
        <Button appearance="secondary" onClick={() => onOpen("journal")}>
          {welcome.openJournal}
        </Button>
      </div>

      <Text className={styles.note} block>
        {welcome.sourceNote(source)}
      </Text>
    </div>
  );
}
