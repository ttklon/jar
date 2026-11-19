import { useRef, useState } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Field,
  Input,
  makeStyles,
  Spinner,
  Text,
  tokens,
} from "@fluentui/react-components";
import { PlayRegular, StopRegular } from "@fluentui/react-icons";
import type { FlowStepView, FlowView, StepResult } from "../ipc";
import { cancelTool, confirmTool, isTauri, runTool } from "../ipc";
import { evidenceText } from "../lib/evidence";
import type { FlowRun, StepRecord } from "../lib/flows";
import { missingInputs, runFlow } from "../lib/flows";
import { RISK_LABEL, flows } from "../i18n/ru";
import { RiskBadge } from "./RiskBadge";

const useStyles = makeStyles({
  card: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    padding: "16px 18px",
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground2,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  head: { display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "flex-start" },
  title: { fontWeight: tokens.fontWeightSemibold, fontSize: tokens.fontSizeBase400 },
  summary: { color: tokens.colorNeutralForeground2, fontSize: tokens.fontSizeBase300 },
  section: { fontWeight: tokens.fontWeightSemibold, fontSize: tokens.fontSizeBase200 },
  steps: { display: "flex", flexDirection: "column", gap: "6px", margin: 0, padding: 0 },
  step: {
    display: "grid",
    gridTemplateColumns: "22px 1fr auto",
    gap: "8px",
    alignItems: "baseline",
    padding: "6px 8px",
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground3,
  },
  stepNumber: { color: tokens.colorNeutralForeground3, fontFamily: tokens.fontFamilyMonospace },
  stepNote: { fontSize: tokens.fontSizeBase300 },
  stepTool: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase100 },
  status: { fontSize: tokens.fontSizeBase200 },
  okStatus: { color: tokens.colorPaletteGreenForeground2 },
  badStatus: { color: tokens.colorPaletteRedForeground2 },
  idleStatus: { color: tokens.colorNeutralForeground3 },
  params: { display: "flex", flexDirection: "column", gap: "8px" },
  actions: { display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" },
  muted: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  error: { color: tokens.colorPaletteRedForeground2, fontSize: tokens.fontSizeBase200 },
  evidence: { fontFamily: tokens.fontFamilyMonospace, fontSize: tokens.fontSizeBase200 },
  output: {
    margin: 0,
    maxHeight: "180px",
    overflow: "auto",
    padding: "8px 10px",
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground4,
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: tokens.fontSizeBase200,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },
  summaryBox: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    padding: "10px 12px",
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground3,
    borderLeft: `3px solid ${tokens.colorPaletteGreenBorder1}`,
  },
  summaryFailed: { borderLeft: `3px solid ${tokens.colorPaletteRedBorder1}` },
  asking: { display: "flex", flexDirection: "column", gap: "6px" },
});

function statusLabel(record: StepRecord): string {
  switch (record.status) {
    case "pending":
      return flows.pending;
    case "running":
      return flows.runningStep;
    case "ok":
      return flows.stepOk;
    case "failed":
      return flows.stepFailed;
    case "declined":
      return flows.stepDeclined;
    case "skipped":
      return flows.stepSkipped;
  }
}

function statusClass(styles: ReturnType<typeof useStyles>, record: StepRecord): string {
  if (record.status === "ok") return `${styles.status} ${styles.okStatus}`;
  if (record.status === "failed" || record.status === "declined") {
    return `${styles.status} ${styles.badStatus}`;
  }
  return `${styles.status} ${styles.idleStatus}`;
}

function summaryText(run: FlowRun): string {
  switch (run.stopped) {
    case "done":
      return flows.stoppedDone;
    case "failed":
      return flows.stoppedFailed(run.records.filter((r) => r.status !== "pending").length);
    case "declined":
      return flows.stoppedDeclined(run.records.filter((r) => r.status !== "pending").length);
    case "cancelled":
      return flows.stoppedCancelled;
  }
}

export function FlowCard({ flow }: { flow: FlowView }) {
  const styles = useStyles();
  const [values, setValues] = useState<Record<string, string>>({});
  const [records, setRecords] = useState<StepRecord[] | null>(null);
  const [run, setRun] = useState<FlowRun | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState<{ step: FlowStepView; params: Record<string, string> } | null>(
    null,
  );

  const answer = useRef<((agreed: boolean) => void) | null>(null);
  const stopRequested = useRef(false);

  const view: StepRecord[] =
    records ??
    flow.steps.map((step, index) => ({
      index,
      step,
      status: "pending" as const,
    }));

  const execute = async () => {
    const missing = missingInputs(flow, values);
    if (missing.length > 0) {
      setError(flows.fillInput(missing.join(", ")));
      return;
    }

    setError(null);
    setRun(null);
    setBusy(true);
    stopRequested.current = false;

    try {
      const outcome = await runFlow(flow, values, {
        confirm: (step, params) =>
          new Promise<boolean>((resolve) => {
            answer.current = resolve;
            setAsking({ step, params });
          }),
        run: async (step, params) => {
          let token: number | undefined;
          if (step.needs_token) {
            const confirmed = await confirmTool(step.tool, params);
            token = confirmed.token;
          }
          return runTool(step.tool, params, token);
        },
        onProgress: setRecords,
        shouldStop: () => stopRequested.current,
      });
      setRun(outcome);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
      setAsking(null);
      answer.current = null;
    }
  };

  const ask = (agreed: boolean) => {
    setAsking(null);
    const resolve = answer.current;
    answer.current = null;
    resolve?.(agreed);
  };

  const onStop = async () => {
    stopRequested.current = true;
    // Текущий шаг обрывает ядро — сценарий остановится перед следующим.
    await cancelTool();
  };

  const resultOf = (record: StepRecord): StepResult | undefined => record.result;

  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <div>
          <div className={styles.title}>{flow.title}</div>
          <Text className={styles.summary} block>
            {flow.summary}
          </Text>
        </div>
        <RiskBadge risk={flow.risk} />
      </div>

      <Text className={styles.muted} block>
        {flows.registry}: {flow.registry} · {flows.stepsCount(flow.steps.length)}
        {flow.needs_token ? ` · ${flows.needsConfirm}` : ""}
      </Text>

      {flow.inputs.length > 0 ? (
        <div className={styles.params}>
          <Text className={styles.section}>{flows.inputs}</Text>
          {flow.inputs.map((input) => (
            <Field key={input.name} label={input.label} hint={input.hint} required={input.required}>
              <Input
                value={values[input.name] ?? ""}
                placeholder={input.placeholder}
                onChange={(_, data) =>
                  setValues((current) => ({ ...current, [input.name]: data.value }))
                }
                disabled={busy}
              />
            </Field>
          ))}
        </div>
      ) : null}

      <div>
        <Text className={styles.section}>{flows.steps}</Text>
        <ol className={styles.steps}>
          {view.map((record) => (
            <li key={record.step.tool + record.index} className={styles.step}>
              <span className={styles.stepNumber}>{record.index + 1}</span>
              <span>
                <span className={styles.stepNote}>{record.step.note}</span>
                <Text className={styles.stepTool} block>
                  {record.step.title}
                  {record.step.risk !== "read" ? ` · ${RISK_LABEL[record.step.risk]}` : ""}
                </Text>
                {resultOf(record) ? (
                  <>
                    <Text className={styles.evidence} block>
                      {flows.evidence}: {evidenceText((resultOf(record) as StepResult).evidence)} ·{" "}
                      {flows.durations((resultOf(record) as StepResult).duration_ms)}
                    </Text>
                    <pre className={styles.output}>
                      {(resultOf(record) as StepResult).stdout_tail.trim() ||
                        (resultOf(record) as StepResult).stderr_tail.trim() ||
                        "—"}
                    </pre>
                  </>
                ) : null}
                {record.reason && record.status !== "ok" ? (
                  <Text className={styles.muted} block>
                    {record.reason}
                  </Text>
                ) : null}
              </span>
              <span className={statusClass(styles, record)}>{statusLabel(record)}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className={styles.actions}>
        <Button
          appearance="primary"
          icon={busy ? <Spinner size="tiny" /> : <PlayRegular />}
          onClick={() => void execute()}
          disabled={!isTauri() || busy}
        >
          {busy ? flows.running : flows.run}
        </Button>
        {busy ? (
          <Button appearance="subtle" icon={<StopRegular />} onClick={() => void onStop()}>
            {flows.stop}
          </Button>
        ) : null}
        {!isTauri() ? <Text className={styles.muted}>{flows.readOnly}</Text> : null}
      </div>

      {error ? <Text className={styles.error}>{error}</Text> : null}

      {run ? (
        <div className={`${styles.summaryBox} ${run.ok ? "" : styles.summaryFailed}`}>
          <Text weight="semibold">{summaryText(run)}</Text>
        </div>
      ) : null}

      <Dialog open={asking !== null} onOpenChange={() => ask(false)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>{flows.confirmTitle}</DialogTitle>
            <DialogContent>
              <Text block>{flows.confirmLead}</Text>
              <div className={styles.asking}>
                <Text weight="semibold">{asking?.step.title}</Text>
                <Text className={styles.muted}>{asking?.step.note}</Text>
                <Text className={styles.evidence}>
                  {asking?.step.risk ? `${flows.evidence}: ${RISK_LABEL[asking.step.risk]}` : ""}
                </Text>
                {Object.entries(asking?.params ?? {}).map(([name, value]) => (
                  <Text key={name} className={styles.evidence}>
                    {name}: {value}
                  </Text>
                ))}
              </div>
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => ask(false)}>
                {flows.confirmStop}
              </Button>
              <Button appearance="primary" onClick={() => ask(true)}>
                {flows.confirmAction}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}
