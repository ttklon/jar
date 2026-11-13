import { useEffect, useMemo, useState } from "react";
import { makeStyles, Spinner, Text, tokens } from "@fluentui/react-components";
import { customHands, isTauri, listTools, removeCustomHand, runCustomHand } from "../ipc";
import type { CustomHand, ToolView } from "../ipc";
import { hands, voice } from "../i18n/ru";
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
  /** Привнесённые руки: отдельный список, потому что они не часть сборки. */
  const [own, setOwn] = useState<CustomHand[]>([]);
  /** Отчёт последнего запуска своей руки: по строке на каждую руку. */
  const [reports, setReports] = useState<Record<string, string>>({});
  const [refusals, setRefusals] = useState<Record<string, string>>({});
  const [running, setRunning] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    listTools()
      .then((data) => {
        if (alive) setTools(data);
      })
      .catch((reason: unknown) => {
        if (alive) setError(reason instanceof Error ? reason.message : String(reason));
      });
    customHands()
      .then((list) => {
        if (alive) setOwn(list);
      })
      .catch(() => {
        // Список своих рук не должен ронять экран: встроенные важнее.
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

      <section>
        <Text weight="semibold" block>
          {voice.customTitle}
        </Text>
        <Text className={styles.note} block>
          {voice.customNote}
        </Text>
        {own.length === 0 ? (
          <Text className={styles.note} block>
            {voice.customNone}
          </Text>
        ) : (
          <ul>
            {own.map((hand) => (
              <li key={hand.key}>
                <Text>
                  {hand.title} · {hands.riskLabel(hand.risk)}
                </Text>
                <pre className={styles.note}>{hand.code}</pre>
                <button
                  type="button"
                  disabled={running === hand.key}
                  onClick={() => {
                    setRunning(hand.key);
                    setRefusals((current) => {
                      const next = { ...current };
                      delete next[hand.key];
                      return next;
                    });
                    runCustomHand(hand.key)
                      .then((report) =>
                        setReports((current) => ({
                          ...current,
                          [hand.key]: voice.customRunReport(report.note, report.cell),
                        })),
                      )
                      .catch((reason: unknown) =>
                        setRefusals((current) => ({
                          ...current,
                          [hand.key]: voice.customRunRefused(
                            reason instanceof Error ? reason.message : String(reason),
                          ),
                        })),
                      )
                      .finally(() => setRunning(null));
                  }}
                >
                  {running === hand.key ? voice.customRunning : voice.customRun}
                </button>
                {reports[hand.key] ? <Text className={styles.note}>{reports[hand.key]}</Text> : null}
                {refusals[hand.key] ? (
                  <Text className={styles.error}>{refusals[hand.key]}</Text>
                ) : null}
                <button
                  type="button"
                  onClick={() =>
                    removeCustomHand(hand.key)
                      .then(() => setOwn((current) => current.filter((item) => item.key !== hand.key)))
                      .catch((reason: unknown) =>
                        setError(reason instanceof Error ? reason.message : String(reason)),
                      )
                  }
                >
                  {voice.customRemove(hand.title)}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

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
