import { makeStyles, Text, tokens } from "@fluentui/react-components";
import type { RegistrySnapshot } from "../ipc";
import { RISK_ORDER } from "../ipc";
import { riskRank } from "../lib/registry";
import { groupByDomain, plural } from "../lib/registry";
import { RISK_HINT, t } from "../i18n/ru";
import { RiskBadge } from "../components/RiskBadge";
import { StatCard } from "../components/StatCard";

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", gap: "28px" },
  lead: { color: tokens.colorNeutralForeground2, maxWidth: "72ch", lineHeight: tokens.lineHeightBase300 },
  stats: { display: "flex", flexWrap: "wrap", gap: "12px" },
  section: { display: "flex", flexDirection: "column", gap: "10px" },
  sectionLead: { color: tokens.colorNeutralForeground3, maxWidth: "72ch" },
  table: {
    display: "flex",
    flexDirection: "column",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusLarge,
    overflow: "hidden",
  },
  row: {
    display: "grid",
    gridTemplateColumns: "130px 90px 1fr",
    gap: "12px",
    alignItems: "center",
    padding: "10px 16px",
    borderTop: `1px solid ${tokens.colorNeutralStroke3}`,
  },
  headerRow: {
    backgroundColor: tokens.colorNeutralBackground3,
    borderTop: "none",
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
    textTransform: "uppercase",
    letterSpacing: "0.4px",
  },
  count: { fontVariantNumeric: "tabular-nums", color: tokens.colorNeutralForeground2 },
  domainGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(268px, 1fr))", gap: "10px" },
  domainCard: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    padding: "12px 14px",
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground2,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  domainHead: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" },
  domainName: { fontWeight: tokens.fontWeightSemibold, fontFamily: tokens.fontFamilyMonospace },
  verbs: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200, lineHeight: tokens.lineHeightBase200 },
});

export function Overview({ snapshot }: { snapshot: RegistrySnapshot }) {
  const styles = useStyles();
  const { stats, actions } = snapshot;
  const domains = groupByDomain(actions);
  const manual = stats.byRisk.identity + stats.byRisk.money;

  return (
    <div className={styles.root}>
      <div className={styles.section}>
        <Text as="h2" size={700} weight="semibold">
          {t.overviewTitle}
        </Text>
        <Text className={styles.lead}>{t.overviewLead}</Text>
      </div>

      <div className={styles.stats}>
        <StatCard value={stats.actions} label={t.statActions} hint="строк реестра" />
        <StatCard value={stats.domains} label={t.statDomains} hint="областей работы" />
        <StatCard value={stats.verbs} label={t.statVerbs} hint="уникальных операций" />
        <StatCard value={manual} label={t.statManual} hint="identity и money" />
      </div>

      <div className={styles.section}>
        <Text as="h3" size={500} weight="semibold">
          {t.riskTitle}
        </Text>
        <Text className={styles.sectionLead}>{t.riskLead}</Text>
        <div className={styles.table}>
          <div className={`${styles.row} ${styles.headerRow}`}>
            <span>{t.riskColumnRisk}</span>
            <span>{t.riskColumnCount}</span>
            <span>{t.riskColumnMeaning}</span>
          </div>
          {[...RISK_ORDER]
            .sort((a, b) => riskRank(b) - riskRank(a))
            .map((risk) => (
              <div className={styles.row} key={risk}>
                <RiskBadge risk={risk} />
                <span className={styles.count}>{stats.byRisk[risk]}</span>
                <Text size={300}>{RISK_HINT[risk]}</Text>
              </div>
            ))}
        </div>
      </div>

      <div className={styles.section}>
        <Text as="h3" size={500} weight="semibold">
          {t.domainsTitle}
        </Text>
        <Text className={styles.sectionLead}>{t.domainsLead}</Text>
        <div className={styles.domainGrid}>
          {domains.map((group) => (
            <div className={styles.domainCard} key={group.domain}>
              <div className={styles.domainHead}>
                <span className={styles.domainName}>{group.domain}</span>
                <RiskBadge risk={group.highestRisk} />
              </div>
              <Text size={200} className={styles.verbs}>
                {group.actions.length}{" "}
                {plural(group.actions.length, "действие", "действия", "действий")} ·{" "}
                {group.verbs.length} {plural(group.verbs.length, "глагол", "глагола", "глаголов")}
              </Text>
              <Text size={200} className={styles.verbs}>
                {group.verbs.slice(0, 6).join(" · ")}
                {group.verbs.length > 6 ? " …" : ""}
              </Text>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
