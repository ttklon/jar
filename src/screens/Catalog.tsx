import { useMemo, useState } from "react";
import {
  Button,
  Input,
  makeStyles,
  mergeClasses,
  Text,
  tokens,
} from "@fluentui/react-components";
import type { Action, RegistrySnapshot, Risk } from "../ipc";
import { RISK_ORDER } from "../ipc";
import { filterByRisk, searchActions } from "../lib/registry";
import { RISK_LABEL, TIER_LABEL, t } from "../i18n/ru";
import { RiskBadge } from "../components/RiskBadge";

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", gap: "18px" },
  lead: { color: tokens.colorNeutralForeground2, maxWidth: "72ch" },
  controls: { display: "flex", flexDirection: "column", gap: "10px" },
  search: { maxWidth: "520px" },
  chips: { display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center" },
  chipsLabel: { color: tokens.colorNeutralForeground3, marginRight: "4px" },
  chip: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: "999px",
    backgroundColor: "transparent",
    color: tokens.colorNeutralForeground2,
    padding: "4px 12px",
    fontSize: tokens.fontSizeBase200,
    cursor: "pointer",
    fontFamily: tokens.fontFamilyBase,
  },
  chipActive: {
    backgroundColor: tokens.colorNeutralForeground1,
    color: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralForeground1}`,
  },
  summaryRow: { display: "flex", gap: "12px", alignItems: "baseline", color: tokens.colorNeutralForeground3 },
  list: {
    display: "flex",
    flexDirection: "column",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusLarge,
    overflow: "hidden",
  },
  row: {
    display: "grid",
    gridTemplateColumns: "minmax(220px, 2fr) 120px minmax(180px, 1.4fr) 70px 84px",
    gap: "14px",
    alignItems: "center",
    padding: "10px 16px",
    borderTop: `1px solid ${tokens.colorNeutralStroke3}`,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  headerRow: {
    borderTop: "none",
    backgroundColor: tokens.colorNeutralBackground3,
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
    textTransform: "uppercase",
    letterSpacing: "0.4px",
  },
  phrase: { display: "flex", flexDirection: "column", gap: "2px" },
  domainTag: { fontFamily: tokens.fontFamilyMonospace, color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  channels: {
    color: tokens.colorNeutralForeground2,
    fontSize: tokens.fontSizeBase200,
    lineHeight: tokens.lineHeightBase200,
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  muted: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  empty: { padding: "28px", color: tokens.colorNeutralForeground3, display: "flex", flexDirection: "column", gap: "12px" },
});

const STATUS_LABEL: Record<Action["status"], string> = {
  v1: t.statusV1,
  v2: t.statusV2,
  later: t.statusLater,
  never: t.statusNever,
};

export function Catalog({ snapshot }: { snapshot: RegistrySnapshot }) {
  const styles = useStyles();
  const [query, setQuery] = useState("");
  const [risks, setRisks] = useState<Risk[]>([]);

  const found = useMemo(
    () => filterByRisk(searchActions(snapshot.actions, query), risks),
    [snapshot.actions, query, risks],
  );

  const toggleRisk = (risk: Risk) => {
    setRisks((current) =>
      current.includes(risk) ? current.filter((r) => r !== risk) : [...current, risk],
    );
  };

  const reset = () => {
    setQuery("");
    setRisks([]);
  };

  return (
    <div className={styles.root}>
      <div>
        <Text as="h2" size={700} weight="semibold">
          {t.catalogTitle}
        </Text>
        <Text className={styles.lead} block>
          {t.catalogLead}
        </Text>
      </div>

      <div className={styles.controls}>
        <Input
          className={styles.search}
          value={query}
          onChange={(_, data) => setQuery(data.value)}
          placeholder={t.searchPlaceholder}
          aria-label={t.searchPlaceholder}
        />
        <div className={styles.chips}>
          <Text size={200} className={styles.chipsLabel}>
            {t.filterRisk}:
          </Text>
          {RISK_ORDER.map((risk) => (
            <button
              key={risk}
              type="button"
              className={mergeClasses(styles.chip, risks.includes(risk) && styles.chipActive)}
              onClick={() => toggleRisk(risk)}
              aria-pressed={risks.includes(risk)}
            >
              {RISK_LABEL[risk]}
            </button>
          ))}
          {query || risks.length ? (
            <Button appearance="subtle" size="small" onClick={reset}>
              {t.resetFilters}
            </Button>
          ) : null}
        </div>
      </div>

      <div className={styles.summaryRow}>
        <Text size={200}>
          {t.foundPrefix}: {found.length} {t.foundSuffix} {snapshot.actions.length}
        </Text>
      </div>

      <div className={styles.list}>
        <div className={mergeClasses(styles.row, styles.headerRow)}>
          <span>{t.columnPhrase}</span>
          <span>{t.columnRisk}</span>
          <span>{t.columnChannels}</span>
          <span>{t.columnTier}</span>
          <span>{t.columnStatus}</span>
        </div>

        {found.length === 0 ? (
          <div className={styles.empty}>
            <Text size={300}>{t.emptyResult}</Text>
            <Button appearance="outline" size="small" onClick={reset}>
              {t.resetFilters}
            </Button>
          </div>
        ) : (
          found.map((row) => (
            <div className={styles.row} key={row.id}>
              <span className={styles.phrase}>
                <Text size={300}>{row.example}</Text>
                <span className={styles.domainTag}>
                  {row.domain} · {row.id}
                </span>
              </span>
              <RiskBadge risk={row.risk} />
              <span className={styles.channels} title={row.implementation.join("; ")}>
                {row.implementation.join(" · ")}
              </span>
              <span className={styles.muted} title={TIER_LABEL[row.tier]}>
                {row.tier}
              </span>
              <span className={styles.muted}>{STATUS_LABEL[row.status]}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
