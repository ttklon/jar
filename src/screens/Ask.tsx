import { useCallback, useEffect, useState } from "react";
import {
  Button,
  Input,
  makeStyles,
  Spinner,
  Text,
  Textarea,
  tokens,
} from "@fluentui/react-components";
import { MicRegular, SearchRegular } from "@fluentui/react-icons";
import { checkPlan, isTauri, planFor, runPlan, savePlan } from "../ipc";
import type { PlanCheck, PlanItem, PlanReport } from "../ipc";
import { ask } from "../i18n/ru";
import { speak } from "../lib/voice";
import { useVoice } from "../lib/useVoice";
import { ActionList } from "../components/ActionList";

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
  const [approved, setApproved] = useState<number[]>([]);
  const [report, setReport] = useState<PlanReport | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [spokenNote, setSpokenNote] = useState<string | null>(null);
  const [voiceSeconds, setVoiceSeconds] = useState(0);

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

  // Сказать задачу: услышанное идёт в тот же поиск, что и напечатанное. Голос — это
  // только вход, дальше обычный путь: реестр, руки, политика.
  const voice = useVoice({
    onText: (text) => {
      setVoiceError(null);
      setQuery(text);
      search(text);
    },
    onError: (message) => setVoiceError(message),
    nothingHeard: ask.voiceNothing,
  });

  // Счётчик секунд: человек должен видеть, что его слушают прямо сейчас.
  useEffect(() => {
    if (!voice.listening) {
      setVoiceSeconds(0);
      return;
    }
    const timer = setInterval(() => setVoiceSeconds((seconds) => seconds + 1), 1000);
    return () => clearInterval(timer);
  }, [voice.listening]);

  const verifyPlan = useCallback(() => {
    setPlanBusy(true);
    setPlanError(null);
    setSaved(false);
    setReport(null);
    setApproved([]);
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

  const executePlan = useCallback(() => {
    // Запускаем ровно то, что проверили: правка текста после проверки не должна
    // просачиваться в исполнение в обход проверки.
    const validated = check?.plan;
    if (!validated) return;

    setPlanBusy(true);
    setPlanError(null);
    setReport(null);
    runPlan(JSON.stringify(validated), approved)
      .then((result) => {
        setReport(result);
        // Проговариваем итог: человек не смотрит в экран, он говорит.
        const phrase = result.stopped
          ? ask.planSpeechStopped(result.stopped)
          : ask.planSpeech(result.steps.length);
        setSpokenNote(speak(phrase) ? null : ask.voiceSilent);
      })
      .catch((reason: unknown) =>
        setPlanError(reason instanceof Error ? reason.message : String(reason)),
      )
      .finally(() => setPlanBusy(false));
  }, [check, approved]);

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
          <>
            <Text className={styles.okPlan}>{ask.planOk(check.plan?.steps.length ?? 0)}</Text>
            <Text className={styles.note}>{ask.planStepsTitle}</Text>
            <ul className={styles.problems}>
              {check.gates.map((gate) => {
                const risky = gate.decision === "confirm";
                return (
                  <li key={gate.position}>
                    <label>
                      {risky ? (
                        <input
                          type="checkbox"
                          aria-label={ask.planApprove(gate.position)}
                          checked={approved.includes(gate.position)}
                          onChange={(event) =>
                            setApproved((current) =>
                              event.target.checked
                                ? [...current, gate.position]
                                : current.filter((position) => position !== gate.position),
                            )
                          }
                        />
                      ) : null}
                      {" "}
                      {ask.planStep(
                        gate.position,
                        gate.registry,
                        ask.planRisk[gate.risk] ?? gate.risk,
                      )}
                      {risky ? ` · ${ask.planNeedsApproval}` : ""}
                    </label>
                  </li>
                );
              })}
            </ul>
            <div className={styles.bar}>
              <Button
                appearance="primary"
                disabled={
                  planBusy ||
                  check.gates.some(
                    (gate) =>
                      gate.decision === "confirm" && !approved.includes(gate.position),
                  )
                }
                onClick={executePlan}
              >
                {ask.planRun}
              </Button>
            </div>
          </>
        ) : null}

        {report !== null ? (
          <>
            <Text weight="semibold">{ask.planReportTitle}</Text>
            <ul className={styles.problems}>
              {report.steps.map((step) => (
                <li
                  key={step.position}
                  className={step.status === "ok" ? styles.okPlan : styles.problem}
                >
                  {`шаг ${step.position}: ${step.registry}`}:{" "}
                  {step.status === "ok"
                    ? ask.planStepOk
                    : step.status === "cancelled"
                      ? ask.planStepCancelled
                      : ask.planStepFailed}
                  {step.evidence ? ` · ${step.evidence}` : ""}
                  {step.reason ? ` · ${step.reason}` : ""}
                </li>
              ))}
            </ul>
            {report.stopped ? (
              <Text className={styles.problem}>{ask.planStopped(report.stopped)}</Text>
            ) : null}
          </>
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
        <Button
          icon={<MicRegular />}
          aria-label={ask.voiceSay}
          title={ask.voiceHold}
          onPointerDown={(event) => {
            event.preventDefault();
            voice.start();
          }}
          onPointerUp={() => voice.stop()}
          onPointerLeave={() => voice.stop()}
          onPointerCancel={() => voice.stop()}
          onKeyDown={(event) => {
            if (event.key !== " " && event.key !== "Enter") return;
            event.preventDefault();
            if (!event.repeat) voice.start();
          }}
          onKeyUp={(event) => {
            if (event.key !== " " && event.key !== "Enter") return;
            event.preventDefault();
            voice.stop();
          }}
        >
          {voice.listening ? ask.voiceListening(voiceSeconds) : ask.voiceSay}
        </Button>
        <Button appearance="primary" icon={<SearchRegular />} type="submit" disabled={busy}>
          {busy ? ask.searching : ask.find}
        </Button>
      </form>

      <Text className={styles.note}>{ask.voiceHold}</Text>
      <Text className={styles.note}>{ask.voiceNote}</Text>

      {voiceError ? <Text className={styles.error}>{voiceError}</Text> : null}
      {spokenNote ? <Text className={styles.note}>{spokenNote}</Text> : null}

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
          <ActionList items={items} />
        </>
      )}
    </div>
  );
}
