import { useCallback, useState } from "react";
import { Button, Input, makeStyles, Spinner, Text, tokens } from "@fluentui/react-components";
import { SearchRegular } from "@fluentui/react-icons";
import { planFor } from "../ipc";
import type { PlanItem } from "../ipc";
import { ask } from "../i18n/ru";
import { RiskBadge } from "../components/RiskBadge";

const LIMIT = 8;

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", gap: "16px" },
  lead: { color: tokens.colorNeutralForeground2, maxWidth: "78ch" },
  note: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
    maxWidth: "78ch",
  },
  bar: { display: "flex", gap: "10px", alignItems: "center", maxWidth: "70ch" },
  input: { flex: 1 },
  center: {
    display: "flex",
    gap: "10px",
    alignItems: "center",
    color: tokens.colorNeutralForeground2,
  },
  error: { color: tokens.colorPaletteRedForeground2 },
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
  count: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
});

export function Ask() {
  const styles = useStyles();
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<PlanItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback((text: string) => {
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      // Пустой запрос — не ошибка: возвращаем экран в исходное состояние.
      setItems(null);
      setError(null);
      return;
    }

    setBusy(true);
    setError(null);
    planFor(trimmed, LIMIT)
      .then(setItems)
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : String(reason)),
      )
      .finally(() => setBusy(false));
  }, []);

  return (
    <div className={styles.root}>
      <Text as="h1" size={700}>
        {ask.title}
      </Text>
      <Text className={styles.lead}>{ask.lead}</Text>

      <form
        className={styles.bar}
        onSubmit={(event) => {
          event.preventDefault();
          search(query);
        }}
      >
        <Input
          className={styles.input}
          value={query}
          placeholder={ask.placeholder}
          aria-label={ask.placeholder}
          onChange={(_, data) => setQuery(data.value)}
        />
        <Button appearance="primary" icon={<SearchRegular />} type="submit" disabled={busy}>
          {busy ? ask.searching : ask.find}
        </Button>
      </form>

      {error ? (
        <Text className={styles.error}>
          {ask.loadError}: {error}
        </Text>
      ) : busy ? (
        <div className={styles.center}>
          <Spinner size="tiny" />
          <Text>{ask.searching}</Text>
        </div>
      ) : items === null ? (
        <Text className={styles.note}>{ask.hint}</Text>
      ) : items.length === 0 ? (
        <Text className={styles.note}>{ask.empty}</Text>
      ) : (
        <>
          <Text className={styles.count}>{ask.found(items.length)}</Text>
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
                  <span>{ask.score(item.score)}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
