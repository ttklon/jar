import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Input, makeStyles, Switch, Text, tokens } from "@fluentui/react-components";
import { MicRegular } from "@fluentui/react-icons";
import {
  draftPlan,
  fillPlan,
  facts,
  foregroundWindow,
  planFor,
  rememberFact,
  requestLearning,
  runPlan,
  isolationStatus,
  speechStatus,
  transcribeLocal,
} from "../ipc";
import type {
  Fact,
  ForegroundWindow,
  IsolationStatus,
  Learning,
  PlanCheck,
  PlanItem,
  PlanReport,
  SpeechStatus,
} from "../ipc";
import { speak } from "../lib/voice";
import { aroundPhrase, rankForWindow } from "../lib/context";
import { factKey, factsToRemember, seedAnswers } from "../lib/facts";
import { subscribeGlobalTalk } from "../lib/globalTalk";
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
  answer: { display: "flex", gap: "8px", alignItems: "center" },
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
  const [isolation, setIsolation] = useState<IsolationStatus | null>(null);
  /** Что перед человеком: спрашиваем в момент, когда он заговорил, а не один раз. */
  const [front, setFront] = useState<ForegroundWindow | null>(null);
  const [frontError, setFrontError] = useState<string | null>(null);
  /**
   * Окно для поиска. Держим в ссылке: колбэк микрофона живёт дольше одного рендера и
   * иначе увидел бы окно, которое было открыто в момент его создания.
   */
  const frontRef = useRef<ForegroundWindow | null>(null);
  /** Что именно учтено в этом поиске — иначе «учли контекст» превращается в обещание. */
  const [usedAround, setUsedAround] = useState<string | null>(null);
  const [draft, setDraft] = useState<PlanCheck | null>(null);
  const [approved, setApproved] = useState(false);
  const [report, setReport] = useState<PlanReport | null>(null);
  const [running, setRunning] = useState(false);
  // Ответы на вопросы плана: ключ — «шаг:параметр», чтобы два шага не путались.
  const [answers, setAnswers] = useState<Record<string, string>>({});
  /** Что приложение уже знает: сказанное раньше человеку не задают второй раз. */
  const [knownFacts, setKnownFacts] = useState<Fact[]>([]);
  /** Поля, заполненные из памяти, — экран говорит, откуда значение. */
  const [remembered, setRemembered] = useState<string[]>([]);
  const [learning, setLearning] = useState<Learning | null>(null);
  /** Режим «слушаю всегда»: микрофон открыт, фразу вырезает тишина. */
  const [always, setAlways] = useState(false);
  /**
   * Вопрос, на который человек отвечает голосом. Пока он задан, услышанное идёт в поле,
   * а не в новый поиск: иначе ответ «C:\tmp» приложение приняло бы за новую задачу.
   */
  const [answerTarget, setAnswerTarget] = useState<{
    position: number;
    name: string;
  } | null>(null);

  const search = useCallback((phrase: string) => {
    const query = phrase.trim();
    if (query.length === 0) {
      setItems(null);
      return;
    }

    setBusy(true);
    setError(null);
    planFor(query, LIMIT)
      .then(async (raw) => {
        // Сначала то, что про программу перед человеком. Решения и опасность не меняются.
        const ranked = rankForWindow(raw, frontRef.current);
        const found = ranked.items;
        setUsedAround(ranked.moved > 0 && frontRef.current ? aroundPhrase(frontRef.current) : null);
        setItems(found);
        setReport(null);
        setApproved(false);

        // Черновик плана: что именно приложение собирается сделать. Спрашиваем его
        // сразу — человек сказал задачу, и ответ «могу сделать вот это» полезнее списка.
        const proposal = await draftPlan(query).catch(() => null);
        setDraft(proposal);
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
        // Спрашиваем только то, чего не знаем: вопрос о забытом — это не забота.
        const first = proposal?.questions.find(
          (question) => !knownFacts.some((fact) => fact.key === factKey(question)),
        );
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
  }, [knownFacts]);

  // Свой движок есть — пишем звук и отдаём ему: это единственный путь, где звук не
  // покидает компьютер. Нет — слушаем тем, что даёт система, и говорим об этом выше.
  const localEngine =
    speech && speech.found && speech.model
      ? { transcribe: (wav: Uint8Array) => transcribeLocal(Array.from(wav)) }
      : null;

  // Колбэк микрофона живёт дольше одного рендера, поэтому «какой вопрос слушаем» читаем
  // из ссылки: иначе в замыкании осталось бы старое значение.
  const answerTargetRef = useRef(answerTarget);
  answerTargetRef.current = answerTarget;

  const mic = useVoice({
    local: localEngine,
    always,
    onText: (heard) => {
      setVoiceError(null);
      const target = answerTargetRef.current;

      if (target) {
        const value = heard.trim();
        setAnswerTarget(null);
        setAnswers((current) => ({ ...current, [`${target.position}:${target.name}`]: value }));
        speak(voice.answerHeard(value));

        // Следующий пустой вопрос задаём вслух: человек, который говорит, не смотрит в экран.
        const next = draft?.questions.find(
          (question) =>
            `${question.position}:${question.name}` !== `${target.position}:${target.name}` &&
            (answers[`${question.position}:${question.name}`] ?? "").trim().length === 0,
        );
        if (next) speak(voice.askSpoken(next.label));
        return;
      }

      setText(heard);
      search(heard);
    },
    onError: (message) => setVoiceError(message),
  });

  useEffect(() => {
    frontRef.current = front;
  }, [front]);

  // Подставляем известное: путь, маску, имя — то, что человек уже диктовал. Делаем это
  // эффектом, потому что факты и план приходят в любом порядке; сработав в поиске, мы бы
  // один из двух порядков пропустили и спросили бы то, что уже сказано.
  useEffect(() => {
    if (!draft || knownFacts.length === 0) return;

    const seeded = seedAnswers(draft.questions, knownFacts, answers);
    if (seeded.remembered.length === 0) return;

    setAnswers((current) => ({ ...current, ...seeded.answers }));
    setRemembered((current) => [...new Set([...current, ...seeded.remembered])]);
    // `answers` не в зависимостях намеренно: подстановка не должна запускать саму себя.
  }, [draft, knownFacts]);

  // Активное окно спрашиваем в тот момент, когда человек заговорил: он говорит про то,
  // что видит сейчас, а не про то, что было при открытии приложения.
  useEffect(() => {
    if (!mic.listening) return;

    foregroundWindow()
      .then((window) => {
        setFront(window);
        setFrontError(null);
      })
      .catch((reason: unknown) => {
        setFront(null);
        setFrontError(reason instanceof Error ? reason.message : String(reason));
      });
  }, [mic.listening]);

  // Первый взгляд на экран тоже полезен: видно, что приложение понимает, где оно.
  useEffect(() => {
    foregroundWindow()
      .then(setFront)
      .catch((reason: unknown) =>
        setFrontError(reason instanceof Error ? reason.message : String(reason)),
      );
  }, []);

  // Удержание из любой программы: человек говорит в браузере или поверх видео, а окно
  // помощника даже не в фокусе. Где глобальных клавиш нет (браузер) — подписка пустая.
  useEffect(() => {
    let off: (() => void) | null = null;
    let alive = true;

    subscribeGlobalTalk({
      down: () => {
        if (always && mic.listening) mic.stop();
        else mic.start();
      },
      up: () => {
        if (!always) mic.stop();
      },
    })
      .then((unsubscribe) => {
        if (alive) off = unsubscribe;
        else unsubscribe();
      })
      .catch(() => {
        // Без глобальной клавиши всё равно работает кнопка на экране.
      });

    return () => {
      alive = false;
      off?.();
    };
  }, [always, mic.listening, mic.start, mic.stop]);

  // Чем распознаём — видно сразу: пока своего движка нет, звук уходит наружу, и
  // человек должен знать это до того, как заговорит, а не после.
  useEffect(() => {
    speechStatus()
      .then(setSpeech)
      .catch(() => setSpeech(null));

    // Потолки — вторая половина того же честного разговора: чем распознаём и что
    // будет, если запущенная команда ошибётся. Сказать об этом один раз на экране
    // дешевле, чем объяснять потом.
    isolationStatus()
      .then(setIsolation)
      .catch(() => setIsolation(null));

    // Память фактов: то, что человек уже говорил, спрашивать второй раз незачем.
    facts()
      .then(setKnownFacts)
      .catch(() => setKnownFacts([]));
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

    // Сказал один раз — помню. Запоминаем само сказанное, а не «что сработало»:
    // неудачный запуск не должен подтверждать ответ.
    const toRemember = factsToRemember(draft.questions, answers);
    if (toRemember.length > 0) {
      void Promise.all(toRemember.map((fact) => rememberFact(fact.key, fact.value).catch(() => undefined)))
        .then(() => facts().then(setKnownFacts).catch(() => undefined));
    }

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
        aria-label={always ? voice.always : voice.hold}
        onPointerDown={(event) => {
          event.preventDefault();
          // В режиме «слушаю всегда» нажатие — это переключатель, а не «держать».
          if (always) {
            if (mic.listening) mic.stop();
            else mic.start();
            return;
          }
          mic.start();
        }}
        onPointerUp={() => {
          if (!always) mic.stop();
        }}
        onPointerLeave={() => {
          if (!always) mic.stop();
        }}
        onPointerCancel={() => {
          if (!always) mic.stop();
        }}
        onKeyDown={(event) => {
          if (event.key !== " " && event.key !== "Enter") return;
          event.preventDefault();
          if (event.repeat) return;
          if (always && mic.listening) mic.stop();
          else mic.start();
        }}
        onKeyUp={(event) => {
          if (always) return;
          if (event.key !== " " && event.key !== "Enter") return;
          event.preventDefault();
          mic.stop();
        }}
      >
        {always
          ? mic.listening
            ? mic.speaking
              ? voice.alwaysSpeaking
              : voice.alwaysOn
            : voice.switchToAlways
          : mic.listening
            ? voice.listening(seconds)
            : voice.hold}
      </Button>

      <Switch
        checked={always}
        disabled={!mic.alwaysSupported}
        label={voice.always}
        onChange={(_event, data) => {
          setAlways(data.checked);
          if (!data.checked && mic.listening) mic.stop();
        }}
      />
      <Text className={styles.note}>{voice.alwaysHint}</Text>
      {!mic.alwaysSupported ? (
        <Text className={styles.note}>{voice.alwaysNoEngine}</Text>
      ) : null}

      {front ? (
        <Text className={styles.note}>
          {`${voice.contextTitle}: ${voice.contextLine(front.title, front.process)}`}
        </Text>
      ) : null}
      {usedAround ? (
        <Text className={styles.note}>{voice.contextUsing(usedAround)}</Text>
      ) : null}
      {frontError ? (
        <Text className={styles.note}>{voice.contextNone(frontError)}</Text>
      ) : null}

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

      {isolation ? (
        <Text className={styles.note}>
          {isolation.available
            ? voice.ceilings(isolation.summary, isolation.note)
            : voice.ceilingsNone(isolation.note)}
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
                const target = answerTarget?.position === question.position &&
                  answerTarget?.name === question.name;

                return (
                  <div key={key} className={styles.answer}>
                    <Input
                      value={answers[key] ?? ""}
                      aria-label={question.label}
                      placeholder={question.hint || question.label}
                      onChange={(_, data) => {
                        setAnswers((current) => ({ ...current, [key]: data.value }));
                        // Человек поправил — это уже не память, а его слово.
                        setRemembered((current) => current.filter((field) => field !== key));
                      }}
                    />
                    {remembered.includes(key) ? (
                      <Text className={styles.note}>{voice.fromMemory}</Text>
                    ) : null}
                    <Button
                      size="small"
                      appearance="subtle"
                      icon={<MicRegular />}
                      aria-label={`${voice.answerSay}: ${question.label}`}
                      onPointerDown={(event) => {
                        event.preventDefault();
                        setAnswerTarget({ position: question.position, name: question.name });
                        mic.start();
                      }}
                      onPointerUp={() => mic.stop()}
                      onPointerLeave={() => mic.stop()}
                      onPointerCancel={() => mic.stop()}
                    >
                      {target && mic.listening ? voice.answerListening : voice.answerSay}
                    </Button>
                  </div>
                );
              })}
              <Text className={styles.note}>{voice.answerHint}</Text>
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
