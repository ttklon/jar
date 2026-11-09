import { useState } from "react";
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
import type { StepResult, ToolView } from "../ipc";
import { cancelTool, confirmTool, isTauri, runTool } from "../ipc";
import { RISK_LABEL, hands } from "../i18n/ru";
import { evidenceText } from "../lib/evidence";
import { RiskBadge } from "./RiskBadge";

const useStyles = makeStyles({
  card: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    padding: "16px 18px",
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground2,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  head: { display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "flex-start" },
  title: { fontWeight: tokens.fontWeightSemibold, fontSize: tokens.fontSizeBase400 },
  summary: { color: tokens.colorNeutralForeground2, fontSize: tokens.fontSizeBase300 },
  impl: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  screeningRefuse: {
    color: tokens.colorPaletteRedForeground2,
    fontSize: tokens.fontSizeBase200,
  },
  params: { display: "flex", flexDirection: "column", gap: "8px" },
  actions: { display: "flex", gap: "8px", alignItems: "center" },
  result: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    padding: "10px 12px",
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground3,
    borderLeft: `3px solid ${tokens.colorPaletteGreenBorder1}`,
  },
  resultFailed: { borderLeft: `3px solid ${tokens.colorPaletteRedBorder1}` },
  evidence: { fontFamily: tokens.fontFamilyMonospace, fontSize: tokens.fontSizeBase200 },
  output: {
    margin: 0,
    maxHeight: "220px",
    overflow: "auto",
    padding: "8px 10px",
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground4,
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: tokens.fontSizeBase200,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },
  denyNote: { color: tokens.colorPaletteRedForeground2, fontSize: tokens.fontSizeBase200 },
  muted: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
});

export function ToolCard({ tool }: { tool: ToolView }) {
  const styles = useStyles();
  // Прошлые удачные параметры подставляются сразу: путь к папке обычно один и тот же,
  // а вводить его заново каждый раз — работа, которую приложение уже сделало.
  const [values, setValues] = useState<Record<string, string>>(() => tool.last_params ?? {});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<StepResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);

  const denied = tool.decision === "deny";
  const canRun = isTauri() && !denied && !busy;

  const missingParam = tool.params.find(
    (param) => param.required && !(values[param.name] ?? "").trim(),
  );

  const execute = async () => {
    setAsking(false);
    setBusy(true);
    setError(null);
    try {
      let token: number | undefined;
      if (tool.needs_token) {
        const confirmed = await confirmTool(tool.registry, values);
        token = confirmed.token;
      }
      const outcome = await runTool(tool.registry, values, token);
      setResult(outcome);
    } catch (reason) {
      setResult(null);
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  const onRunClick = () => {
    if (missingParam) {
      setError(hands.fillParam(missingParam.label));
      return;
    }
    if (tool.needs_token) {
      setAsking(true);
      return;
    }
    void execute();
  };

  const onCancel = async () => {
    await cancelTool();
  };

  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <div>
          <div className={styles.title}>{tool.title}</div>
          <Text className={styles.summary} block>
            {tool.summary}
          </Text>
        </div>
        <RiskBadge risk={tool.risk} />
      </div>

      <Text className={styles.impl} block>
        {hands.implementation}: {tool.implementation}
      </Text>

      {tool.last_params && Object.keys(tool.last_params).length > 0 ? (
        <Text className={styles.muted} block>
          {hands.prefilled}
        </Text>
      ) : null}

      {denied ? <Text className={styles.denyNote}>{tool.decision_reason}</Text> : null}

      {tool.params.length > 0 ? (
        <div className={styles.params}>
          {tool.params.map((param) => (
            <Field
              key={param.name}
              label={param.label}
              hint={param.hint}
              required={param.required}
            >
              <Input
                value={values[param.name] ?? ""}
                placeholder={param.placeholder}
                onChange={(_, data) =>
                  setValues((current) => ({ ...current, [param.name]: data.value }))
                }
                disabled={denied || busy}
              />
            </Field>
          ))}
        </div>
      ) : null}

      <div className={styles.actions}>
        <Button
          appearance="primary"
          icon={busy ? <Spinner size="tiny" /> : <PlayRegular />}
          onClick={onRunClick}
          disabled={!canRun}
        >
          {busy ? hands.running : hands.run}
        </Button>
        {busy ? (
          <Button appearance="subtle" icon={<StopRegular />} onClick={() => void onCancel()}>
            {hands.cancel}
          </Button>
        ) : null}
        {tool.needs_token && !denied ? (
          <Text className={styles.muted}>{hands.needsConfirm}</Text>
        ) : null}
      </div>

      {error ? <Text className={styles.denyNote}>{error}</Text> : null}

      {result ? (
        <div className={`${styles.result} ${result.ok ? "" : styles.resultFailed}`}>
          <Text weight="semibold">
            {result.cancelled
              ? hands.cancelled
              : result.timed_out
                ? hands.timedOut
                : result.ok
                  ? hands.ok
                  : hands.failed}
            {" · "}
            {hands.duration(result.duration_ms)}
          </Text>
          <Text className={styles.evidence}>
            {hands.evidence}: {evidenceText(result.evidence)}
          </Text>
          {result.reason && result.reason !== "готово" ? (
            <Text className={styles.muted}>{result.reason}</Text>
          ) : null}
          <pre className={styles.output}>
            {result.stdout_tail.trim() || result.stderr_tail.trim() || hands.empty_output}
          </pre>
        </div>
      ) : null}

      <Dialog open={asking} onOpenChange={(_, data) => setAsking(data.open)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>{hands.confirmTitle}</DialogTitle>
            <DialogContent>
              <Text block>{hands.confirmLead}</Text>
              <div className={styles.result}>
                <Text weight="semibold">{tool.title}</Text>
                <Text className={styles.muted}>{tool.summary}</Text>
                <Text className={styles.evidence}>{hands.riskNote(RISK_LABEL[tool.risk])}</Text>
                {tool.params.map((param) => (
                  <Text key={param.name} className={styles.evidence}>
                    {param.label}: {values[param.name] ?? "—"}
                  </Text>
                ))}
              </div>
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setAsking(false)}>
                {hands.confirmCancel}
              </Button>
              <Button appearance="primary" onClick={() => void execute()}>
                {hands.confirmAction}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}
