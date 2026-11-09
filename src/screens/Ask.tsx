import { useCallback, useState } from "react";
import {
  Button,
  Input,
  makeStyles,
  Spinner,
  Text,
  Textarea,
  tokens,
} from "@fluentui/react-components";
import { SearchRegular } from "@fluentui/react-icons";
import { checkPlan, isTauri, planFor, savePlan } from "../ipc";
import type { PlanCheck, PlanItem } from "../ipc";
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
  plan: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    padding: "14px 16px",
    borderRadius: tokens.borderRadiusLarge,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2,
    maxWidth: "96ch",
  },
  problems: { margin: 0, paddingLeft: "18px", fontSize: tokens.fontSizeBase200 },
  problem: { color: tokens.colorPaletteRedForeground2 },
  okPlan: { color: tokens.colorPaletteGreenForeground2, fontSize: tokens.fontSizeBase200 },
});

export function Ask() {
  const styles = useStyles();
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<PlanItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [planJson, setPlanJson] = useState("");
  const [check, setCheck] = useState<PlanCheck | null>(null);
  const [planBusy, setPlanBusy] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

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

  const verifyPlan = useCallback(() => {
    setPlanBusy(true);
    setPlanError(null);
    setSaved(false);
    checkPlan(planJson)
      .then(setCheck)
      .catch((reason: unknown) =>
        setPlanError(reason instanceof Error ? reason.message : String(reason)),
      )
      .finally(() => setPlanBusy(false));
  }, [planJson]);

  const storePlan = useCallback(() => {
    setPlanBusy(true);
    setPlanError(null);
    savePlan(planJson)
      .then((result) => {
        setCheck(result);
        setSaved(result.problems.length === 0);
      })
      .catch((reason: unknown) =>
        setPlanError(reason instanceof Error ? reason.message : String(reason)),
      )
      .finally(() => setPlanBusy(false));
  }, [planJson]);

  return (
    <div className={styles.root}>
      <Text as="h1" size={700}>
        {ask.title}
      </Text>
      <Text className={styles.lead}>{ask.lead}</Text>

      <section className={styles.plan}>
        <Text as="h2" size={500}>
          {ask.planTitle}
        </Text>
        <Text className={styles.note}>{ask.planLead}</Text>
        {!isTauri() ? (
          <Text className={styles.note}>{ask.planNoPlan}</Text>
        ) : (
          <>
            <Textarea
              value={planJson}
              placeholder={ask.planPlaceholder}
              aria-label={ask.planTitle}
              resize="vertical"
              textarea={{ spellCheck: false }}
              onChange={(_, data) => setPlanJson(data.value)}
            />
            <div className={styles.bar}>
              <Button disabled={planBusy} onClick={verifyPlan}>
                {ask.planCheck}
              </Button>
              <Button
                appearance="primary"
                disabled={planBusy || check === null || check.problems.length > 0}
                onClick={storePlan}
              >
                {ask.planSaving}
              </Button>
              {saved ? <Text className={styles.okPlan}>{ask.planSaved}</Text> : null}
            </div>
          </>
        )}

        {planError ? (
          <Text className={styles.error}>
            {ask.planError}: {planError}
          </Text>
        ) : null}

        {check !== null && check.problems.length === 0 ? (
          <Text className={styles.okPlan}>{ask.planOk(check.plan?.steps.length ?? 0)}</Text>
        ) : null}

        {check !== null && check.problems.length > 0 ? (
          <>
            <Text className={styles.problem}>{ask.planProblems(check.problems.length)}</Text>
            <ul className={styles.problems}>
              {check.problems.map((problem, index) => (
                <li key={`${problem.position}-${index}`} className={styles.problem}>
                  {problem.position > 0 ? `шаг ${problem.position}: ` : ""}
                  {problem.registry ? `${problem.registry} — ` : ""}
                  {problem.problem}
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </section>

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
