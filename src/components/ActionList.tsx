import { makeStyles, Text, tokens } from "@fluentui/react-components";
import type { PlanItem } from "../ipc";
import { ask } from "../i18n/ru";
import { RiskBadge } from "./RiskBadge";

/**
 * Список найденных действий. Один и тот же на голосовом экране и на «Спросить»:
 * ответ на задачу не должен выглядеть по-разному в зависимости от того, как задача
 * попала в приложение — голосом или печатью.
 */

const useStyles = makeStyles({
  list: { display: "flex", flexDirection: "column", gap: "8px", maxWidth: "96ch" },
  card: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    padding: "12px 14px",
    borderRadius: tokens.borderRadiusLarge,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  head: { display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" },
  example: { fontSize: tokens.fontSizeBase300, fontWeight: tokens.fontWeightSemibold },
  key: {
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForeground3,
  },
  meta: {
    display: "flex",
    gap: "10px",
    alignItems: "center",
    flexWrap: "wrap",
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
  },
  hand: { color: tokens.colorPaletteGreenForeground2, fontWeight: tokens.fontWeightSemibold },
  noHand: { color: tokens.colorNeutralForeground3, fontStyle: "italic" },
});

export function ActionList({ items }: { items: PlanItem[] }) {
  const styles = useStyles();

  return (
    <div className={styles.list}>
      {items.map((item) => (
        <div key={item.key} className={styles.card}>
          <div className={styles.head}>
            <span className={styles.example}>{item.example}</span>
            <RiskBadge risk={item.risk} />
            <span className={styles.key}>{item.key}</span>
          </div>
          <div className={styles.meta}>
            {item.tool ? (
              <span className={styles.hand}>{ask.canRun}</span>
            ) : (
              <span className={styles.noHand}>{ask.noHand}</span>
            )}
            <span>{item.decision_reason}</span>
            <Text>{ask.score(item.score)}</Text>
          </div>
        </div>
      ))}
    </div>
  );
}
