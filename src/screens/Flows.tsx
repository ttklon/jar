import { useEffect, useMemo, useState } from "react";
import { makeStyles, Spinner, Text, tokens } from "@fluentui/react-components";
import { isTauri, listFlows } from "../ipc";
import type { FlowView } from "../ipc";
import { flows } from "../i18n/ru";
import { FlowCard } from "../components/FlowCard";

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", gap: "18px" },
  lead: { color: tokens.colorNeutralForeground2, maxWidth: "78ch" },
  note: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
    maxWidth: "78ch",
  },
  list: { display: "flex", flexDirection: "column", gap: "14px" },
  center: { display: "flex", gap: "10px", alignItems: "center", color: tokens.colorNeutralForeground2 },
  error: { color: tokens.colorPaletteRedForeground2 },
});

export function Flows() {
  const styles = useStyles();
  const [list, setList] = useState<FlowView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    listFlows()
      .then((data) => {
        if (alive) setList(data);
      })
      .catch((reason: unknown) => {
        if (alive) setError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => {
      alive = false;
    };
  }, []);

  const steps = useMemo(
    () => (list ?? []).reduce((sum, flow) => sum + flow.steps.length, 0),
    [list],
  );

  return (
    <div className={styles.root}>
      <div>
        <Text as="h2" size={700} weight="semibold">
          {flows.title}
        </Text>
        <Text className={styles.lead} block>
          {flows.lead}
        </Text>
      </div>

      {!isTauri() ? (
        <Text className={styles.note} block>
          {flows.readOnly}
        </Text>
      ) : null}

      {error ? <Text className={styles.error}>{`${flows.loadError}: ${error}`}</Text> : null}

      {list === null && !error ? (
        <div className={styles.center}>
          <Spinner size="tiny" />
          <Text>{flows.count(0)}</Text>
        </div>
      ) : null}

      {list ? (
        <>
          <Text className={styles.note} block>
            {flows.count(list.length)} · {flows.stepsCount(steps)}
          </Text>
          <div className={styles.list}>
            {list.map((flow) => (
              <FlowCard key={flow.id} flow={flow} />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
