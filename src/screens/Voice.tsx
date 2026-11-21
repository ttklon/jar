import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Input, makeStyles, Switch, Text, tokens } from "@fluentui/react-components";
import { MicRegular } from "@fluentui/react-icons";
import {
  adoptHand,
  declarePresence,
  draftHand,
  draftPlan,
  fillPlan,
  facts,
  foregroundWindow,
  modelPrompt,
  planFor,
  think,
  trialHand,
  rememberFact,
  requestLearning,
  runPlan,
  cancelTool,
  isolationStatus,
  readinessStatus,
  smokeCheck,
  speechStatus,
  setVoiceTrayStatus,
  machineState,
  transcribeLocal,
  uiDump,
  uiPress,
  uiType,
} from "../ipc";
import type {
  CustomHand,
  Fact,
  HandDraft,
  TrialReport,
  Thought,
  ForegroundWindow,
  IsolationStatus,
  Learning,
  PlanCheck,
  PlanItem,
  PlanReport,
  MachineState,
  Presence,
  SpeechStatus,
  UiDump,
  UiPress,
  UiTyped,
} from "../ipc";
import { MicrophoneCheck } from "../components/MicrophoneCheck";
import { ReadinessCard } from "../components/ReadinessCard";
import { firstOpenQuestion, phraseIsAnswer, questionField } from "../lib/answer";
import { consentCanRun, consentPositions, isSpokenConsent, keepsPendingPlan } from "../lib/consent";
import { installedEngine, isEngineDown } from "../lib/engineReady";
import { followUpQuery, isFollowUp } from "../lib/followUp";
import { isSpokenStop } from "../lib/spoken";
import { speak, stopSpeaking } from "../lib/voice";
import { aroundPhrase, rankForWindow } from "../lib/context";
import { factKey, factsToRemember, seedAnswers } from "../lib/facts";
import { describeThought } from "../lib/thought";
import {
  add,
  continuationQuery,
  DEEDS_PER_HOUR,
  hourLeft,
  MAX_TRIES,
  markScreen,
  pick,
  progress,
  replenish,
  retry,
  setState,
  startHour,
  stopGoal,
  stopRemaining,
  summary,
  takeDeed,
  phraseIsEnough,
  remove,
  revive,
  unattended,
  usesScreen,
  type HourLog,
  type QueueItem,
} from "../lib/queue";
import {
  fixQuery,
  look,
  roundLine,
  step as loopStep,
  type Look,
  type RoundOutcome,
} from "../lib/loop";
import { subscribeGlobalTalk } from "../lib/globalTalk";
import { useVoice } from "../lib/useVoice";
import { describePlanParams } from "../lib/planPreview";
import { ActionList } from "../components/ActionList";
import { voice, microphoneCheck as micTestText } from "../i18n/ru";

/**
 * Главный экран. Человек ничего здесь не выбирает: он держит кнопку, говорит задачу,
 * отпускает — и слышит, что приложение об этом думает.
 *
 * Почему так, а не списком экранов: задача приходит словами, ответ должен приходить
 * словами тоже. Реестр, руки и журнал не убраны — они за кнопкой «Под капотом», для
 * тех случаев, когда человек хочет проверить, а не поработать.
 */

const LIMIT = 8;

/** Сколько элементов окна просим. Больше — экран подробнее, но и подсказка длиннее. */
const SCREEN_NODES = 120;

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
  prompt: {
    maxHeight: "14rem",
    overflow: "auto",
    whiteSpace: "pre-wrap",
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: tokens.fontSizeBase200,
    background: tokens.colorNeutralBackground3,
    borderRadius: tokens.borderRadiusMedium,
    padding: "8px 10px",
    margin: "4px 0 0",
  },
  section: { display: "flex", flexDirection: "column", gap: "6px", maxWidth: "96ch" },
  title: { fontWeight: tokens.fontWeightSemibold },
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
  active?: boolean;
  /** Переход к доказательству: реестр, руки, сценарии, история. */
  onOpen?: (screen: string) => void;
}

type EngineStart =
  | { kind: "started" }
  | { kind: "missing" }
  | { kind: "failed"; note: string }
  | { kind: "unknown" };

export function Voice({ onOpen, active = true }: VoiceScreenProps) {
  const styles = useStyles();
  const [text, setText] = useState("");
  const [items, setItems] = useState<PlanItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const searchRequestRef = useRef(0);
  /**
   * Номер запуска плана. Отдельно от «человек что-то поправил»: правка ответа
   * отменяет старый запуск, но не должна стирать «выполняю…» у того, кто просто
   * ждёт перепроверку.
   */
  const executeRequestRef = useRef(0);
  const planRunRef = useRef(0);
  const runCheckedRef = useRef<(check: PlanCheck) => void>(() => {});
  const thoughtRequestRef = useRef(0);
  const promptRequestRef = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [spoken, setSpoken] = useState<string | null>(null);
  /** Отменил ли человек запись — чтобы «ничего не ушло» было видно, а не молчало. */
  const [cancelled, setCancelled] = useState(false);
  const [cancelledAsr, setCancelledAsr] = useState(false);
  const [micCheckBusy, setMicCheckBusy] = useState(false);
  const [speech, setSpeech] = useState<SpeechStatus | null>(null);
  const speechRequest = useRef(0);
  const aliveRef = useRef(true);
  const [systemSpeechConsent, setSystemSpeechConsent] = useState(false);
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
  const [approved, setApproved] = useState<number[]>([]);
  const [report, setReport] = useState<PlanReport | null>(null);
  const [running, setRunning] = useState(false);
  // Ответы на вопросы плана: ключ — «шаг:параметр», чтобы два шага не путались.
  const [answers, setAnswers] = useState<Record<string, string>>({});
  /** Черновик руки. Это текст: у него нет пути к запуску, и это сказано на экране. */
  const [handDraft, setHandDraft] = useState<HandDraft | null>(null);
  const [handError, setHandError] = useState<string | null>(null);
  const [handBusy, setHandBusy] = useState(false);
  /** Отчёт о пробе в клетке. Отчёт, а не «научились». */
  const [trial, setTrial] = useState<TrialReport | null>(null);
  const [trialBusy, setTrialBusy] = useState(false);
  /** Принятые руки: отдельно от встроенных, запускаются только в клетке и по слову. */
  const [adopted, setAdopted] = useState<CustomHand | null>(null);
  /** Очередь дел: несколько задач подряд, пока человек не скажет «стоп». */
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [queueOn, setQueueOn] = useState(false);
  /** Почему очередь стоит — словами, а не пустым местом. */
  const [queueIdle, setQueueIdle] = useState<string | null>(null);
  const queueRef = useRef<QueueItem[]>([]);
  const queueStopRef = useRef(false);
  const queueRunningRef = useRef(false);
  /**
   * Счёт начатых дел за час. Живёт в ссылке: очередь читает его между рендерами, а
   * показывается он на экране — чтобы потолок был виден, а не подразумевался.
   */
  const hourRef = useRef<HourLog>(startHour(Date.now()));
  const [hour, setHour] = useState<HourLog>(hourRef.current);
  /**
   * Цели, которые человек остановил сам. Ссылка — потому что очередь читает её между
   * рендерами, состояние — чтобы это было видно на экране, а не помнилось «где-то».
   */
  const stoppedGoalsRef = useRef<Set<string>>(new Set());
  const [stoppedGoals, setStoppedGoals] = useState<string[]>([]);
  /**
   * Петля улучшения по целям: что показал каждый круг. Ссылка — очередь читает счёт между
   * рендерами, состояние — чтобы счёт был виден человеку, а не помнился «где-то».
   */
  const loopRef = useRef<Map<string, { rounds: Look[]; fixes: number }>>(new Map());
  const [loopLines, setLoopLines] = useState<Record<string, string>>({});
  /**
   * Последний ответ машины про «можно начинать». Петля спрашивает его же, а не своё
   * мнение о том, сколько ещё выдержит компьютер.
   */
  const mayStartRef = useRef(true);
  /** Что с машиной: загрузка, память, присутствие человека. Ничего не запускает. */
  const [machine, setMachine] = useState<MachineState | null>(null);
  const [machineError, setMachineError] = useState<string | null>(null);
  /** Слово про присутствие не сохранилось — это отдельная ошибка, а не «машина не измерилась». */
  const [presenceError, setPresenceError] = useState<string | null>(null);
  const [machineBusy, setMachineBusy] = useState(false);
  /** Элемент, который человек решил нажать: сначала показываем, потом нажимаем. */
  const [pressing, setPressing] = useState<string | null>(null);
  /** Что человек написал в поле перед вводом: имя поля → текст. */
  const [fields, setFields] = useState<Record<string, string>>({});
  /** Поле, которое человек собрался заполнить: сначала спрашиваем, потом вводим. */
  const [typing, setTyping] = useState<string | null>(null);
  /** Итог ввода: прочиталось обратно или программа не приняла. */
  const [typed, setTyped] = useState<UiTyped | null>(null);
  const [typeError, setTypeError] = useState<string | null>(null);
  /** Итог нажатия: нажато и изменилось, нажато и нет, или отказ. */
  const [pressResult, setPressResult] = useState<UiPress | null>(null);
  const [pressError, setPressError] = useState<string | null>(null);
  /** Что видно в активном окне: элементы, прочитанные UI Automation. Только чтение. */
  const [screen, setScreen] = useState<UiDump | null>(null);
  const [screenError, setScreenError] = useState<string | null>(null);
  const [screenBusy, setScreenBusy] = useState(false);
  /** Что модель предложила. Предложение, а не действие: выполнять его пока нечем. */
  const [thought, setThought] = useState<Thought | null>(null);
  const [thinking, setThinking] = useState(false);
  const [thinkError, setThinkError] = useState<string | null>(null);
  const [enginePrompt, setEnginePrompt] = useState<string | null>(null);
  const [engineBusy, setEngineBusy] = useState(false);
  /** files — скачивать нечего; failed — запуск не подтвердился; manual — статус не прочитался. */
  const [engineGap, setEngineGap] = useState<"files" | "failed" | "manual" | null>(null);
  /** Что именно уйдёт модели — по кнопке и честно, без «доверьтесь нам». */
  const [promptText, setPromptText] = useState<string | null>(null);
  const [promptError, setPromptError] = useState<string | null>(null);
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

  /**
   * Прочитать активное окно по элементам.
   *
   * Ошибка чтения — не ошибка задачи: без экрана помощник просто менее зрячий, и об этом
   * говорится вслух. Молча подставлять «наверное, браузер» было бы хуже пустоты.
   */
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const runningRef = useRef(running);
  runningRef.current = running;
  const executeRef = useRef<(granted?: number[], answerOverride?: Record<string, string>) => void>(
    () => {},
  );
  const answersRef = useRef(answers);
  answersRef.current = answers;
  const askModelRef = useRef<(phrase: string) => void>(() => {});
  const micStopRef = useRef<() => void>(() => {});
  /** Одна попытка на фразу: повторный отказ не крутит запуск по кругу. */
  const engineAttemptRef = useRef<string | null>(null);
  /** Последняя настоящая задача. «Ещё» и «стоп» её не подменяют. */
  const lastTaskRef = useRef<string | null>(null);
  const startInstalledEngineRef = useRef<() => Promise<EngineStart>>(async () => ({ kind: "unknown" }));

  const startInstalledEngine = useCallback(async (): Promise<EngineStart> => {
    let status = null;
    try {
      status = await readinessStatus();
    } catch {
      return { kind: "unknown" };
    }
    const need = installedEngine(status);
    if (need === "running") return { kind: "started" };
    if (need === "missing") return { kind: "missing" };
    if (need !== "start") return { kind: "unknown" };
    try {
      const result = await smokeCheck();
      return result.ok ? { kind: "started" } : { kind: "failed", note: result.note };
    } catch (reason: unknown) {
      return { kind: "failed", note: reason instanceof Error ? reason.message : String(reason) };
    }
  }, []);
  startInstalledEngineRef.current = startInstalledEngine;

  // Уже установленный движок поднимается вместе с экраном, не по первой фразе.
  // Скачивания нет. Неуспех не кричит: следующая фраза объяснит сама.
  useEffect(() => {
    let alive = true;
    void (async () => {
      let status = null;
      try {
        status = await readinessStatus();
      } catch {
        return;
      }
      if (!alive || installedEngine(status) !== "start") return;
      setEngineBusy(true);
      try {
        await smokeCheck();
      } catch {
        return;
      } finally {
        if (alive) setEngineBusy(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  /**
   * Фраза, которой нужна модель, сама запускает уже установленный движок.
   * Файлов нет — не скачиваем. Запуск не подтвердился — фразу повторно не шлём.
   */
  const wakeEngine = useCallback(
    async (query: string, stillCurrent: () => boolean, retry: () => void) => {
      if (!stillCurrent()) return;
      if (engineAttemptRef.current === query) {
        setThinkError(voice.engineDown);
        setEngineGap("manual");
        setEnginePrompt(query);
        return;
      }
      engineAttemptRef.current = query;
      setEnginePrompt(query);
      setEngineGap(null);
      setEngineBusy(true);
      setThinkError(null);
      speak(voice.engineStarting);
      const outcome = await startInstalledEngine();
      setEngineBusy(false);
      if (!stillCurrent()) return;
      if (outcome.kind === "started") {
        setEnginePrompt(null);
        setEngineGap(null);
        retry();
        return;
      }
      if (outcome.kind === "missing") {
        setEngineGap("files");
        setEnginePrompt(query);
        speak(voice.engineFilesMissing);
        return;
      }
      if (outcome.kind === "failed") {
        setEngineGap("failed");
        setEnginePrompt(query);
        const note = voice.engineStartFailed(outcome.note);
        setThinkError(note);
        speak(note);
        return;
      }
      setEngineGap("manual");
      setEnginePrompt(query);
      setThinkError(voice.engineDown);
    },
    [startInstalledEngine],
  );

  /**
   * Идти по очереди, пока не скажут «стоп».
   *
   * Перед каждым делом спрашиваем машину заново: за время работы человек мог вернуться,
   * а память — кончиться. Один раз спросить и решить на весь вечер было бы самонадеянно.
   *
   * Дела идут одновременно, но не все: бюджет машины задаёт ширину, а правило про экран —
   * вторую границу. План каждого дела сначала собирается, чтобы знать, трогает ли оно
   * чужое окно; знать это по словам человека нельзя.
   */
  const startQueue = useCallback(async () => {
    if (queueRunningRef.current) return;

    queueRunningRef.current = true;
    queueStopRef.current = false;
    setQueueOn(true);
    setQueueIdle(null);
    // Счёт кругов — про этот запуск. Старые круги к новому «работать без меня» не относятся.
    loopRef.current = new Map();
    setLoopLines({});

    let items = queueRef.current;
    const plans = new Map<string, PlanCheck | null>();
    const inFlight = new Map<string, Promise<void>>();

    // Пока очередь идёт, человек продолжает жить на этом же экране: он может убрать
    // дело или вернуть его в руки. Поэтому каждое своё изменение очередь кладёт поверх
    // того, что лежит сейчас, а не поверх копии, снятой на старте.
    const mine = (change: (current: QueueItem[]) => QueueItem[]) => {
      const next = change(queueRef.current);
      sync(next);
      return next;
    };

    const sync = (next: QueueItem[]) => {
      items = next;
      queueRef.current = items;
      setQueue(items);
    };

    /** Отметить начатое дело в счёте за час — до запуска, а не после удачи. */
    const takeHour = () => {
      hourRef.current = takeDeed(hourRef.current, Date.now());
      setHour(hourRef.current);
    };

    /**
     * Записать круг петли: что показал «посмотреть». Считается по отчёту ядра, а не по
     * бодрости очереди: «запуск прошёл» без единого шага — не сделано.
     */
    const recordRound = (origin: string, outcome: RoundOutcome) => {
      const current = loopRef.current.get(origin) ?? { rounds: [] as Look[], fixes: 0 };
      const verdict = look(outcome);
      // Удачный круг обнуляет счёт поправок: у нового сбоя своя поправка, а не «уже была».
      const fixes = verdict === "done" ? 0 : current.fixes;
      const rounds = [...current.rounds, verdict];
      loopRef.current.set(origin, { rounds, fixes });
      setLoopLines((lines) => ({ ...lines, [origin]: roundLine(origin, rounds) }));
    };

    /** Одно дело: план, проверка «можно ли без человека», запуск и итог. */
    const launch = (item: QueueItem) => {
      /** Чем кончился последний прогон дела — из этого собирается круг петли. */
      let outcome: RoundOutcome | null = null;

      const task = (async () => {
        const check = plans.get(item.id) ?? null;
        const verdict = unattended(check);

        if (!verdict.can || !check?.plan) {
          mine((current) => setState(current, item.id, "held", verdict.why));
          return;
        }

        // Потолок в час считает дела, а не попытки: повтор одного дела — не второе дело.
        takeHour();

        let tries = 0;
        for (;;) {
          tries += 1;
          mine((current) =>
            setState(
              current,
              item.id,
              "running",
              tries > 1 ? `попытка ${tries} из ${MAX_TRIES}` : "",
            ),
          );

          const report = await runPlan(JSON.stringify(check.plan), []).catch(() => null);
          if (!report) {
            mine((current) => setState(current, item.id, "failed", "запуск не состоялся: ядро не ответило"));
            outcome = { completed: 0, steps: 0, stopped: "ядро не ответило" };
            return;
          }

          if (!report.stopped) {
            mine((current) => setState(current, item.id, "done", `шагов: ${report.steps.length}, всё выполнено`));
            outcome = {
              completed: report.steps.length,
              steps: report.steps.length,
              stopped: null,
            };
            return;
          }

          const completed = report.steps.filter((step) => step.status === "ok").length;

          // Сказал «стоп» — второй раз не пробуем: это уже не помощь, а спорт.
          const verdict = queueStopRef.current
            ? { again: false, why: "остановлено вами: второй раз не пробую" }
            : retry({ completed, stopped: report.stopped }, tries);

          if (!verdict.again) {
            mine((current) =>
              setState(
                current,
                item.id,
                "failed",
                `${verdict.why} — остановилось на: ${report.stopped}`,
              ),
            );
            outcome = { completed, steps: report.steps.length, stopped: report.stopped };
            return;
          }

          // Короткая пауза: помеха могла быть случайной, но ждать её «когда-нибудь» нельзя.
          mine((current) => setState(current, item.id, "running", verdict.why));
          await new Promise((resolve) => setTimeout(resolve, 300));
        }
      })().finally(() => {
        // Круг считается по делу: у одиночного дела цели нет, и петли у него тоже нет.
        if (outcome && item.origin) recordRound(item.origin, outcome);
        inFlight.delete(item.id);
      });

      inFlight.set(item.id, task);
    };

    /**
     * Спросить модель, что дальше по незакрытым целям.
     *
     * Спрашиваем только про цели, которые человек сам разложил на дела: одиночное дело —
     * не цель, продолжать его нечем. Сколько дел взять, решает не модель и не аппетит
     * очереди, а потолок в час: пришло три дела, а можно одно — берём одно.
     *
     * Возвращается не только «сколько добавил», но и «почему не добавил»: молчаливая
     * остановка неотличима от поломки, а человек в этот момент, скорее всего, не у экрана.
     */
    const continueGoals = async (): Promise<{ added: number; why: string | null }> => {
      if (queueStopRef.current) return { added: 0, why: null };
      // Читаем то, что лежит сейчас: человек мог убрать дело или вернуть его в руки.
      items = queueRef.current;

      const origins = [
        ...new Set(
          items
            .map((item) => item.origin)
            .filter((origin): origin is string => typeof origin === "string" && origin.length > 0),
        ),
      ];

      let added = 0;
      let why: string | null = null;

      for (const origin of origins) {
        if (queueStopRef.current) break;

        // Человек остановил эту цель — новых дел по ней не придумываем, даже если все
        // прежние уже сделаны: «стоп» относится и к тому, чего ещё нет.
        if (stoppedGoalsRef.current.has(origin)) {
          why = `цель «${origin}» остановлена вами — новых дел по ней не беру`;
          continue;
        }

        // Что дальше: новое улучшение, поправка сбоя или стоп. Решает петля по отчётам,
        // а не аппетит очереди — иначе «пока не скажу стоп» превратилось бы в «сколько выдержит».
        const loopState = loopRef.current.get(origin) ?? { rounds: [] as Look[], fixes: 0 };
        const decision = loopStep({
          rounds: loopState.rounds,
          fixes: loopState.fixes,
          stopped: queueStopRef.current,
          left: hourLeft(hourRef.current, Date.now()),
          mayStart: mayStartRef.current,
        });

        if (decision.action === "stop") {
          why = `по цели «${origin}»: ${decision.why}`;
          continue;
        }

        const room = replenish(items, origin, hourRef.current, Date.now());
        // Поправка — не новое дело поверх провала, а ответ на него: правило «сначала
        // разберитесь» её не отменяет, а всё остальное остаётся за replenish.
        if (!room.ask && decision.action !== "fix") {
          // Причина видна человеку: «почему не продолжаю» — такой же ответ, как «почему стою».
          why = room.why;
          continue;
        }

        // Поправка считается сразу: если и она не поможет, второй не будет.
        if (decision.action === "fix") {
          loopRef.current.set(origin, {
            rounds: loopState.rounds,
            fixes: loopState.fixes + 1,
          });
        }

        const query =
          decision.action === "fix" ? fixQuery(origin, items) : continuationQuery(origin, items);
        let answer: Thought | null = null;
        try {
          answer = await think(query, null);
        } catch (reason: unknown) {
          const message = reason instanceof Error ? reason.message : String(reason);
          // Отказ движка — не «модель промолчала»: очередь иначе выдумает тупик.
          if (!isEngineDown(message)) {
            answer = null;
          } else {
            const key = `queue:${origin}`;
            if (engineAttemptRef.current === key) {
              why = voice.engineDown;
              continue;
            }
            engineAttemptRef.current = key;
            setEnginePrompt(query);
            setEngineGap(null);
            setEngineBusy(true);
            setThinkError(null);
            speak(voice.engineStarting);
            const outcome = await startInstalledEngineRef.current();
            setEngineBusy(false);
            if (queueStopRef.current) break;
            if (outcome.kind === "started") {
              setEnginePrompt(null);
              setEngineGap(null);
              try {
                answer = await think(query, null);
              } catch (again: unknown) {
                const againMessage = again instanceof Error ? again.message : String(again);
                why = isEngineDown(againMessage)
                  ? voice.engineDown
                  : `модель не сказала, что делать дальше по цели «${origin}»: новых дел не выдумываю`;
                continue;
              }
            } else if (outcome.kind === "missing") {
              setEngineGap("files");
              setEnginePrompt(query);
              why = voice.engineFilesMissing;
              continue;
            } else if (outcome.kind === "failed") {
              setEngineGap("failed");
              setEnginePrompt(query);
              const note = voice.engineStartFailed(outcome.note);
              setThinkError(note);
              why = note;
              continue;
            } else {
              setEngineGap("manual");
              setEnginePrompt(query);
              setThinkError(voice.engineDown);
              why = voice.engineDown;
              continue;
            }
          }
        }
        // Пока модель думала, человек мог сказать «стоп» — тогда новые дела не берём.
        if (queueStopRef.current) break;

        if (!answer?.proposal) {
          why = `модель не сказала, что делать дальше по цели «${origin}»: новых дел не выдумываю`;
          continue;
        }

        if (!("Next" in answer.proposal)) {
          // Модель ответила чем-то другим (вопросом, отказом, обучением) — это не
          // продолжение, и выдавать его за дело нельзя. Говорим её словами.
          why = `по цели «${origin}» модель ответила не продолжением: ${describeThought(answer)}`;
          continue;
        }

        const next = answer.proposal.Next;
        if (next.done) {
          // Это слова модели, а не доказательство: новые дела не берём, но и не врём,
          // будто цель закрыта. Рядом показываем экран — не как проверку, а как взгляд:
          // сравнивать и решать всё равно человеку.
          void uiDump(SCREEN_NODES)
            .then((dump) => {
              setScreen(dump);
              setScreenError(null);
            })
            .catch((reason: unknown) => {
              setScreen(null);
              setScreenError(reason instanceof Error ? reason.message : String(reason));
            });

          why =
            `модель считает, что цель «${origin}» закрыта${next.why ? ` (${next.why})` : ""}: ` +
            "новых дел по ней не беру. Ниже — что видно на экране сейчас; проверить можете только вы";
          continue;
        }

        const deeds = next.deeds.slice(
          0,
          Math.max(0, hourLeft(hourRef.current, Date.now())),
        );
        if (deeds.length === 0) {
          why = `потолок ${DEEDS_PER_HOUR} дел в час выбран: продолжение — после него`;
          continue;
        }

        const stamp = Date.now();
        mine((current) => {
          let updated = current;
          deeds.forEach((deed, index) => {
            updated = add(updated, deed, `n${stamp}${index}`, origin);
          });
          return updated;
        });
        added += deeds.length;
      }

      return { added, why };
    };

    try {
      for (;;) {
        // Правки с экрана — тоже очередь: убранное не запускаем, возвращённое видим.
        items = queueRef.current;
        if (queueStopRef.current) {
          setQueueIdle("остановлено вами: начатое доведено, остальное не начиналось");
          break;
        }

        // Экранность дела узнаётся только планом: пока план не собран, флаг неизвестен.
        const unknown = items.filter(
          (item) => item.state === "waiting" && item.touchesScreen === undefined,
        );
        for (const item of unknown.slice(0, 3)) {
          const check = await draftPlan(item.goal).catch(() => null);
          if (queueStopRef.current) break;
          plans.set(item.id, check);
          mine((current) => markScreen(current, item.id, usesScreen(check)));
        }
        if (queueStopRef.current) continue;

        const machine = await Promise.resolve(machineState()).catch(() => null);
        if (queueStopRef.current) continue;
        mayStartRef.current = machine?.budget.may_start ?? true;
        const decision = pick(
          items,
          {
            parallel: machine?.budget.parallel ?? 1,
            mayStart: machine?.budget.may_start ?? true,
            // Без измерения «ушёл» не подтверждено: сам идти не начинаю.
            away: machine?.budget.mode === "away",
          },
          // Потолок в час — общий счёт на всю очередь, а не на каждую цель свой.
          hourRef.current,
          Date.now(),
        );

        for (const index of decision.indices) {
          const item = items[index];
          if (!item || item.state !== "waiting") continue;
          launch(item);
        }

        if (decision.indices.length > 0) continue;

        if (inFlight.size > 0) {
          // Ждём, пока освободится дело или место в бюджете: иначе очередь встанет навсегда.
          await Promise.race([...inFlight.values()]);
          continue;
        }

        // Ждущее дело, которое не начинается, — это причина машины или человека, а не
        // повод придумывать новые: так и говорим, чья это причина.
        const waiting = items.some((item) => item.state === "waiting");
        if (waiting) {
          setQueueIdle(decision.reason);
          break;
        }

        // Дела кончились, а цели могли остаться. Спрашиваем модель про следующие дела —
        // это и есть «не останавливаться, пока не скажут стоп», но со счётом в руках.
        const more = await continueGoals();
        if (more.added > 0) continue;

        setQueueIdle(more.why ?? decision.reason);
        break;
      }
    } finally {
      // Начатое доводим до конца, даже если человек сказал «стоп»: бросить на середине
      // значит оставить чужое окно в непонятном состоянии.
      await Promise.all([...inFlight.values()].map((task) => task.catch(() => undefined)));
      queueRunningRef.current = false;
      setQueueOn(false);
    }
  }, []);

  const stopQueue = useCallback(() => {
    queueStopRef.current = true;
    const stopped = stopRemaining(queueRef.current);
    queueRef.current = stopped;
    setQueue(stopped);
  }, []);

  /**
   * «Стоп» — слово или кнопка. Новая задача из этого слова не делается.
   * Начатый шаг просим бросить; уже сделанное не откатываем.
   */
  const halt = useCallback(
    (phrase: string) => {
      executeRequestRef.current += 1;
      thoughtRequestRef.current += 1;
      promptRequestRef.current += 1;
      searchRequestRef.current += 1;
      stopQueue();
      setBusy(false);
      setRunning(false);
      setThinking(false);
      setEngineBusy(false);
      setAlways(false);
      lastTaskRef.current = null;
      // Стоп снимает и «какой вопрос слушаем»: иначе следующая фраза уходит в поле
      // вопроса, которого больше нет, и пропадает вместо новой задачи.
      setAnswerTarget(null);
      setDraft(null);
      setAnswers({});
      answersRef.current = {};
      setRemembered([]);
      setApproved([]);
      stopSpeaking();
      micStopRef.current();
      void cancelTool().catch(() => undefined);
      const heard = voice.stopHeard;
      setSpoken(speak(heard) ? voice.said(heard) : heard);
      const shown = phrase.trim();
      if (shown.length > 0) setText(shown);
    },
    [stopQueue],
  );

  /**
   * Остановить одну цель, не трогая остальные.
   *
   * Общее «стоп» остаётся для всего сразу; это — для одной работы. Начатое доводится до
   * шага, где можно бросить: останавливается только то, что ещё не начиналось. Метка цели
   * живёт и после того, как дела кончились: иначе очередь спросит модель про следующие,
   * и «стоп» окажется советом, а не остановкой.
   */
  const stopOneGoal = useCallback((origin: string) => {
    stoppedGoalsRef.current.add(origin);
    setStoppedGoals([...stoppedGoalsRef.current]);

    const next = stopGoal(queueRef.current, origin);
    queueRef.current = next;
    setQueue(next);
    setQueueIdle(`цель «${origin}» остановлена вами — новых дел по ней не беру`);
  }, []);

  /**
   * Померить машину. Это совет самому себе, а не приказ человеку: рядом с числом всегда
   * стоит причина, иначе «умное» распределение нельзя ни объяснить, ни проверить.
   */
  /**
   * Сказать, ухожу я или работаю.
   *
   * Это слово, а не запуск: очередь всё равно начинается своей кнопкой, и ни одно действие
   * от этого щелчка не выполняется. Зато таймер больше не решает за человека — он ошибается
   * в обе стороны, а слово — нет.
   */
  const sayPresence = useCallback(async (said: Presence | null) => {
    setMachineBusy(true);
    try {
      setMachine(await declarePresence(said));
      setPresenceError(null);
    } catch (reason: unknown) {
      setPresenceError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setMachineBusy(false);
    }
  }, []);

  const measureMachine = useCallback(async () => {
    setMachineBusy(true);
    try {
      setMachine(await machineState());
      setMachineError(null);
    } catch (reason: unknown) {
      setMachine(null);
      setMachineError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setMachineBusy(false);
    }
  }, []);

  const readScreen = useCallback(async (): Promise<string | null> => {
    setScreenBusy(true);
    try {
      const dump = await uiDump(SCREEN_NODES);
      setScreen(dump);
      setScreenError(null);
      return dump.text.trim().length > 0 ? dump.text : null;
    } catch (reason: unknown) {
      setScreen(null);
      setScreenError(reason instanceof Error ? reason.message : String(reason));
      return null;
    } finally {
      setScreenBusy(false);
    }
  }, []);

  /**
   * Нажать элемент. Делается в два шага: сначала «нажать „Войти“?» с видом элемента,
   * потом само нажатие. Один шаг был бы быстрее и ровно тем, чего не должно быть:
   * помощник, который нажимает по своему выбору.
   */
  /**
   * Ввести текст в поле. Тоже в два шага: «ввести „Иван“ в „Логин“?» и «Да, ввести».
   *
   * Текст в поле — это не нажатие: он остаётся в чужом окне и может уйти дальше сам.
   * Поэтому и спрашиваем, и потом читаем обратно то, что в поле оказалось.
   */
  const typeInto = useCallback(
    async (name: string, text: string) => {
      setTypeError(null);
      setTyped(null);
      try {
        const result = await uiType(name, text, true);
        setTyped(result);
        // Поле могло измениться (маска, проверка) — перечитываем экран целиком.
        void readScreen();
      } catch (reason: unknown) {
        setTypeError(reason instanceof Error ? reason.message : String(reason));
      } finally {
        setTyping(null);
      }
    },
    [readScreen],
  );

  const press = useCallback(async (name: string) => {
    setPressError(null);
    setPressResult(null);
    try {
      const result = await uiPress(name, true);
      setPressResult(result);
      // Экран после нажатия читаем заново: человеку нужно увидеть новое состояние.
      void readScreen();
    } catch (reason: unknown) {
      setPressError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setPressing(null);
    }
  }, [readScreen]);

  const acceptModelPlan = (check: PlanCheck) => {
    setDraft(check);
    setAnswers({});
    setRemembered([]);
    setApproved([]);
    setReport(null);
    if (phraseIsEnough(check)) {
      setSpoken(voice.autoRun);
      speak(voice.autoRun);
      runCheckedRef.current(check);
      return;
    }
    const phrase = `${voice.thinkPlanReady(check.plan?.steps.length ?? 0)}. ${voice.thinkNotExecuted}`;
    setSpoken(speak(phrase) ? voice.said(phrase) : voice.silent);
  };

  const search = useCallback((phrase: string) => {
    executeRequestRef.current += 1;
    thoughtRequestRef.current += 1;
    promptRequestRef.current += 1;
    const query = phrase.trim();
    if (isSpokenStop(query)) {
      halt(query);
      return;
    }
    const request = ++searchRequestRef.current;
    const pending = draftRef.current;
    // «Да» на уже показанный план — отдельное слово, а не новая задача.
    if (query.length > 0 && pending && isSpokenConsent(query) && !runningRef.current) {
      setText(query);
      setBusy(false);
      setThinkError(null);
      setEnginePrompt(null);
      setEngineGap(null);
      if (!consentCanRun(pending)) {
        const heard = voice.consentNotEnough;
        setSpoken(speak(heard) ? voice.said(heard) : heard);
        return;
      }
      const positions = consentPositions(pending);
      setApproved(positions);
      const heard = voice.consentHeard;
      setSpoken(speak(heard) ? voice.said(heard) : heard);
      executeRef.current(positions);
      return;
    }
    // Пока план ждёт уточнение, фраза в этом же поле — ответ, не новый поиск.
    // «Да» сюда не доходит: оно уже разобрано как разрешение и вопрос не закрыло.
    if (pending && pending.questions.length > 0 && query.length === 0) {
      setBusy(false);
      return;
    }
    // Все поля уже заполнены — это не ответ, а новая задача: молча съесть фразу
    // значило бы ответить не на то, что человек сказал.
    const open = pending ? firstOpenQuestion(pending.questions, answersRef.current) : null;
    if (pending && pending.questions.length > 0 && open && phraseIsAnswer(query)) {
      const field = questionField(open);
      const nextAnswers = { ...answersRef.current, [field]: query };
      answersRef.current = nextAnswers;
      setAnswers(nextAnswers);
      setApproved((current) => current.filter((position) => position !== open.position));
      setRemembered((current) => current.filter((name) => name !== field));
      const heard = voice.answerTaken(query);
      setSpoken(speak(heard) ? voice.said(heard) : heard);
      const following = firstOpenQuestion(pending.questions, nextAnswers);
      if (following) {
        speak(voice.askSpoken(following.label));
        return;
      }
      executeRef.current(undefined, nextAnswers);
      return;
    }
    const asked = followUpQuery(lastTaskRef.current, query);
    if (isFollowUp(query)) {
      if (asked !== query) {
        setText(asked);
        const heard = voice.followHeard(lastTaskRef.current ?? "");
        setSpoken(speak(heard) ? voice.said(heard) : heard);
      }
    } else if (query.length > 0) {
      lastTaskRef.current = query;
    }
    if (
      engineAttemptRef.current &&
      engineAttemptRef.current !== query &&
      !engineAttemptRef.current.startsWith("queue:")
    ) {
      engineAttemptRef.current = null;
    }
    setDraft(null);
    setAnswers({});
    setRemembered([]);
    setApproved([]);
    setReport(null);
    setThought(null);
    setThinking(false);
    setEnginePrompt(null);
    setEngineGap(null);
    if (query.length === 0) {
      setItems(null);
      setBusy(false);
      return;
    }

    setBusy(true);
    setError(null);
    planFor(asked, LIMIT)
      .then(async (raw) => {
        if (request !== searchRequestRef.current) return;
        // Сначала то, что про программу перед человеком. Решения и опасность не меняются.
        const ranked = rankForWindow(raw, frontRef.current);
        const found = ranked.items;
        setUsedAround(ranked.moved > 0 && frontRef.current ? aroundPhrase(frontRef.current) : null);
        setItems(found);
        setReport(null);
        setApproved([]);

        // Черновик плана: что именно приложение собирается сделать. Спрашиваем его
        // сразу — человек сказал задачу, и ответ «могу сделать вот это» полезнее списка.
        const proposal = await draftPlan(asked).catch(() => null);
        if (request !== searchRequestRef.current) return;
        setDraft(proposal);
        setLearning(null);
        // Чтение без вопросов политика уже разрешила: отдельная кнопка здесь была бы
        // вторым «да» на то, что человек только что сказал. Запись и внешнее — нет.
        if (proposal && phraseIsEnough(proposal)) {
          setSpoken(voice.autoRun);
          speak(voice.autoRun);
          runCheckedRef.current(proposal);
          return;
        }

        // Слова не совпали — не тупик: спрашиваем модель. Она нужна ровно здесь, где
        // поиск по буквам бессилен («сделай потише» → «убавить громкость»). Молча
        // превращать такую фразу в «не умею» было бы обиднее всего.
        let answered: Thought | null = null;
        if (!proposal) {
          const window = frontRef.current;
          // Экран читаем до вопроса: без него у «нажми эту кнопку» нет адресата.
          const screenText = window ? await readScreen() : null;
          if (request !== searchRequestRef.current) return;
          try {
            answered = await think(
              asked,
              window
                ? { title: window.title, process: window.process, screen: screenText }
                : null,
            );
          } catch (reason: unknown) {
            if (request !== searchRequestRef.current) return;
            const message = reason instanceof Error ? reason.message : String(reason);
            // Только «движок не запущен» — не тупик обучения: умения хватает, некому разобрать.
            // Другой отказ (в браузере модели нет) по-прежнему идёт в запись «не умею».
            if (isEngineDown(message)) {
              await wakeEngine(
                query,
                () => request === searchRequestRef.current,
                () => search(query),
              );
              return;
            }
            setThinkError(message);
            answered = null;
          }
          if (request !== searchRequestRef.current) return;
          engineAttemptRef.current = null;
          setEnginePrompt(null);
          setEngineGap(null);
          setThought(answered);

          // План от модели — обычный план: политика, вопросы и подтверждение те же.
          if (answered?.plan) {
            acceptModelPlan(answered.plan);
            return;
          }
        }

        // Не умеем — не тупик: записываем задачу на обучение и говорим, что для неё
        // нужно. Учиться приложение должно уметь само, но молча — нельзя.
        const promise =
          proposal || answered?.plan
            ? null
            : answered?.learning ?? (await requestLearning(asked).catch(() => null));
        if (request !== searchRequestRef.current) return;
        if (promise) {
          setLearning(promise);
          speak(
            answered?.learning
              ? voice.thinkLearnRecorded(asked, promise.example)
              : voice.learnSpoken(promise.example),
          );
          return;
        }

        // Данных не хватает — спрашиваем вслух, а не показываем красную строку.
        // Спрашиваем только то, чего не знаем: вопрос о забытом — это не забота.
        const first = proposal?.questions.find(
          (question) => !knownFacts.some((fact) => fact.key === factKey(question)),
        );
        if (first) speak(voice.askSpoken(first.label));
        // Отвечаем вслух: человек, который говорит, не смотрит в экран.
        const phraseOut = answered?.proposal
          ? describeThought(answered)
          : !proposal
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
      .catch((reason: unknown) => {
        if (request === searchRequestRef.current) {
          setError(reason instanceof Error ? reason.message : String(reason));
        }
      })
      .finally(() => {
        if (request === searchRequestRef.current) setBusy(false);
      });
  }, [knownFacts, wakeEngine, halt]);

  // Свой движок есть — пишем звук и отдаём ему: это единственный путь, где звук не
  // покидает компьютер. Нет — слушаем тем, что даёт система, и говорим об этом выше.
  const localEngine =
    speech && speech.found && speech.model
      ? { transcribe: (wav: Uint8Array, signal?: AbortSignal) => transcribeLocal(Array.from(wav), signal) }
      : null;

  // Колбэк микрофона живёт дольше одного рендера, поэтому «какой вопрос слушаем» читаем
  // из ссылки: иначе в замыкании осталось бы старое значение.
  const answerTargetRef = useRef(answerTarget);
  answerTargetRef.current = answerTarget;

  const mic = useVoice({
    local: localEngine,
    always,
    enabled: !micCheckBusy && (localEngine !== null || systemSpeechConsent),
    disabledReason: micCheckBusy ? micTestText.busyReason : voice.systemSpeechRequired,
    onText: (heard) => {
      setVoiceError(null);
      if (isSpokenStop(heard)) {
        halt(heard);
        return;
      }
      const target = answerTargetRef.current;

      // «Да» и «ещё» — не значение поля, даже если микрофон зажали у самого вопроса:
      // разрешение и продолжение разбираются там же, где всегда, а не становятся путём.
      if (target && !phraseIsAnswer(heard)) {
        setAnswerTarget(null);
        setText(heard);
        search(heard);
        return;
      }

      if (target) {
        const value = heard.trim();
        setAnswerTarget(null);
        executeRequestRef.current += 1;
        setAnswers((current) => ({ ...current, [`${target.position}:${target.name}`]: value }));
        setApproved((current) => current.filter((position) => position !== target.position));
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
  micStopRef.current = () => {
    mic.stop();
  };

  const waitingForConfirmation =
    draft?.gates.some(
      (gate) => gate.decision === "confirm" && !approved.includes(gate.position),
    ) === true;
  const trayVoiceState = voiceError
    ? "error"
    : mic.processing
      ? "working"
      : mic.listening
        ? "listening"
        : running
          ? "executing"
          : waitingForConfirmation
            ? "awaiting-confirmation"
            : busy || thinking
              ? "working"
              : "ready";
  useEffect(() => {
    void setVoiceTrayStatus(trayVoiceState).catch(() => {
      // В браузере и при отсутствующей иконке трея UI продолжает работать.
    });
  }, [trayVoiceState]);

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

        executeRequestRef.current += 1;
        setAnswers((current) => {
          const safeSeeded = Object.fromEntries(
            Object.entries(seeded.answers).filter(([field]) =>
              seeded.remembered.includes(field) && (current[field] ?? "").trim().length === 0,
            ),
          );
          return { ...current, ...safeSeeded };
        });
        const seededPositions = new Set(
          seeded.remembered.map((field) => Number(field.split(":", 1)[0])),
        );
        setApproved((current) => current.filter((position) => !seededPositions.has(position)));
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

  // Стабильная подписка: если переподписываться на `mic.listening`, короткое нажатие
  // может попасть в окно между down и up, и отпускание потеряется. События читают
  // актуальное состояние из ref, сама системная подписка живёт до размонтирования Voice.
  const globalTalkState = useRef({
    always,
    listening: mic.listening,
    start: mic.start,
    stop: mic.stop,
    cancel: mic.cancel,
  });
  globalTalkState.current = {
    always,
    listening: mic.listening,
    start: mic.start,
    stop: mic.stop,
    cancel: mic.cancel,
  };

  useEffect(() => {
    let off: (() => void) | null = null;
    let alive = true;

    subscribeGlobalTalk({
      down: () => {
        const state = globalTalkState.current;
        if (state.always && state.listening) state.stop();
        else state.start();
      },
      up: () => {
        const state = globalTalkState.current;
        if (!state.always) state.stop();
      },
      stop: () => {
        const state = globalTalkState.current;
        state.cancel();
        state.stop();
        void setVoiceTrayStatus("ready").catch(() => undefined);
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
  }, []);

  // Чем распознаём — видно сразу и после установки на карточке: экран остаётся
  // смонтированным, поэтому одного чтения при первом показе мало. Поздний ответ
  // не затирает более новый статус.
  const reloadSpeech = useCallback(() => {
    const request = ++speechRequest.current;
    speechStatus()
      .then((value) => {
        if (aliveRef.current && request === speechRequest.current) setSpeech(value);
      })
      .catch(() => {
        if (aliveRef.current && request === speechRequest.current) setSpeech(null);
      });
  }, []);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);
  useEffect(() => {
    reloadSpeech();

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
  }, [reloadSpeech]);

  useEffect(() => {
    if (!mic.listening) {
      setSeconds(0);
      return;
    }
    const timer = setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [mic.listening]);

  runCheckedRef.current = (check) => {
    const guard = executeRequestRef.current;
    const request = ++planRunRef.current;
    const plan = check.plan;
    if (!plan || guard !== executeRequestRef.current) return;
    setRunning(true);
    setError(null);
    setDraft(check);
    void runPlan(JSON.stringify(plan), [])
      .then((result) => {
        if (request !== planRunRef.current) return;
        setReport(result);
        const phrase = result.stopped
          ? voice.draftSpokenStopped(result.stopped)
          : voice.planSpeech(result.steps.length);
        setSpoken(speak(phrase) ? voice.said(phrase) : voice.silent);
      })
      .catch((reason: unknown) => {
        if (request !== planRunRef.current) return;
        const message = reason instanceof Error ? reason.message : String(reason);
        setError(message);
        speak(voice.draftSpokenStopped(message));
      })
      .finally(() => {
        if (request === planRunRef.current) setRunning(false);
      });
  };

  const execute = useCallback((granted?: number[], answerOverride?: Record<string, string>) => {
    const allowed = Array.isArray(granted) ? granted : approved;
    const guard = ++executeRequestRef.current;
    const request = ++planRunRef.current;
    const plan = draft?.plan;
    if (!plan) return;
    const usedAnswers = answerOverride ?? answers;

    const asked = draft.questions.map((question) => ({
      position: question.position,
      name: question.name,
      value: usedAnswers[`${question.position}:${question.name}`] ?? "",
    }));

    // Сказал один раз — помню. Запоминаем само сказанное, а не «что сработало»:
    // неудачный запуск не должен подтверждать ответ.
    const toRemember = factsToRemember(draft.questions, usedAnswers);
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
            if (guard === executeRequestRef.current) {
              const message = reason instanceof Error ? reason.message : String(reason);
              setError(message);
            }
            return null;
          })
        : Promise.resolve(draft);

    prepared
      .then((checked) => {
        // Правка любого поля после нажатия отменяет этот запуск: уходит и поздний план,
        // и запуск уже перепроверенного.
        const edited = guard !== executeRequestRef.current;
        if (!checked || edited) return null;
        if (request !== planRunRef.current) return null;
        setDraft(checked);
        if (checked.problems.length > 0) {
          const message = checked.problems[0]?.problem ?? voice.loadError;
          setError(message);
          speak(voice.askSpoken(message));
          return null;
        }
        if (asked.length > 0 && checked.gates.some((gate) => gate.decision === "confirm")) {
          // Ответ мог изменить параметры шага: покажем уже заполненный план и попросим
          // согласие заново, а не применим подтверждение к старой версии.
          setApproved([]);
          setSpoken(voice.draftChangedReview);
          speak(voice.draftChangedReview);
          return null;
        }
        return runPlan(JSON.stringify(checked.plan), allowed);
      })
      .then((result) => {
        // Устаревший путь не докладывает ни успех, ни отказ: «стоп» или правка поля
        // уже сказали человеку своё, и поздний голос был бы вторым ответом.
        if (!result || request !== planRunRef.current || guard !== executeRequestRef.current) {
          return;
        }
        setReport(result);
        const phrase = result.stopped
          ? voice.draftSpokenStopped(result.stopped)
          : voice.planSpeech(result.steps.length);
        setSpoken(speak(phrase) ? voice.said(phrase) : voice.silent);
      })
      .catch((reason: unknown) => {
        if (request !== planRunRef.current || guard !== executeRequestRef.current) return;
        const message = reason instanceof Error ? reason.message : String(reason);
        setError(message);
        speak(voice.draftSpokenStopped(message));
      })
      .finally(() => {
        // «выполняю…» снимает только последний запуск: остановленный вручную уже
        // снял его через halt, а отменённая правкой перепроверка не должна тянуть
        // чужую надпись дольше, чем живёт её поле.
        if (request === planRunRef.current) setRunning(false);
      });
  }, [draft, approved, answers]);
  executeRef.current = execute;

  askModelRef.current = (requestedText: string) => {
    const request = ++thoughtRequestRef.current;
    const around = front;
    setThinking(true);
    setThinkError(null);
    setThought(null);
    readScreen()
      .then((screenText) => {
        if (request !== thoughtRequestRef.current) return null;
        return think(
          requestedText,
          around ? { title: around.title, process: around.process, screen: screenText } : null,
        );
      })
      .then((answer) => {
        if (!answer || request !== thoughtRequestRef.current) return;
        engineAttemptRef.current = null;
        setEnginePrompt(null);
        setEngineGap(null);
        setThought(answer);
        if (answer.learning) setLearning(answer.learning);
        if (answer.plan) acceptModelPlan(answer.plan);
        const phrase = answer.plan
          ? `${describeThought(answer)}. ${voice.thinkPlanReady(answer.plan.plan?.steps.length ?? 0)}`
          : describeThought(answer);
        speak(phrase);
      })
      .catch((reason: unknown) => {
        if (request !== thoughtRequestRef.current) return;
        const message = reason instanceof Error ? reason.message : String(reason);
        if (isEngineDown(message)) {
          void wakeEngine(
            requestedText,
            () => request === thoughtRequestRef.current,
            () => askModelRef.current(requestedText),
          );
          return;
        }
        setThinkError(message);
        setEnginePrompt(null);
      })
      .finally(() => {
        if (request === thoughtRequestRef.current) setThinking(false);
      });
  };

  // Цели, которые человек сам разложил на дела: по ним и показывается счёт.
  const goals = [
    ...new Set(
      queue
        .map((item) => item.origin)
        .filter((origin): origin is string => typeof origin === "string" && origin.length > 0),
    ),
  ];

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

      <ReadinessCard
        active={active}
        onRefresh={reloadSpeech}
        onToModels={onOpen ? () => onOpen("models") : undefined}
      />

      {mic.listening && !always ? (
        <Text className={styles.note}>{voice.pauseSend}</Text>
      ) : null}

      {mic.processing ? <Text role="status" className={styles.note}>{voice.asrProcessing}</Text> : null}

      {(mic.listening && !always) || mic.processing ? (
        <Button
          appearance="subtle"
          onClick={() => {
            setCancelledAsr(mic.processing);
            mic.cancel();
            setCancelled(true);
          }}
        >
          {mic.processing ? voice.asrCancel : voice.cancelShow}
        </Button>
      ) : null}

      {cancelled ? <Text className={styles.note}>{cancelledAsr ? voice.asrCancelled : voice.cancelled}</Text> : null}

      <Button
        className={mic.listening ? styles.micListening : styles.mic}
        appearance="primary"
        icon={<MicRegular />}
        aria-label={always ? voice.always : voice.hold}
        onPointerDown={(event) => {
          event.preventDefault();
          setCancelled(false);
          // Новая попытка — новая ошибка: старая не должна пугать до разбора.
          setVoiceError(null);
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
        {mic.processing
          ? voice.asrProcessingShort
          : always
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
        <Text className={styles.note}>
          {localEngine ? voice.alwaysNoMic : voice.alwaysNoEngine}
        </Text>
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
      <Text className={styles.note}>{localEngine ? voice.privacyLocal : voice.privacy}</Text>
      {!localEngine ? (
        <>
          <label>
            <input
              type="checkbox"
              checked={systemSpeechConsent}
              onChange={(event) => setSystemSpeechConsent(event.target.checked)}
            />{" "}
            {voice.systemSpeechConsent}
          </label>
          <Text className={styles.note}>{voice.systemSpeechConsentHint}</Text>
        </>
      ) : null}
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

      <MicrophoneCheck active={active} disabled={mic.listening || mic.processing} onBusyChange={setMicCheckBusy} />

      {voiceError ? (
        <div className={styles.bar}>
          <Text className={styles.error}>{voiceError}</Text>
          {/* Ошибка — про попытку, а не про приговор: убираем её, не дожидаясь,
              когда человек сам догадается, что старое уже неправда. */}
          <Button size="small" appearance="subtle" onClick={() => setVoiceError(null)}>
            {voice.errorDismiss}
          </Button>
        </div>
      ) : null}

      {/*
        Слово человека о себе. Стоит выше поля задачи и не спрятано за измерениями:
        чтобы сказать «я ухожу», не нужно сначала что-то напечатать.
      */}
      <div className={styles.bar}>
        <Button
          size="small"
          appearance="subtle"
          disabled={machineBusy}
          onClick={() => {
            void sayPresence("away");
          }}
        >
          {voice.presenceAway}
        </Button>
        <Button
          size="small"
          appearance="subtle"
          disabled={machineBusy}
          onClick={() => {
            void sayPresence("near");
          }}
        >
          {voice.presenceNear}
        </Button>
        <Button
          size="small"
          appearance="subtle"
          disabled={machineBusy || !machine?.declared}
          onClick={() => {
            void sayPresence(null);
          }}
        >
          {voice.presenceClear}
        </Button>
        <Text className={styles.note}>
          {machine?.declared ? voice.presenceSaid(machine.declared) : voice.presenceHint}
        </Text>
      </div>
      {presenceError ? (
        <Text className={styles.error}>{voice.presenceError(presenceError)}</Text>
      ) : null}

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
          placeholder={
            draft && draft.questions.length > 0 ? voice.answerPlaceholder : voice.heardPlaceholder
          }
          onChange={(_, data) => {
            // Набор «да» — разрешение. Пока вопрос открыт, набор — ответ, не новая задача.
            const pendingDraft = draftRef.current;
            if (
              pendingDraft &&
              (keepsPendingPlan(data.value) || pendingDraft.questions.length > 0)
            ) {
              setText(data.value);
              return;
            }
            thoughtRequestRef.current += 1;
            promptRequestRef.current += 1;
            setThinking(false);
            executeRequestRef.current += 1;
            setText(data.value);
            setDraft(null);
            setAnswers({});
            setRemembered([]);
            setApproved([]);
            setReport(null);
            setPromptText(null);
            setPromptError(null);
          }}
        />
        <Button type="submit" disabled={busy}>
          {draft && draft.questions.length > 0 ? voice.answerSubmit : voice.find}
        </Button>
      </form>

      {text.trim().length > 0 ? (
        <div>
          <Button
            size="small"
            appearance="subtle"
            onClick={() => {
              const request = ++promptRequestRef.current;
              if (promptText !== null) {
                setPromptText(null);
                return;
              }
              const requestedText = text.trim();
              modelPrompt(requestedText, front ? { title: front.title, process: front.process } : null)
                .then((value) => {
                  if (request !== promptRequestRef.current) return;
                  setPromptText(value);
                  setPromptError(null);
                })
                .catch((reason: unknown) => {
                  if (request !== promptRequestRef.current) return;
                  setPromptText(null);
                  setPromptError(reason instanceof Error ? reason.message : String(reason));
                });
            }}
          >
            {promptText === null ? voice.modelPromptShow : voice.modelPromptHide}
          </Button>
          {promptError ? (
            <Text className={styles.note}>{`${voice.modelPromptNone}: ${promptError}`}</Text>
          ) : null}
          {promptText !== null ? (
            <>
              <Text className={styles.note}>{voice.modelPromptTitle}</Text>
              <pre className={styles.prompt}>{promptText}</pre>
            </>
          ) : null}

          <Button
            size="small"
            appearance="subtle"
            disabled={thinking}
            onClick={() => {
              askModelRef.current(text.trim());
            }}
          >
            {thinking ? voice.thinkThinking : voice.thinkShow}
          </Button>
          <Button
            size="small"
            appearance="subtle"
            disabled={screenBusy}
            onClick={() => {
              void readScreen();
            }}
          >
            {screenBusy ? voice.screenReading : voice.screenShow}
          </Button>
          <Button
            size="small"
            appearance="subtle"
            disabled={machineBusy}
            onClick={() => {
              void measureMachine();
            }}
          >
            {machineBusy ? voice.machineMeasuring : voice.machineMeasure}
          </Button>
          <Button
            size="small"
            appearance="subtle"
            onClick={() => {
              const id = `q${Date.now()}${Math.random().toString(16).slice(2, 6)}`;
              const updated = add(queueRef.current, text, id);
              queueRef.current = updated;
              setQueue(updated);
            }}
          >
            {voice.queueAdd}
          </Button>
          <Button
            size="small"
            appearance="subtle"
            disabled={queueOn || summary(queue).waiting === 0}
            onClick={() => {
              void startQueue();
            }}
          >
            {voice.queueRun}
          </Button>
          <Button
            size="small"
            appearance="subtle"
            disabled={!queueOn && summary(queue).waiting === 0 && !running && !busy && !thinking && !engineBusy}
            onClick={() => halt("стоп")}
          >
            {voice.queueStop}
          </Button>
          {thinkError && !enginePrompt ? (
            <Text className={styles.error}>{voice.thinkError(thinkError)}</Text>
          ) : null}
          {enginePrompt ? (
            <div className={styles.bar}>
              <Text className={styles.note}>
                {engineGap === "files"
                  ? voice.engineFilesMissing
                  : engineBusy
                    ? voice.engineStarting
                    : thinkError?.includes("нет модели")
                      ? voice.engineNoModel
                      : engineGap === "failed" && thinkError
                        ? thinkError
                        : voice.engineDown}
              </Text>
              {engineGap === "files" || engineBusy || thinkError?.includes("нет модели") ? null : (
                <Button
                  appearance="primary"
                  disabled={engineBusy}
                  onClick={() => {
                    const phrase = enginePrompt;
                    engineAttemptRef.current = phrase;
                    setEngineBusy(true);
                    setThinkError(null);
                    speak(voice.engineStarting);
                    void smokeCheck()
                      .then((result) => {
                        if (!result.ok) {
                          setEngineGap("failed");
                          setThinkError(voice.engineStartFailed(result.note));
                          return;
                        }
                        setEnginePrompt(null);
                        setEngineGap(null);
                        search(phrase);
                      })
                      .catch((reason: unknown) => {
                        setEngineGap("failed");
                        setThinkError(reason instanceof Error ? reason.message : String(reason));
                      })
                      .finally(() => setEngineBusy(false));
                  }}
                >
                  {engineBusy ? voice.engineStarting : voice.engineStartAndRetry}
                </Button>
              )}
            </div>
          ) : null}
          {thought?.proposal ? (
            <>
              <Text className={styles.spoken}>{describeThought(thought)}</Text>
              {thought.plan && phraseIsEnough(thought.plan) ? null : (
                <Text className={styles.note}>{voice.thinkNotExecuted}</Text>
              )}
              {"Split" in thought.proposal
                ? thought.proposal.Split.deeds.map((deed, index) => (
                    <Text key={`deed-${index}`} className={styles.note}>
                      {voice.splitDeed(index + 1, deed)}
                    </Text>
                  ))
                : null}
              {"Split" in thought.proposal ? (
                <Button
                  size="small"
                  // Дела ставятся в очередь, а не выполняются: очередь спросит своё.
                  onClick={() => {
                    if (!thought.proposal || !("Split" in thought.proposal)) return;
                    const split = thought.proposal.Split;
                    let next = queueRef.current;
                    const stamp = Date.now();
                    // Цель запоминается у каждого дела: по ней очередь поймёт, что
                    // продолжать, когда эти дела кончатся.
                    split.deeds.forEach((deed, index) => {
                      next = add(next, deed, `d${stamp}${index}`, split.goal);
                    });
                    queueRef.current = next;
                    setQueue(next);
                  }}
                >
                  {voice.splitQueue}
                </Button>
              ) : null}
              {"Chain" in thought.proposal
                ? thought.proposal.Chain.steps.map((step, index) => (
                    <Text key={`${step.registry}-${index}`} className={styles.note}>
                      {voice.thinkChainStep(index + 1, step.registry, step.why)}
                    </Text>
                  ))
                : null}
            </>
          ) : null}
          {thought && !thought.proposal ? (
            <>
              <Text className={styles.error}>{voice.thinkBroken(thought.problem ?? "")}</Text>
              <pre className={styles.prompt}>{thought.answer}</pre>
            </>
          ) : null}
        </div>
      ) : null}

      {queue.length > 0 || queueIdle ? (
        <div className={styles.section}>
          <Text className={styles.title}>{voice.queueTitle(summary(queue).waiting, summary(queue).done)}</Text>
          {goals.map((goal) => {
            const done = progress(queue, goal);
            const stopped = stoppedGoals.includes(goal);
            return (
              <div key={`goal-${goal}`} className={styles.bar}>
                <Text className={styles.note}>
                  {voice.queueGoalLine(done.goal, done.done, done.left, done.stuck)}
                </Text>
                {loopLines[goal] ? (
                  <Text className={styles.note}>{loopLines[goal]}</Text>
                ) : null}
                {stopped ? (
                  <Text className={styles.note}>{voice.queueGoalStopped}</Text>
                ) : (
                  <Button size="small" appearance="subtle" onClick={() => stopOneGoal(goal)}>
                    {voice.queueStopGoal}
                  </Button>
                )}
              </div>
            );
          })}
          <Text className={styles.note}>{voice.queueHour(hour.deeds, DEEDS_PER_HOUR)}</Text>
          {queueIdle ? <Text className={styles.note}>{voice.queueIdle(queueIdle)}</Text> : null}
          {queue.map((item) => (
            <div key={item.id} className={styles.bar}>
              <Text className={item.state === "held" ? styles.error : styles.note}>
                {voice.queueLine(item.goal, item.state, item.note)}
              </Text>
              {item.state === "held" ? (
                // «Нужно ваше слово» — это про этот экран, а не про память человека.
                // Забираем дело обратно в поле и разбираем заново, уже с его словом.
                <Button
                  size="small"
                  appearance="subtle"
                  onClick={() => {
                    const next = revive(queueRef.current, item.id);
                    queueRef.current = next;
                    setQueue(next);
                    setText(item.goal);
                    setSpoken(voice.queueRevived(item.goal));
                    setQueueIdle(null);
                  }}
                >
                  {voice.queueTake}
                </Button>
              ) : null}
              {item.state === "waiting" || item.state === "held" || item.state === "failed" ? (
                <Button
                  size="small"
                  appearance="subtle"
                  onClick={() => {
                    const next = remove(queueRef.current, item.id);
                    queueRef.current = next;
                    setQueue(next);
                  }}
                >
                  {voice.queueRemove}
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {machine || machineError ? (
        <div className={styles.section}>
          <Text className={styles.title}>{voice.machineTitle}</Text>
          {machine ? (
            <Text className={styles.note}>
              {voice.machineSummary(
                machine.budget.mode,
                machine.budget.parallel,
                machine.budget.reason,
              )}
            </Text>
          ) : null}
          {machine?.sample ? (
            <Text className={styles.note}>
              {voice.machineNumbers(
                machine.sample.cpu_percent,
                machine.sample.ram_free_mb,
                machine.sample.ram_total_mb,
                machine.sample.idle_seconds,
              )}
            </Text>
          ) : null}
          {machine && !machine.budget.may_start ? (
            <Text className={styles.error}>{voice.machineStop}</Text>
          ) : null}
          {machine ? <Text className={styles.note}>{machine.note}</Text> : null}
          {machineError ? (
            <Text className={styles.error}>{voice.machineError(machineError)}</Text>
          ) : null}
        </div>
      ) : null}

      {screen || screenError ? (
        <div className={styles.section}>
          <Text className={styles.title}>{voice.screenTitle}</Text>
          {screen ? <Text className={styles.note}>{screen.note}</Text> : null}
          {screen ? <pre className={styles.prompt}>{screen.text}</pre> : null}
          {screen
            ? screen.elements
                .filter((element) => element.actions.includes("invoke") && element.name.length > 0)
                .slice(0, 12)
                .map((element) => (
                  <div key={`${element.name}-${element.id}`} className={styles.bar}>
                    {pressing === element.name ? (
                      <>
                        <Text className={styles.note}>
                          {voice.pressConfirm(element.name, element.kind)}
                        </Text>
                        <Button size="small" onClick={() => void press(element.name)}>
                          {voice.pressYes}
                        </Button>
                        <Button size="small" appearance="subtle" onClick={() => setPressing(null)}>
                          {voice.pressNo}
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="small"
                        appearance="subtle"
                        onClick={() => {
                          setPressing(element.name);
                          setPressResult(null);
                          setPressError(null);
                        }}
                      >
                        {voice.pressShow(element.name)}
                      </Button>
                    )}
                  </div>
                ))
            : null}
          {screen
            ? screen.elements
                .filter((element) => element.actions.includes("value") && element.name.length > 0)
                .slice(0, 6)
                .map((element) => (
                  <div key={`field-${element.name}-${element.id}`} className={styles.bar}>
                    <Input
                      className={styles.input}
                      value={fields[element.name] ?? ""}
                      aria-label={voice.typeField(element.name)}
                      placeholder={voice.typePlaceholder(element.kind)}
                      onChange={(_, data) =>
                        setFields((current) => ({ ...current, [element.name]: data.value }))
                      }
                    />
                    {typing === element.name ? (
                      <>
                        <Text className={styles.note}>
                          {voice.typeConfirm(element.name, fields[element.name] ?? "")}
                        </Text>
                        <Button
                          size="small"
                          onClick={() => void typeInto(element.name, fields[element.name] ?? "")}
                        >
                          {voice.typeYes}
                        </Button>
                        <Button size="small" appearance="subtle" onClick={() => setTyping(null)}>
                          {voice.pressNo}
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="small"
                        appearance="subtle"
                        disabled={(fields[element.name] ?? "").trim().length === 0}
                        onClick={() => {
                          setTyping(element.name);
                          setTyped(null);
                          setTypeError(null);
                        }}
                      >
                        {voice.typeShow(element.name)}
                      </Button>
                    )}
                  </div>
                ))
            : null}
          {typed ? (
            <Text className={typed.verified ? styles.note : styles.error}>
              {voice.typeResult(typed.target.name, typed.read_back, typed.note)}
            </Text>
          ) : null}
          {typeError ? <Text className={styles.error}>{voice.typeError(typeError)}</Text> : null}
          {pressResult ? (
            <Text className={pressResult.changed ? styles.note : styles.error}>
              {voice.pressResult(pressResult.target.name, pressResult.changed, pressResult.note)}
            </Text>
          ) : null}
          {pressError ? (
            <Text className={styles.error}>{voice.pressError(pressError)}</Text>
          ) : null}
          {screenError ? (
            <Text className={styles.error}>{voice.screenError(screenError)}</Text>
          ) : null}
        </div>
      ) : null}

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
          <Text className={styles.note}>{`${voice.draftPreview}: ${draft.plan.goal}`}</Text>
          <ol className={styles.problems}>
            {draft.plan.steps.map((step, index) => (
              <li key={`${step.registry}-${index}`}>
                {`${index + 1}. ${step.registry} · ${describePlanParams(step.params)}${step.why ? ` · ${step.why}` : ""}`}
              </li>
            ))}
          </ol>
          <ul className={styles.problems}>
            {draft.gates.map((gate) => (
              <li key={gate.position}>
                <label>
                  {gate.decision === "confirm" ? (
                    <input
                      type="checkbox"
                      aria-label={voice.draftApprove(gate.position)}
                      checked={approved.includes(gate.position)}
                      onChange={(event) => {
                        executeRequestRef.current += 1;
                        setApproved((current) =>
                          event.target.checked
                            ? [...new Set([...current, gate.position])]
                            : current.filter((position) => position !== gate.position),
                        );
                      }}
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
                        executeRequestRef.current += 1;
                        setAnswers((current) => ({ ...current, [key]: data.value }));
                        setApproved((current) =>
                          current.filter((position) => position !== question.position),
                        );
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
                draft.gates.some(
                  (gate) => gate.decision === "confirm" && !approved.includes(gate.position),
                ) ||
                draft.questions.some(
                  (question) =>
                    (answers[`${question.position}:${question.name}`] ?? "").trim().length === 0,
                ) ||
                draft.problems.some(
                  (problem) =>
                    !(draft.questions.length > 0 && problem.problem.includes("не хватает данных")),
                )
              }
              onClick={() => execute()}
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
            {report?.sight ? (
              <>
                <Text className={styles.title}>{voice.sightTitle}</Text>
                <Text className={report.sight.changed ? styles.localReady : styles.note}>
                  {voice.sightNote(report.sight.note)}
                </Text>
                {report.sight.text ? (
                  <pre className={styles.prompt}>{report.sight.text}</pre>
                ) : null}
              </>
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

          <Button
            size="small"
            appearance="subtle"
            disabled={handBusy}
            onClick={() => {
              setHandBusy(true);
              setHandError(null);
              draftHand(learning.registry)
                .then((draft) => {
                  setHandDraft(draft);
                  speak(voice.thinkHandDraft(draft.goal));
                })
                .catch((reason: unknown) =>
                  setHandError(reason instanceof Error ? reason.message : String(reason)),
                )
                .finally(() => setHandBusy(false));
            }}
          >
            {voice.handTitle}
          </Button>

          {handError ? (
            <Text className={styles.error}>{voice.handFilter(handError)}</Text>
          ) : null}

          {handDraft ? (
            <>
              <Text weight="semibold">{`${voice.handTitle}: ${handDraft.goal}`}</Text>
              <Text className={styles.note}>{voice.handNever}</Text>
              <pre className={styles.prompt}>{handDraft.code}</pre>
              {handDraft.why.length > 0 ? (
                <Text className={styles.note}>{handDraft.why}</Text>
              ) : null}

              <Button
                size="small"
                appearance="subtle"
                disabled={trialBusy}
                onClick={() => {
                  setTrialBusy(true);
                  setTrial(null);
                  trialHand(handDraft.key)
                    .then((report) => {
                      setTrial(report);
                      speak(report.note);
                    })
                    .catch((reason: unknown) => {
                      const message = reason instanceof Error ? reason.message : String(reason);
                      setTrial(null);
                      setHandError(message);
                    })
                    .finally(() => setTrialBusy(false));
                }}
              >
                {trialBusy ? voice.trialRunning : voice.trialRun}
              </Button>

              {trial ? (
                <>
                  <Text weight="semibold">{trial.note}</Text>
                  <Text className={styles.note}>{voice.trialCell(trial.cell)}</Text>
                  <Text className={styles.note}>{voice.trialNotHand}</Text>
                  {trial.ran && trial.stdout.length > 0 ? (
                    <pre className={styles.prompt}>{trial.stdout}</pre>
                  ) : null}
                  {trial.ran && trial.stderr.length > 0 ? (
                    <pre className={styles.prompt}>{trial.stderr}</pre>
                  ) : null}
                  {!trial.ran ? (
                    <Text className={styles.error}>{voice.trialNotRan(trial.note)}</Text>
                  ) : null}

                  {/* Рукой черновик становится только по слову человека и только после пробы. */}
                  {trial.ok ? (
                    <Button
                      size="small"
                      appearance="subtle"
                      onClick={() =>
                        adoptHand(handDraft.key, handDraft.goal)
                          .then((hand) => {
                            setAdopted(hand);
                            speak(voice.adoptDone(hand.title));
                          })
                          .catch((reason: unknown) =>
                            setHandError(reason instanceof Error ? reason.message : String(reason)),
                          )
                      }
                    >
                      {voice.adoptShow}
                    </Button>
                  ) : null}

                  {adopted ? <Text className={styles.note}>{voice.adoptDone(adopted.title)}</Text> : null}
                </>
              ) : null}
            </>
          ) : null}
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
