import { useCallback, useEffect, useState } from "react";
import { Button, Input, makeStyles, Text, tokens } from "@fluentui/react-components";
import { MicRegular } from "@fluentui/react-icons";
import {
  draftPlan,
  fillPlan,
  planFor,
  requestLearning,
  runPlan,
  speechStatus,
  transcribeLocal,
} from "../ipc";
import type { Learning, PlanCheck, PlanItem, PlanReport, SpeechStatus } from "../ipc";
import { speak } from "../lib/voice";
import { useVoice } from "../lib/useVoice";
import { ActionList } from "../components/ActionList";
import { voice } from "../i18n/ru";

/**
 * Главный экран. Человек ничего здесь не выбирает: он держит кнопку, говорит задачу,
 * отпускает — и слышит, что приложение об этом думает.
 *
 * Почему так, а не списком экранов: задача приходит словами, ответ должен приходить
 * словами тоже. Реестр, руки и журнал не убраны — они за кнопкой «Под капотом», для
 * тех случаев, когда человек хочет проверить, а не поработать.
 */

const LIMIT = 8;

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", gap: "16px", maxWidth: "96ch" },
  lead: { color: tokens.colorNeutralForeground2, maxWidth: "78ch" },
  note: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
    maxWidth: "78ch",
  },
  mic: {
    minHeight: "92px",
    fontSize: tokens.fontSizeBase500,
    fontWeight: tokens.fontWeightSemibold,
    justifyContent: "center",
    gap: "12px",
  },
  micListening: {
    minHeight: "92px",
    fontSize: tokens.fontSizeBase500,
    fontWeight: tokens.fontWeightSemibold,
    justifyContent: "center",
    gap: "12px",
    backgroundColor: tokens.colorPaletteRedBackground2,
    color: tokens.colorPaletteRedForeground2,
  },
  bar: { display: "flex", gap: "10px", alignItems: "center" },
  input: { flex: 1 },
  error: { color: tokens.colorPaletteRedForeground2 },
  spoken: { color: tokens.colorNeutralForeground3, fontStyle: "italic" },
  draft: {
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
  localReady: {
    color: tokens.colorPaletteGreenForeground2,
    fontSize: tokens.fontSizeBase200,
    maxWidth: "78ch",
  },
  hood: {
    display: "flex",
    gap: "10px",
    alignItems: "center",
    flexWrap: "wrap",
    paddingTop: "10px",
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
  },
});

export interface VoiceScreenProps {
  /** Переход к доказательству: реестр, руки, сценарии, история. */
  onOpen?: (screen: string) => void;
}

export function Voice({ onOpen }: VoiceScreenProps) {
  const styles = useStyles();
  const [text, setText] = useState("");
  const [items, setItems] = useState<PlanItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [spoken, setSpoken] = useState<string | null>(null);
  const [speech, setSpeech] = useState<SpeechStatus | null>(null);
  const [draft, setDraft] = useState<PlanCheck | null>(null);
  const [approved, setApproved] = useState(false);
  const [report, setReport] = useState<PlanReport | null>(null);
  const [running, setRunning] = useState(false);
  // Ответы на вопросы плана: ключ — «шаг:параметр», чтобы два шага не путались.
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [learning, setLearning] = useState<Learning | null>(null);

  const search = useCallback((phrase: string) => {
    const query = phrase.trim();
    if (query.length === 0) {
      setItems(null);
      return;
    }

    setBusy(true);
    setError(null);
    planFor(query, LIMIT)
      .then(async (found) => {
        setItems(found);
        setReport(null);
        setApproved(false);

        // Черновик плана: что именно приложение собирается сделать. Спрашиваем его
        // сразу — человек сказал задачу, и ответ «могу сделать вот это» полезнее списка.
        const proposal = await draftPlan(query).catch(() => null);
        setDraft(proposal);
        setAnswers({});
        setLearning(null);

        // Не умеем — не тупик: записываем задачу на обучение и говорим, что для неё
        // нужно. Учиться приложение должно уметь само, но молча — нельзя.
        const promise = proposal ? null : await requestLearning(query).catch(() => null);
        if (promise) {
          setLearning(promise);
          speak(voice.learnSpoken(promise.example));
          return;
        }

        // Данных не хватает — спрашиваем вслух, а не показываем красную строку.
        const first = proposal?.questions[0];
        if (first) speak(voice.askSpoken(first.label));
        // Отвечаем вслух: человек, который говорит, не смотрит в экран.
        const phraseOut = !proposal
          ? found.length === 0
            ? voice.spokenNothing
            : found.some((item) => Boolean(item.tool))
              ? voice.spokenFoundProposal(found.length)
              : voice.spokenOnlyDescription
          : proposal.problems.length > 0
            ? `${voice.draftSpoken(proposal.plan?.steps.length ?? 0)}. ${voice.draftMissing}`
            : voice.draftSpoken(proposal.plan?.steps.length ?? 0);
        setSpoken(speak(phraseOut) ? voice.said(phraseOut) : voice.silent);
      })
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : String(reason)),
      )
      .finally(() => setBusy(false));
  }, []);

  // Свой движок есть — пишем звук и отдаём ему: это единственный путь, где звук не
  // покидает компьютер. Нет — слушаем тем, что даёт система, и говорим об этом выше.
  const localEngine =
    speech && speech.found && speech.model
      ? { transcribe: (wav: Uint8Array) => transcribeLocal(Array.from(wav)) }
      : null;

  const mic = useVoice({
    local: localEngine,
    onText: (heard) => {
      setVoiceError(null);
      setText(heard);
      search(heard);
    },
    onError: (message) => setVoiceError(message),
  });

  // Чем распознаём — видно сразу: пока своего движка нет, звук уходит наружу, и
  // человек должен знать это до того, как заговорит, а не после.
  useEffect(() => {
    speechStatus()
      .then(setSpeech)
      .catch(() => setSpeech(null));
  }, []);

  useEffect(() => {
    if (!mic.listening) {
      setSeconds(0);
      return;
    }
    const timer = setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [mic.listening]);

  const execute = useCallback(() => {
    const plan = draft?.plan;
    if (!plan) return;

    const asked = draft.questions.map((question) => ({
      position: question.position,
      name: question.name,
      value: answers[`${question.position}:${question.name}`] ?? "",
    }));

    setRunning(true);
    setError(null);

    // Сначала отвечаем на вопросы и перепроверяем: запускать план, которому всё ещё
    // чего-то не хватает, значит узнать об этом уже после согласия.
    const prepared =
      asked.length > 0
        ? fillPlan(JSON.stringify(plan), asked).catch((reason: unknown) => {
            const message = reason instanceof Error ? reason.message : String(reason);
            setError(message);
            return null;
          })
        : Promise.resolve(draft);

    prepared
      .then((checked) => {
        if (!checked) return null;
        setDraft(checked);
        if (checked.problems.length > 0) {
          const message = checked.problems[0]?.problem ?? voice.loadError;
          setError(message);
          speak(voice.askSpoken(message));
          return null;
        }
        return runPlan(JSON.stringify(checked.plan), approved ? [1] : []);
      })
      .then((result) => {
        if (!result) return;
        setReport(result);
        const phrase = result.stopped
          ? voice.draftSpokenStopped(result.stopped)
          : voice.planSpeech(result.steps.length);
        setSpoken(speak(phrase) ? voice.said(phrase) : voice.silent);
      })
      .catch((reason: unknown) => {
        const message = reason instanceof Error ? reason.message : String(reason);
        setError(message);
        speak(voice.draftSpokenStopped(message));
      })
      .finally(() => setRunning(false));
  }, [draft, approved, answers]);

  return (
    <div className={styles.root}>
      <div>
        <Text as="h1" size={700}>
          {voice.title}
        </Text>
        <Text className={styles.lead} block>
          {voice.lead}
        </Text>
      </div>

      <Button
        className={mic.listening ? styles.micListening : styles.mic}
        appearance="primary"
        icon={<MicRegular />}
        aria-label={voice.hold}
        onPointerDown={(event) => {
          event.preventDefault();
          mic.start();
        }}
        onPointerUp={() => mic.stop()}
        onPointerLeave={() => mic.stop()}
        onPointerCancel={() => mic.stop()}
        onKeyDown={(event) => {
          if (event.key !== " " && event.key !== "Enter") return;
          event.preventDefault();
          if (!event.repeat) mic.start();
        }}
        onKeyUp={(event) => {
          if (event.key !== " " && event.key !== "Enter") return;
          event.preventDefault();
          mic.stop();
        }}
      >
        {mic.listening ? voice.listening(seconds) : voice.hold}
      </Button>

      <Text className={styles.note}>{voice.hotkey}</Text>
      <Text className={styles.note}>{voice.privacy}</Text>
      {speech ? (
        <Text className={speech.found && speech.model ? styles.localReady : styles.note}>
          {speech.found && speech.model
            ? voice.localReady(speech.program ?? "")
            : speech.found
              ? voice.localNoModel(speech.models_dir)
              : voice.localNone(speech.search_dir)}
        </Text>
      ) : null}

      {voiceError ? <Text className={styles.error}>{voiceError}</Text> : null}

      <form
        className={styles.bar}
        onSubmit={(event) => {
          event.preventDefault();
          search(text);
        }}
      >
        <Input
          className={styles.input}
          value={text}
          aria-label={voice.heard}
          placeholder={voice.heardPlaceholder}
          onChange={(_, data) => setText(data.value)}
        />
        <Button type="submit" disabled={busy}>
          {voice.find}
        </Button>
      </form>

      {spoken ? <Text className={styles.spoken}>{spoken}</Text> : null}

      {error ? (
        <Text className={styles.error}>{`${voice.loadError}: ${error}`}</Text>
      ) : items === null ? (
        <Text className={styles.note}>{voice.nothingYet}</Text>
      ) : items.length === 0 ? (
        <Text className={styles.note}>{voice.spokenNothing}</Text>
      ) : (
        <ActionList items={items} />
      )}

      {draft?.plan ? (
        <section className={styles.draft}>
          <Text weight="semibold">{voice.draftTitle}</Text>
          <ul className={styles.problems}>
            {draft.gates.map((gate) => (
              <li key={gate.position}>
                <label>
                  {gate.decision === "confirm" ? (
                    <input
                      type="checkbox"
                      aria-label={voice.draftApprove(gate.position)}
                      checked={approved}
                      onChange={(event) => setApproved(event.target.checked)}
                    />
                  ) : null}{" "}
                  {gate.registry} · {voice.planRisk[gate.risk] ?? gate.risk}
                  {gate.decision === "confirm" ? ` · ${voice.draftNeed}` : ""}
                </label>
              </li>
            ))}
          </ul>
          {draft.questions.length > 0 ? (
            <>
              <Text className={styles.note}>{voice.askTitle}</Text>
              {draft.questions.map((question) => {
                const key = `${question.position}:${question.name}`;
                return (
                  <Input
                    key={key}
                    value={answers[key] ?? ""}
                    aria-label={question.label}
                    placeholder={question.hint || question.label}
                    onChange={(_, data) =>
                      setAnswers((current) => ({ ...current, [key]: data.value }))
                    }
                  />
                );
              })}
            </>
          ) : null}

          {draft.problems
            .filter(
              (problem) =>
                !(draft.questions.length > 0 && problem.problem.includes("не хватает данных")),
            )
            .map((problem, index) => (
              <Text key={`${problem.position}-${index}`} className={styles.error}>
                {`${voice.draftMissing}: ${problem.problem}`}
              </Text>
            ))}
          <div className={styles.bar}>
            <Button
              appearance="primary"
              disabled={
                running ||
                draft.gates.some((gate) => gate.decision === "confirm" && !approved) ||
                draft.questions.some(
                  (question) =>
                    (answers[`${question.position}:${question.name}`] ?? "").trim().length === 0,
                ) ||
                draft.problems.some(
                  (problem) =>
                    !(draft.questions.length > 0 && problem.problem.includes("не хватает данных")),
                )
              }
              onClick={execute}
            >
              {running
                ? voice.draftRunning
                : draft.questions.length > 0
                  ? voice.askRun
                  : voice.draftRun}
            </Button>
            {report ? (
              <Text className={report.stopped ? styles.error : styles.localReady}>
                {report.stopped ? report.stopped : voice.draftDone}
              </Text>
            ) : null}
          </div>
        </section>
      ) : null}

      {learning ? (
        <section className={styles.draft}>
          <Text weight="semibold">{voice.learnTitle}</Text>
          <Text className={styles.note}>
            {`${voice.learnNothing}: «${learning.example}» · ${voice.learnTimes(learning.times)}`}
          </Text>
          {learning.implementation.length > 0 ? (
            <>
              <Text className={styles.note}>{voice.learnHow}</Text>
              <ul className={styles.problems}>
                {learning.implementation.map((how) => (
                  <li key={how}>{how}</li>
                ))}
              </ul>
            </>
          ) : null}
          <Text className={styles.note}>{voice.learnSteps}</Text>
          <ul className={styles.problems}>
            {learning.steps.map((step) => (
              <li key={step.title}>
                {step.done ? "✓" : "—"} {step.title}
              </li>
            ))}
          </ul>
          <Text className={styles.note}>{voice.learnRisk(learning.risk)}</Text>
        </section>
      ) : null}

      {onOpen ? (
        <div className={styles.hood}>
          <Text className={styles.note}>{voice.underHood}</Text>
          <Button appearance="subtle" size="small" onClick={() => onOpen("catalog")}>
            {voice.openCatalog}
          </Button>
          <Button appearance="subtle" size="small" onClick={() => onOpen("hands")}>
            {voice.openHands}
          </Button>
          <Button appearance="subtle" size="small" onClick={() => onOpen("flows")}>
            {voice.openFlows}
          </Button>
          <Button appearance="subtle" size="small" onClick={() => onOpen("journal")}>
            {voice.openJournal}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
