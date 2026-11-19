import { makeStyles, mergeClasses, tokens } from "@fluentui/react-components";
import type { Risk } from "../ipc";
import { RISK_LABEL } from "../i18n/ru";

const useStyles = makeStyles({
  base: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    padding: "2px 10px",
    borderRadius: "999px",
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
    lineHeight: tokens.lineHeightBase200,
    whiteSpace: "nowrap",
  },
  dot: { width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "currentColor" },
  read: {
    backgroundColor: tokens.colorNeutralBackground4,
    color: tokens.colorNeutralForeground2,
  },
  write: {
    backgroundColor: tokens.colorPaletteBlueBackground2,
    color: tokens.colorPaletteBlueForeground2,
  },
  external: {
    backgroundColor: tokens.colorPaletteYellowBackground2,
    color: tokens.colorPaletteDarkOrangeForeground2,
  },
  destructive: {
    backgroundColor: tokens.colorPaletteRedBackground2,
    color: tokens.colorPaletteRedForeground2,
  },
  identity: {
    backgroundColor: tokens.colorPalettePurpleBackground2,
    color: tokens.colorPalettePurpleForeground2,
  },
  money: {
    backgroundColor: tokens.colorPaletteBrownBackground2,
    color: tokens.colorPaletteBrownForeground2,
  },
});

const CLASS_BY_RISK: Record<Risk, keyof ReturnType<typeof useStyles>> = {
  read: "read",
  "write-local": "write",
  external: "external",
  destructive: "destructive",
  identity: "identity",
  money: "money",
};

export function RiskBadge({ risk }: { risk: Risk }) {
  const styles = useStyles();
  return (
    <span className={mergeClasses(styles.base, styles[CLASS_BY_RISK[risk]])}>
      <span className={styles.dot} aria-hidden="true" />
      {RISK_LABEL[risk]}
    </span>
  );
}
