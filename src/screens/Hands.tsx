import { useEffect, useMemo, useState } from "react";
import { makeStyles, Spinner, Text, tokens } from "@fluentui/react-components";
import { isTauri, listTools } from "../ipc";
import type { ToolView } from "../ipc";
import { hands } from "../i18n/ru";
import { ToolCard } from "../components/ToolCard";

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", gap: "18px" },
  lead: { color: tokens.colorNeutralForeground2, maxWidth: "78ch" },
  note: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
    maxWidth: "78ch",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))",
    gap: "14px",
  },
  center: { display: "flex", gap: "10px", alignItems: "center", color: tokens.colorNeutralForeground2 },
  error: { color: tokens.colorPaletteRedForeground2 },
});

export function Hands() {
  const styles = useStyles();
  const [tools, setTools] = useState<ToolView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    listTools()
      .then((data) => {
        if (alive) setTools(data);
      })
      .catch((reason: unknown) => {
        if (alive) setError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => {
      alive = false;
    };
  }, []);

  const counters = useMemo(() => {
    const list = tools ?? [];
    return {
      total: list.length,
      needing: list.filter((tool) => tool.needs_token).length,
      denied: list.filter((tool) => tool.decision === "deny").length,
    };
  }, [tools]);

  return (
    <div className={styles.root}>
      <div>
        <Text as="h2" size={700} weight="semibold">
          {hands.title}
        </Text>
        <Text className={styles.lead} block>
          {hands.lead}
        </Text>
      </div>

      {!isTauri() ? (
        <Text className={styles.note} block>
          {hands.readOnly} {hands.screeningBrowser}
        </Text>
      ) : null}

      {error ? <Text className={styles.error}>{`${hands.loadError}: ${error}`}</Text> : null}

      {tools === null && !error ? (
        <div className={styles.center}>
          <Spinner size="tiny" />
          <Text>{hands.count(0)}</Text>
        </div>
      ) : null}

      {tools ? (
        <>
          <Text className={styles.note} block>
            {hands.count(counters.total)} · {hands.needsConfirm} {counters.needing}
            {counters.denied > 0 ? ` · ${hands.deny}: ${counters.denied}` : ""}
          </Text>
          <div className={styles.grid}>
            {tools.map((tool) => (
              <ToolCard key={tool.registry} tool={tool} />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
