import { makeStyles, Text, tokens } from "@fluentui/react-components";

const useStyles = makeStyles({
  card: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    padding: "14px 18px",
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground2,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    minWidth: "132px",
  },
  value: {
    fontSize: "28px",
    fontWeight: tokens.fontWeightSemibold,
    lineHeight: "34px",
    color: tokens.colorNeutralForeground1,
    fontVariantNumeric: "tabular-nums",
  },
  hint: { color: tokens.colorNeutralForeground3 },
});

export function StatCard({
  value,
  label,
  hint,
}: {
  value: number | string;
  label: string;
  hint?: string;
}) {
  const styles = useStyles();
  return (
    <div className={styles.card}>
      <span className={styles.value}>{value}</span>
      <Text size={300}>{label}</Text>
      {hint ? (
        <Text size={200} className={styles.hint}>
          {hint}
        </Text>
      ) : null}
    </div>
  );
}
