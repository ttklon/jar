import { makeStyles, Text, tokens } from "@fluentui/react-components";
import { STRENGTHS, boundaries } from "../lib/ownStrengths";

/**
 * «Что умею лучше» — три силы и три предела (шаг 48б).
 *
 * Правило `ownStrengths` было написано и не подключено. Его главная мысль: сила
 * без названной границы — лозунг. Поэтому на экране они стоят **вместе**: что
 * получается и где это кончается. Человек, прочитавший только «руки на
 * Windows», решит, что приложение работает и в игре.
 */

const useStyles = makeStyles({
  card: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    padding: "16px 18px",
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground2,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  row: { display: "flex", flexDirection: "column", gap: "2px" },
  muted: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
});

export function StrengthsCard() {
  const styles = useStyles();
  return (
    <div className={styles.card}>
      <Text weight="semibold" block>
        Что умею лучше
      </Text>
      <Text className={styles.muted} block>
        Три вещи — и у каждой назван предел: обещание без границы это не сила, а реклама.
      </Text>
      {STRENGTHS.map((strength) => (
        <div key={strength.id} className={styles.row}>
          <Text weight="semibold">{strength.name}</Text>
          <Text>{strength.edge}</Text>
          {/* Предел — не мелким шрифтом в конце: он стоит рядом, потому что он
              такая же часть ответа, как и сама сила. */}
          <Text className={styles.muted}>{`предел: ${strength.limit}`}</Text>
        </div>
      ))}
      <div className={styles.row}>
        <Text weight="semibold">Чего нет</Text>
        {boundaries().map((line) => (
          <Text key={line} className={styles.muted}>
            {line}
          </Text>
        ))}
      </div>
    </div>
  );
}
