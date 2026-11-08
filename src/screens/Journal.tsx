import { useCallback, useEffect, useState } from "react";
import { Button, makeStyles, Spinner, Text, tokens } from "@fluentui/react-components";
import { ArrowClockwiseRegular } from "@fluentui/react-icons";
import { auditTail, isTauri } from "../ipc";
import type { AuditEvent } from "../ipc";
import { journal } from "../i18n/ru";

const LIMIT = 100;

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", gap: "16px" },
  lead: { color: tokens.colorNeutralForeground2, maxWidth: "78ch" },
  note: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
    maxWidth: "78ch",
  },
  bar: { display: "flex", gap: "12px", alignItems: "center" },
  center: { display: "flex", gap: "10px", alignItems: "center", color: tokens.colorNeutralForeground2 },
  error: { color: tokens.colorPaletteRedForeground2 },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: tokens.fontSizeBase200,
    fontFamily: tokens.fontFamilyMonospace,
  },
  head: {
    textAlign: "left",
    color: tokens.colorNeutralForeground3,
    fontWeight: tokens.fontWeightSemibold,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    padding: "6px 8px 6px 0",
  },
  cell: {
    padding: "6px 8px 6px 0",
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    verticalAlign: "top",
  },
  denied: { color: tokens.colorPaletteRedForeground2 },
  ok: { color: tokens.colorPaletteGreenForeground2 },
});

function time(ms: number): string {
  const at = new Date(ms);
  return at.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function outcomeClass(styles: ReturnType<typeof useStyles>, outcome: string): string {
  if (outcome.startsWith("ok")) return `${styles.cell} ${styles.ok}`;
  if (outcome.startsWith("denied") || outcome.startsWith("error")) {
    return `${styles.cell} ${styles.denied}`;
  }
  return styles.cell;
}

export function Journal() {
  const styles = useStyles();
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    auditTail(LIMIT)
      .then(setEvents)
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : String(reason)),
      );
  }, []);

  useEffect(load, [load]);

  return (
    <div className={styles.root}>
      <div>
        <Text as="h2" size={700} weight="semibold">
          {journal.title}
        </Text>
        <Text className={styles.lead} block>
          {journal.lead}
        </Text>
      </div>

      {!isTauri() ? (
        <Text className={styles.note} block>
          {journal.browserNote}
        </Text>
      ) : null}

      {error ? <Text className={styles.error}>{`${journal.loadError}: ${error}`}</Text> : null}

      <div className={styles.bar}>
        <Button icon={<ArrowClockwiseRegular />} onClick={load}>
          {journal.refresh}
        </Button>
        {events && events.length > 0 ? (
          <Text className={styles.note}>{journal.count(events.length)}</Text>
        ) : null}
      </div>

      {events === null && !error ? (
        <div className={styles.center}>
          <Spinner size="tiny" />
          <Text>{journal.count(0)}</Text>
        </div>
      ) : null}

      {events && events.length === 0 ? (
        <Text className={styles.note} block>
          {journal.empty}
        </Text>
      ) : null}

      {events && events.length > 0 ? (
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.head}>{journal.columns.time}</th>
              <th className={styles.head}>{journal.columns.kind}</th>
              <th className={styles.head}>{journal.columns.subject}</th>
              <th className={styles.head}>{journal.columns.risk}</th>
              <th className={styles.head}>{journal.columns.decision}</th>
              <th className={styles.head}>{journal.columns.outcome}</th>
              <th className={styles.head}>{journal.columns.duration}</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event, index) => (
              <tr key={`${event.at_ms}-${event.kind}-${index}`}>
                <td className={styles.cell}>{time(event.at_ms)}</td>
                <td className={styles.cell}>{journal.kind[event.kind] ?? event.kind}</td>
                <td className={styles.cell}>{event.subject}</td>
                <td className={styles.cell}>{event.risk}</td>
                <td className={styles.cell}>{event.decision}</td>
                <td className={outcomeClass(styles, event.outcome)}>{event.outcome}</td>
                <td className={styles.cell}>{journal.duration(event.duration_ms)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}
