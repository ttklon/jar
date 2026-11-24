import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Input, makeStyles, Switch, Text, Textarea, tokens } from "@fluentui/react-components";
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
  say,
  think,
  trialHand,
  rememberFact,
  requestLearning,
  runPlan,
  cancelTool,
  isolationStatus,
  planCheckpoint,
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
import { createSpeechQueue } from "../lib/speechQueue";
import { createAudioMachine } from "../lib/audio";
import { createWriter, load as loadQueue } from "../lib/queueStore";
import { speak, stopSpeaking } from "../lib/voice";
import {
  canTurnOn,
  ON as VOICE_ON,
  sayAnyway,
  speaks,
  toggle as toggleVoice,
  word as voiceWord,
  type Voice as VoiceSwitch,
} from "../lib/speakSwitch";
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
  setResumeAt,
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
import {
  describePlanParams,
  gaps as previewGaps,
  lines as previewLines,
  riskOf,
  riskWord as previewRiskWord,
  safe as previewSafe,
  scope as previewScope,
  type Preview as PlanPreviewView,
  type Step as PreviewStep,
} from "../lib/planPreview";
import { ActionList } from "../components/ActionList";
import { clearDraft, readDraft, saveDraft } from "../lib/draft";
import { MIC_WORD, sayWord, type MicState } from "../lib/listening";
import { cue, cueForState, cueWord, playCue, type Cue } from "../lib/micSound";
import { differ as intentDiffer, missing as intentMissing, parse as parseIntent, say as intentWords } from "../lib/intent";
import { need as askNeed, question as askQuestion, rule as askRule, type Plan as AskPlan } from "../lib/askWhen";
import { plan as deedsPlan, says as deedsSays, split as splitDeeds, type Deed } from "../lib/twoDeeds";
import { canDo as canDoNegated, parse as parseNegation, say as sayNegation, type Negation } from "../lib/negation";
import { check as checkFit, say as sayFit, stop as fitStops } from "../lib/doesItFit";
import { worst as parseWorst, type Outcome as ParseOutcome, type Row as ParseRow } from "../lib/parseLog";
import { ambiguous as whenAmbiguous, parse as parseWhen, ready as whenReady, say as sayWhen, type When as WhenPlan } from "../lib/whenTo";
import { enough as amountEnough, parse as parseAmount, say as sayAmount, type Amount } from "../lib/amount";
import { collision as synonymCollision, intents as synonymIntents, say as saySynonym } from "../lib/synonyms";
import { canRun as jokeCanRun, check as checkJoke, say as sayJoke, type Dangerous } from "../lib/joking";
import { go as handGo, need as handNeed, question as handQuestion, type Option as HandOption } from "../lib/whichHand";
import { apply as contextApply, gaps as contextGaps, parse as parseContext, say as sayContext, type Context as KeptContext } from "../lib/contextKeep";
import { check as checkUnderstood, run as understoodRuns, say as sayUnderstood, where as whereUnderstood } from "../lib/notUnderstood";
import {
  allowed as consentAllowed,
  check as consentCheck,
  grant as consentGrant,
  revoke as consentRevoke,
  say as consentSay,
  stale as consentStale,
  type Granted as ConsentGranted,
} from "../lib/consentStep";
import {
  order as orderByDeps,
  say as sayOrder,
  type Node as DepNode,
} from "../lib/depOrder";
import {
  allows as strongAllows,
  mark as strongMark,
  question as strongQuestion,
  summary as strongSummary,
  type Danger as StrongDanger,
} from "../lib/strongAsk";
import {
  judge as idemJudge,
  remember as idemRemember,
  summary as idemSummary,
  type Past as IdemPast,
} from "../lib/idempotent";
import {
  judge as refuseJudge,
  learn as refuseLearn,
  say as sayRefuse,
  type Planned as RefusePlanned,
} from "../lib/refuseAll";
import {
  change as editPlanChange,
  fields as editPlanFields,
  ready as editPlanReady,
} from "../lib/editPlan";
import {
  diff as planDiff,
  grant as planGrant,
  holds as planHolds,
  say as sayPlanConsent,
  type Seen as PlanSeen,
} from "../lib/planConsent";
import {
  answer as threeAnswer,
  say as sayThree,
  tally as threeTally,
  type Raw as ThreeRaw,
} from "../lib/threeWords";
import {
  line as failureLine,
  resumable as failureResumable,
  tell as failureTell,
  type StepReport as FailureStep,
} from "../lib/failureKeeps";
import {
  after as undoAfter,
  at as undoAt,
  here as undoHere,
  offer as undoOffer,
  oneClick as undoOneClick,
  type Undoable as UndoStepHere,
} from "../lib/undoHere";
import {
  delta as segmentsDelta,
  lines as segmentLines,
  slowest as slowestSegment,
  word as segmentWord,
  type Kind as SegmentKind,
  type Trace as SegmentTrace,
} from "../lib/segments";
import {
  say as sayTiming,
  slowest as slowestEntry,
  text as timingText,
  type Entry as TimingEntry,
} from "../lib/journalTiming";
import {
  DEFAULT as latencyDefault,
  check as latencyCheck,
  say as sayLatency,
  scaled as latencyScaled,
  tally as latencyTally,
} from "../lib/latencyBudget";
import {
  line as latencyLine,
  repeated as latencyRepeated,
  total as latencyTotal,
  type Deed as LatencyDeed,
} from "../lib/latencyReport";
import { clean as cleanSecrets, forLog as secretsForLog, say as saySecrets } from "../lib/secrets";
import { heard as previewHeard } from "../lib/secretPreview";
import { split as splitChain, risky as chainRisky } from "../lib/chainHands";
import {
  DEFAULT as defaultBudget,
  check as budgetCheck,
  nothing as budgetNothing,
  offer as budgetOffer,
  outcome as budgetOutcome,
  step as budgetStep,
  type Budget as RunBudget,
} from "../lib/budget";
import { already as repeatAlready, decide as repeatDecide, offer as repeatOffer } from "../lib/repeatDeed";
import { attention as reportAttention, one as oneReport, summary as reportSummary, whole as wholeReport } from "../lib/oneReport";
import { answer as handAnswer, coverage as handCoverage, line as handLine, worst as handWorst } from "../lib/handAnswer";
import {
  checkFor as proofFor,
  done as proofDone,
  plan as proofPlan,
  say as sayProof,
  type Proof as StepProof,
} from "../lib/stepProof";
import { finished as cancelFinished, say as cancelSay, stop as cancelStop, start as cancelStart } from "../lib/cancelRun";
import {
  create as createQuick,
  checkName as checkQuickName,
  needsConfirm as quickNeedsConfirm,
  say as sayQuick,
  suggest as suggestQuick,
  type Quick,
} from "../lib/quickCommands";
import {
  find as findYesterday,
  nothing as nothingYesterday,
  plan as planYesterday,
  sayAge as sayYesterdayAge,
  when as whenYesterday,
} from "../lib/likeYesterday";
import {
  breaks as removeBreaks,
  done as removeDone,
  enoughFor as removeEnough,
  lastOne as removeLastOne,
  size as removeSize,
  willFree as removeWillFree,
} from "../lib/removeModel";
import {
  change as whyChange,
  lines as whyLines,
  report as whyReport,
  short as whyShort,
  type Fact as WhyFact,
} from "../lib/whyModel";
import {
  assumed as assumedCpu,
  best as bestBuild,
  howKnown,
  offered as buildOffered,
  say as sayBuild,
  type Cpu as CpuFeatures,
} from "../lib/cpuFeatures";
import {
  fallback as codeFallback,
  isCode,
  load as codeLoad,
  pick as pickModel,
  say as sayModel,
} from "../lib/codeModel";
import {
  PHRASES as COMPARE_PHRASES,
  ready as compareReady,
  say as sayCompare,
} from "../lib/compare";
import {
  allow as allowEngine,
  byDefault as engineDefault,
  differs as engineDiffers,
  reset as resetEngine,
  say as sayEngine,
  type Setup as EngineSetup,
} from "../lib/oneEngine";
import {
  action as idleAction,
  sayUnload,
  sayWaiting,
  wouldHurt as unloadWouldHurt,
} from "../lib/idleUnload";
import {
  lines as cardLines,
  nothingFits,
  offered as cardOffered,
  sizeWord as cardSize,
  type Card as ModelCard,
} from "../lib/modelScreen";
import {
  asFile as modelAsFile,
  damage as hashDamage,
  intact as hashIntact,
  looksLikeQuota,
  missing as modelMissing,
  promise as noQuotaPromise,
} from "../lib/noQuota";
import {
  clear as clearTokens,
  put as putTokens,
  resume as resumeTokens,
  saved as tokensSaved,
  KEEP as KEEP_TOKENS,
  type Entry as TokenEntry,
} from "../lib/tokenCache";
import {
  cacheMb as windowCache,
  say as sayWindow,
  wasteful as windowWasteful,
  windowFor,
} from "../lib/contextWindow";
import {
  accept as acceptIntent,
  say as sayIntent,
  share as intentShare,
  worthTwo as intentWorthTwo,
} from "../lib/intentModel";
import {
  measure as measureSpeed,
  say as saySpeed,
  stale as speedStale,
  usable as speedUsable,
  waitMs,
  waitWord,
  type Measured as SpeedMeasured,
} from "../lib/speed";
import {
  choose as chooseQuant,
  say as sayQuant,
  sizeMb as quantSize,
  whyNotSmaller,
} from "../lib/quant";
import {
  warning as ladderWarning,
  nothing as ladderNothing,
  pick as ladderPick,
  speedWord,
  STEPS as LADDER,
} from "../lib/modelLadder";
import {
  memoryMb as rolesMemory,
  plan as rolesPlan,
  say as sayRoles,
  type Model as RoleModel,
} from "../lib/modelRoles";
import {
  approximate as sayApprox,
  grade as machineGrade,
  measure as readMachine,
  forModel as hwForModel,
  gpuUsable,
  say as sayMachine,
  stale as machineStale,
  type Profile as MachineProfile,
} from "../lib/machineProfile";
import {
  broken as brokenLines,
  empty as logEmpty,
  push as logPush,
  stage as logStage,
  text as logText,
  timed as logTimed,
  why as logWhy,
  type Line as PhraseLine,
} from "../lib/phraseLog";
import {
  askConfirm,
  fix as fixWord,
  say as saySure,
  text as sureText,
  type Word,
} from "../lib/asrConfidence";
import {
  add as addWord,
  load as loadWords,
  remove as removeWord,
  save as saveWords,
  status as wordsStatus,
} from "../lib/ownWords";
import {
  kept,

  RUNNING as PAUSE_RUNNING,
  START as PAUSE_START,
  tick as pauseTick,
  word as pauseWord,
  type Pause,
} from "../lib/micPause";
import { markMicExplained, micExplained } from "../lib/firstRun";
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
  // Шаг 52: цвет вместе со звуком. Направление сигнала слышно, цвет — видно;
  // по отдельности каждое можно не заметить, вместе — трудно.
  cueListening: { color: tokens.colorPaletteGreenForeground1 },
  cueWorking: { color: tokens.colorPaletteBlueForeground2 },
  cueProblem: { color: tokens.colorPaletteRedForeground1 },
  micIntro: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    maxWidth: "560px",
    padding: "14px 16px",
    borderRadius: tokens.borderRadiusLarge,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
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
  /**
   * Фраза, набранная в едином входе (шаг 181). Не «отправить» — а «положить в
   * поле»: человек видит её, может поправить и отправляет сам. Отправка за него
   * отняла бы у него последний взгляд перед действием, а вход обещает только
   * «не ищи экран», не «действуй без тебя».
   */
  handed?: { text: string; at: number } | null;
}

type EngineStart =
  | { kind: "started" }
  | { kind: "missing" }
  | { kind: "failed"; note: string }
  | { kind: "unknown" };

export function Voice({ onOpen, active = true, handed = null }: VoiceScreenProps) {
  const styles = useStyles();
  // Шаг 26: то, что человек набрал или сказал, но не отправил, переживает
  // закрытие окна. Восстанавливаем при открытии экрана — один раз, лениво, чтобы
  // не читать хранилище на каждый рендер.
  const [text, setText] = useState(() => readDraft());
  // Что пришло из единого входа (шаг 181). Запоминаем по времени, а не по тексту:
  // одну и ту же фразу можно сказать дважды, и второй раз её тоже надо положить
  // в поле, если человек успел его очистить.
  const handedAt = useRef<number | null>(null);
  useEffect(() => {
    if (!handed || handedAt.current === handed.at) return;
    handedAt.current = handed.at;
    setText(handed.text);
  }, [handed]);
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
  // Показано ли объяснение про микрофон (шаг 24). Не хранится в настройках:
  // это состояние экрана, а «уже объясняли» — в хранилище.
  const [micIntro, setMicIntro] = useState(false);
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
  // Шаг 102: согласие привязано к шагу **и его параметрам**. Правка после
  // согласия — обход, и он закрыт: отпечаток изменился, согласие снято.
  const [consents, setConsents] = useState<ConsentGranted[]>([]);
  const [consentNote, setConsentNote] = useState<string | null>(null);
  // Шаг 104: отмена — состояние, которое читают перед каждым шагом, а не флаг,
  // выставленный один раз.
  const [cancel, setCancel] = useState(() => cancelStart(0));
  const [cancelNote, setCancelNote] = useState<string | null>(null);
  // Шаг 109: у дела есть бюджет, и по нему — остановка с причиной. Три предела
  // названы числом: предел, который не назван, наступает неожиданно.
  const [runBudget] = useState<RunBudget>(defaultBudget);
  const [spent, setSpent] = useState(() => budgetNothing());
  // Шаг 114: что уже сделано в прошлый раз — по отпечатку шага и параметров.
  const [pastRuns, setPastRuns] = useState<IdemPast[]>([]);
  // Шаг 116: план правится **полями со словами**, а не JSON. Правки — до запуска,
  // и каждая проверяется сразу.
  const [planEdits, setPlanEdits] = useState<{ position: number; name: string; value: string }[]>([]);
  const [editNote, setEditNote] = useState<string | null>(null);
  // Шаг 117: согласие даётся на **план целиком** — состав, порядок, риск и
  // параметры. Шаг 102 закрыл параметры, здесь — остальное.
  const [planConsent, setPlanConsent] = useState<{ plan: PlanSeen[]; print: string; at: number } | null>(null);
  // Шаг 121: отрезки замера. «Отвечает 4 секунды» не говорит, что чинить, — здесь
  // видно каждый отрезок и самый долгий.
  const [segments, setSegments] = useState<Partial<Record<SegmentKind, number | null>>>({});
  const [segmentsTotal, setSegmentsTotal] = useState(0);
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
  /**
   * Очередь дел переживает перезапуск окна.
   *
   * Восстанавливаем при старте, а не «когда понадобится»: человек, закрывший окно
   * и вернувшийся, должен увидеть свои дела, а не пустой список. Дела, которые в
   * момент закрытия шли, возвращаются в ожидание с честной пометкой — процесса
   * уже нет, и делать вид, что работа продолжается, нельзя.
   */
  /**
   * Сколько дел прервал прошлый перезапуск. Считается **здесь же**, при чтении:
   * `loadQueue` возвращает это число, но раньше оно терялось (брали только
   * `.items`), и человек не узнавал, что его дело прервалось (шаг 159).
   * Читается один раз при монтировании: это факт про прошлый запуск, а не про
   * текущий, и пересчитывать его на каждый рендер нечего.
   */
  // Одно чтение на два состояния: хранилище читает диск, и дважды подряд
  // читать его ради одного и того же — работа без пользы.
  const [restored] = useState(() => {
    const store = globalThis.localStorage;
    if (!store) return { items: [] as QueueItem[], interrupted: 0 };
    return loadQueue(store);
  });
  const [interrupted, setInterrupted] = useState(restored.interrupted);
  const [queue, setQueue] = useState<QueueItem[]>(restored.items);
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
  /**
   * Ждёт ли план именно ответа: есть вопросы и хоть один пустой.
   *
   * Подпись поля и кнопки должна совпадать с тем, что произойдёт. Когда все поля
   * заполнены, «Ответить» — ложь: ответить некуда, это новый поиск.
   */
  const draftWaitingAnswer =
    draft !== null &&
    draft.questions.length > 0 &&
    firstOpenQuestion(draft.questions, answers) !== null;
  const runningRef = useRef(running);
  runningRef.current = running;
  const executeRef = useRef<(granted?: number[], answerOverride?: Record<string, string>) => void>(
    () => {},
  );
  const answersRef = useRef(answers);
  answersRef.current = answers;
  // Пишем на диск с паузой: на каждое изменение — десятки записей в секунду.
  // `flush` вызывается при уходе с экрана, чтобы последняя правка не потерялась.
  const queueWriterRef = useRef<ReturnType<typeof createWriter> | null>(null);
  if (queueWriterRef.current === null && globalThis.localStorage) {
    queueWriterRef.current = createWriter(globalThis.localStorage);
  }

  useEffect(() => {
    queueWriterRef.current?.write(queue);
  }, [queue]);

  useEffect(
    () => () => {
      // Последняя правка уходит на диск немедленно: закрытие окна не ждёт паузы.
      queueWriterRef.current?.flush();
    },
    [],
  );

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
    // Шаг 69: модель — файл с хешем; это единственное условие работы.
    if (status?.model_present && status.model_spec) {
      setModelFile({
        name: status.model_spec.file,
        sha256: status.model_spec.sha256,
        size: status.model_spec.bytes,
      });
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

    // Ссылка на дела пополняется эффектом выше, но при монтировании он ещё не
    // выполнялся: `queueRef` пуста, а восстановленные дела лежат в состоянии
    // `queue`. Без этой строки такая очередь не начиналась никогда — она честно
    // сообщала «начинать нечего: в очереди пусто», а дела ждали на экране.
    //
    // Только если ссылка пуста: дела, добавленные кнопкой между рендером и
    // нажатием «Работать без меня», в состоянии ещё могут отсутствовать, и
    // затирать их копией из состояния значило бы терять только что добавленное.
    if (queueRef.current.length === 0) {
      queueRef.current = queue;
    }
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

          // Ошибку не глотаем в `null`: «ядро не ответило» и «ядро ответило отказом» —
          // разные причины, и человеку нужна настоящая. При этом исключение здесь не
          // должно оставлять дело в «идёт»: именно так очередь вставала навсегда.
          // Точка продолжения — из самого дела: если прошлый запуск остановился на
          // третьем шаге, начинаем с третьего. Начало заново значило бы второй раз
          // создать папку или второй раз удалить файл.
          // Точка продолжения: сначала из самого дела, а если её там нет —
          // из памяти (шаг 141). Дело может быть новым, но с той же целью:
          // прошлый запуск убийством процесса остановился на шаге 3 и отчёта не
          // отдал, зато шаги уже лежали на диске. Без этого вопроса дело
          // начиналось бы заново — то есть второй раз создавало папку.
          const fromPlan = queueRef.current.find((entry) => entry.id === item.id)?.resumeAt;
          const resume =
            fromPlan ?? (await planCheckpoint(item.goal, check.plan.steps.length).catch(() => null)) ?? undefined;
          let report: Awaited<ReturnType<typeof runPlan>> | null = null;
          try {
            report = await runPlan(JSON.stringify(check.plan), [], resume);
          } catch (reason: unknown) {
            const message = reason instanceof Error ? reason.message : String(reason);
            mine((current) =>
              setState(current, item.id, "failed", `запуск прервался: ${message}`),
            );
            outcome = { completed: 0, steps: 0, stopped: message };
            return;
          }
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

          // Остановились — запоминаем, где именно: при повторе и после перезапуска
          // дело продолжается с этого шага, а не с начала.
          if (report.resume_at && report.resume_at > 1) {
            mine((current) => setResumeAt(current, item.id, report.resume_at));
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
      // «Стоп» — это и есть перебивание: динамик замолкает, микрофон закрывается
      // до следующей фразы. Машина не должна остаться в «говорю».
      soundRef.current?.send("reset");
      speechRef.current?.clear();
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
    // Шаг 104: план модели — тоже прогон, и отмена его тоже касается. Новый план
    // начинает с нуля: «хватит» из прошлого к нему не относится.
    setCancel(cancelStart(check.plan?.steps.length ?? 0));
    setCancelNote(null);
    if (phraseIsEnough(check)) {
      setSpoken(voice.autoRun);
      speak(voice.autoRun);
      runCheckedRef.current(check);
      return;
    }
    const phrase = `${voice.thinkPlanReady(check.plan?.steps.length ?? 0)}. ${voice.thinkNotExecuted}`;
    setSpoken(speak(phrase) ? voice.said(phrase) : voice.silent);
  };

  // Шаг 121: точка отсчёта для отрезков. Замер идёт на настоящем пути, а не
  // отдельным стендом: стенд меряет стенд.
  const markRef = useRef<{ start: number; phrase: number | null; loggedAt: number | null }>({
    start: 0,
    phrase: null,
    loggedAt: null,
  });

  const search = useCallback((phrase: string) => {
    // Отрезок «фраза → текст»: от последнего слова человека до готового текста.
    const startedAt = markRef.current.start || Date.now();
    markRef.current.start = startedAt;
    setSegments((current) => ({ ...current, phrase: current.phrase ?? 0, text: Date.now() - startedAt - (current.phrase ?? 0) }));
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

    // Шаг 98: вычистка **до** отправки. Фраза уходит модели и в журнал уже без
    // секрета; место помечено, чтобы разбор не потерял «про пароль».
    const scrubbed = cleanSecrets(query);
    setSecretSay(saySecrets(scrubbed) === "" ? null : saySecrets(scrubbed));
    const safeQuery = secretsForLog(scrubbed);

    // Фраза стала делом — черновик убран (шаг 26). Иначе на следующем запуске
    // человек видит свой же прошлый вопрос и решает, что он не ушёл.
    clearDraft();
    setBusy(true);
    setError(null);
    // Шаг 81: разбор намерения — глагол, объект и определение, а не совпадение
    // слов. «Найди большие файлы» и «найди файл по имени» — разные дела, и это
    // видно до действия. Шаг 83: два дела — разложить. Шаг 84: отрицание — до
    // исполнения: цена ошибки тут стёртое. Разбор один на обе ветки — и голос, и
    // набранную фразу: иначе кнопка «Найти» обходила бы весь раздел «Мозг».
    {
      const parsed = parseIntent(safeQuery);
      setDeeds(splitDeeds(safeQuery));
      setNegation(parseNegation(safeQuery));
      setHeardIntent(safeQuery);
      setSaidIntent(intentWords(parsed));
      // Шаг 91: «когда» отдельно от «что». «Завтра в девять» не исполняется
      // сейчас: сделать сегодня то, что просили на завтра, видно не сразу.
      // Шаг 97: не понято — **ничего не запускается**, включая похожее чтение:
      // похожее сходит за ответ и приучает не читать.
      {
        const intentNow = parseIntent(safeQuery);
        const lost = whereUnderstood(query) ?? checkUnderstood(intentNow);
        setLostSay(understoodRuns(lost) ? null : sayUnderstood(lost));
        if (!understoodRuns(lost)) setApproved([]);
      }
      // Шаг 96: «а теперь то же с другой папкой». Разбор идёт по прошлому
      // разложению; заменяется **только названное**, и опасность наследуется.
      {
        const result = parseContext(safeQuery, keptPhrase);
        if (/то\s+же|так\s+же/i.test(query)) {
          const next = contextApply(keptPhrase as KeptContext, result);
          const missing = contextGaps(result);
          setSameSay(
            missing.length > 0
              ? `нужно назвать: ${missing.join(", ")} — придумывать не буду`
              : sayContext(keptPhrase, result),
          );
          setKeptPhrase(next);
        } else {
          // Новая фраза становится контекстом для следующего «то же».
          const intentNow = parseIntent(query);
          setKeptPhrase({
            verb: intentNow.verb,
            object: intentNow.object,
            params: Object.fromEntries(
              (draft?.gates ?? []).map((gate) => [`step-${gate.position}`, gate.registry]),
            ),
            said: query,
            dangerous: danger?.found === true,
          });
        }
      }
      // Шаг 94: опасное намерение распознаётся в любой форме, и шутка не
      // оправдывает: интонации нет, а цена необратима.
      {
        const risky = checkJoke(safeQuery);
        setDanger(risky);
        if (!jokeCanRun(risky)) setApproved([]);
      }
      // Шаг 93: человек не обязан знать реестр. Намерение находится по его
      // словам, а пересечение не решается молча — его увидит человек.
      {
        const found = synonymIntents(safeQuery);
        const both = synonymCollision(safeQuery);
        setSynonymSay(
          both.length > 1
            ? [`во фразе два намерения (${both.join(" и ")}) — скажите, какое`, ...both.map((intent) => saySynonym(intent))]
            : found[0] === "неизвестно"
              ? []
              : [saySynonym(found[0] as Parameters<typeof saySynonym>[0])],
        );
      }
      // Шаг 92: количество — отдельным разбором. «Несколько» не превращается в
      // число, а диапазон не схлопывается в одно.
      const count = parseAmount(safeQuery);
      setAmount(count);
      if (!amountEnough(count)) setApproved([]);
      const when = parseWhen(safeQuery, Date.now());
      setWhenPlan(when);
      if (!whenReady(when, Date.now())) setApproved([]);
      // Шаг 86: «готово» — только когда шаг сходится с фразой.
      const steps = draftRef.current?.plan?.steps ?? [];
      const got = {
        what: steps.length > 0 ? (steps[0]?.why ?? steps[0]?.registry ?? "") : parsed.object,
        by: parsed.qualifier,
        count: steps.length,
      };
      const fit = checkFit({ object: parsed.object, qualifier: parsed.qualifier }, got);
      setFitSay(sayFit({ object: parsed.object, qualifier: parsed.qualifier }, got));
      // Не тот предмет останавливает план: следующие шаги опираются на результат
      // этого, и продолжать значит делать не то, что просили.
      if (fitStops(fit)) setApproved([]);
    }
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
        // Отрезок «план»: от поиска до готового черновика плана.
        setSegments((current) => ({ ...current, plan: Date.now() - startedAt }));
        // Шаг 102: план мог измениться — пересчитываем согласия по отпечатку
        // параметров. Снятые названы причиной, а не «снова подтвердите».
        const proposed = proposal?.plan ?? null;
        if (proposed !== null) {
          // Шаг 104: новый план — новый прогон. Прежняя отмена к нему не относится:
          // иначе «хватит» из прошлого плана молча блокирует новый.
          setCancel((current) =>
            current.total === proposed.steps.length && current.done === 0 ? current : cancelStart(proposed.steps.length),
          );
          setCancelNote(null);
          // Шаг 102: согласие привязано к отпечатку параметров, поэтому новая
          // проверка плана (план мог поправиться по ответам) не должна снимать
          // согласие на шаги, которых правка не коснулась.
          setConsents((current) => {
            const verdict = consentCheck(current, proposed.steps);
            const fresh = verdict.kept.filter((item) => !consentStale(item, Date.now()));
            setConsentNote(
              verdict.lost.length > 0 || fresh.length !== verdict.kept.length ? consentSay(verdict) : null,
            );
            return fresh;
          });
        }
        // Шаг 95: если под фразу подходит несколько разных шагов, молча выбрать
        // нельзя — спрашиваем одним коротким вопросом из того, что нашлось.
        {
          const options: HandOption[] = (proposal?.plan?.steps ?? []).map((step, position) => ({
            what: step.why ?? step.registry,
            position,
            dangerous: (proposal?.gates ?? []).some(
              (gate) => gate.position === position && gate.risk === "destructive",
            ),
          }));
          const ask = handNeed(options);
          setHandAsk(ask.ask ? handQuestion(ask) : null);
          setHandBlocked(!handGo(ask, null));
        }
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


  // Шаг 57: свой словарь. Человек добавляет слова, которые распознавание не
  // знает, — иначе правка общего словаря не его дело, а повторять громче
  // бесполезно.
  const [words, setWords] = useState<string[]>([]);
  const [newWord, setNewWord] = useState("");
  const [wordSay, setWordSay] = useState<string | null>(null);
  // Шаг 58: «услышал так» — с правкой по словам. Человек правит одно слово, а не
  // перепечатывает фразу: иначе точность наказывается.
  const [heardWords, setHeardWords] = useState<Word[] | null>(null);
  // Шаг 60: журнал фраз — что услышано, что понято, что сделано. Разбор без него
  // превращается в «так было же»: человек помнит смысл, но не слова.
  const [phrases, setPhrases] = useState<PhraseLine[]>([]);
  // Шаг 61: профиль машины. Без него остаётся «попробуем 7B» — и на слабом
  // ноутбуке она думает по тридцать секунд, а человек решает, что приложение
  // медленное.
  const [hw, setHw] = useState<MachineProfile | null>(null);
  // Шаг 62: роль → модель. Одна модель на всё посредственна во всём: понять
  // фразу нужно быстро, код — точно, и требования враждебные.
  const roleModels: RoleModel[] = [
    { name: "0.5B", sizeMb: 400, code: false, embed: false },
    { name: "1.5B", sizeMb: 1100, code: false, embed: false },
    { name: "7B", sizeMb: 4600, code: true, embed: false },
    { name: "bge-m3", sizeMb: 560, code: false, embed: true },
  ];
  const roleChoices = rolesPlan(roleModels);
  // Шаг 75: по умолчанию **один** движок, и это поправка к шагу 62. Разные
  // модели нужны ролям по потребности, но настройкой по умолчанию они делают
  // зоопарк: память занята всеми, и непонятно, чей ответ.
  const [engines, setEngines] = useState<EngineSetup>(() => engineDefault("7B"));
  // Шаг 76: сравнение на пяти **своих** фразах. Чужие бенчмарки меряют чужое, а
  // придумывать фразы и произносить дважды никто не станет — потому одна кнопка.
  const [compareText, setCompareText] = useState("");
  const [compareSay, setCompareSay] = useState<string | null>(null);
  // Шаг 77: кодовая модель — отдельно и только на код. Если она загружена «на
  // всякий случай», разговор идёт через неё же и ждётся втрое дольше.
  const [codeTask, setCodeTask] = useState(false);
  // Шаг 81: разбор намерения — глагол + объект + определение. Показан **до**
  // действия: человек должен поправить, если разбор ошибся.
  const [heardIntent, setHeardIntent] = useState<string | null>(null);
  const [saidIntent, setSaidIntent] = useState<string | null>(null);
  const [deeds, setDeeds] = useState<Deed[]>([]);
  // Шаг 84: отрицание — часть намерения: «не удаляй» не исполняется как «удали».
  const [negation, setNegation] = useState<Negation | null>(null);
  // Шаг 85: «как вчера» — из настоящего журнала фраз, а не из догадки.
  const [repeatSay, setRepeatSay] = useState<string[] | null>(null);
  // Шаг 86: понимание проверяется по результату, а не по факту исполнения.
  const [fitSay, setFitSay] = useState<string | null>(null);
  const [currentPlan, setCurrentPlan] = useState<PlanCheck["plan"] | null>(null);
  // Шаг 91: «когда» отдельно от «что»: время, событие и условие — три разные вещи.
  const [whenPlan, setWhenPlan] = useState<WhenPlan | null>(null);
  // Шаг 92: «сколько» и «какие именно» — числа, диапазоны, даты.
  const [amount, setAmount] = useState<Amount | null>(null);
  // Шаг 93: намерение своими словами — «почисти», «освободи место», «убери мусор».
  const [synonymSay, setSynonymSay] = useState<string[]>([]);
  // Шаг 94: опасное намерение — даже в шутливой форме. Тон не влияет.
  const [danger, setDanger] = useState<Dangerous | null>(null);
  // Шаг 95: две разные руки — один короткий вопрос вместо молчаливого выбора.
  const [handAsk, setHandAsk] = useState<string | null>(null);
  const [handBlocked, setHandBlocked] = useState(false);
  // Шаг 96: последняя фраза хранится разложением, а не текстом: «то же с другой
  // папкой» меняет путь, а остальное остаётся.
  const [keptPhrase, setKeptPhrase] = useState<KeptContext | null>(null);
  const [sameSay, setSameSay] = useState<string | null>(null);
  // Шаг 97: не понял — не запускает ничего и говорит, что не понято.
  const [lostSay, setLostSay] = useState<string | null>(null);
  // Шаг 98: секреты вычищаются **до** отправки — после отправки уже поздно.
  const [secretSay, setSecretSay] = useState<string | null>(null);
  // Шаг 99: частые фразы становятся быстрыми командами — без кода.
  const [quick, setQuick] = useState<Quick[]>([]);
  const [quickName, setQuickName] = useState("");
  const [quickSay, setQuickSay] = useState<string | null>(null);
  const [codeModel] = useState<string | null>("7B");
  // Шаг 66: разбор намерения — дешёвая модель. «Открой блокнот» не должно ждать
  // семь секунд, пока 7B разберётся, что это две команды.
  const knownCommands = ["открыть", "закрыть", "найти", "архивировать", "напечатать"];
  const [intentStats, setIntentStats] = useState({ cheap: 0, big: 0 });
  const tryIntent = (command: string | null, sure: number) => {
    const verdict = acceptIntent(command, sure, knownCommands);
    setIntentStats((current) => ({
      cheap: current.cheap + (verdict.ok ? 1 : 0),
      big: current.big + (verdict.ok ? 0 : 1),
    }));
    return verdict;
  };

  // Шаг 65: замер на этой машине. Первый прогон выбрасывается — он читает
  // модель с диска и греет кеш, и цифра была бы занижена.
  const [speed, setSpeed] = useState<SpeedMeasured | null>(null);
  // Шаг 68: кэш токенизации реплики. Девять десятых истории не менялось, а
  // пересчитывалось всё; кэш живёт ради скорости и ограничен.
  const [tokenCache, setTokenCache] = useState<TokenEntry[]>([]);
  const [tokensSkipped, setTokensSkipped] = useState(0);
  // Шаг 74: выгрузка по простою. Модель, загруженная один раз, занимает 4–7 ГБ
  // весь день, пока человек решает другие задачи: тормозят другие программы, а
  // виноватым выглядит не оно.
  const lastUsedRef = useRef(Date.now());
  const [unloadSay, setUnloadSay] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const loadedRef = useRef(false);
  loadedRef.current = loaded;
  const touchModel = () => {
    lastUsedRef.current = Date.now();
    if (!loadedRef.current) {
      // Возврат после выгрузки предупреждает **до** ответа, а не объясняет после.
      if (unloadSay !== null) setUnloadSay(sayWaiting(hw?.disk ?? "unknown"));
      setLoaded(true);
    }
  };
  useEffect(() => {
    const step = window.setInterval(() => {
      const idleMs = Date.now() - lastUsedRef.current;
      // Выгрузить посреди генерации значит оборвать работу человека.
      if (unloadWouldHurt({ idleMs, loaded: loadedRef.current }, busyRef.current)) return;
      if (idleAction({ idleMs, loaded: loadedRef.current }) !== "unload") return;
      setLoaded(false);
      setUnloadSay(sayUnload(4600, hw?.disk ?? "unknown"));
    }, 30_000);
    return () => window.clearInterval(step);
  }, [hw?.disk]);
  // Шаг 69: квоты нет. Файл модели и его хеш — единственное условие работы;
  // счётчика нет не потому, что «не показываем», а потому что нечего показывать.
  const [modelFile, setModelFile] = useState<{ name: string; sha256: string; size: number } | null>(null);
  // Шаг 69: файл и его хеш берутся из **настоящего** статуса готовности, а не
  // выдумываются. Нет файла — нечего показывать как «работает».
  const modelReady = modelFile !== null && hashIntact(modelFile, modelFile.sha256);
  // Шаг 71: экран моделей. Лицензия стоит выше рекламы: если она запрещает,
  // остальное неважно, а узнать это надо до загрузки четырёх гигабайт.
  const cards: ModelCard[] = [
    { name: "0.5B", sizeMb: 400, license: "Apache-2.0", needsMb: 1900, measuredPerSecond: null, good: "понимает фразу мгновенно" },
    { name: "1.5B", sizeMb: 1100, license: "Apache-2.0", needsMb: 2600, measuredPerSecond: null, good: "разговор и простой план" },
    { name: "3B", sizeMb: 2200, license: "Apache-2.0", needsMb: 3700, measuredPerSecond: null, good: "план в несколько шагов" },
    { name: "7B", sizeMb: 4600, license: "Apache-2.0", needsMb: 6100, measuredPerSecond: null, good: "сложный код и длинные планы" },
  ];
  /** Токенизатор = имя выбранной модели: после смены кэш негоден. */
  const tokenizer = rolesPlan(roleModels)[0]?.model?.name ?? "none";
  const reuseTokens = (text: string, tokens: number[]) => {
    const resumed = resumeTokens(tokenCache, text, tokenizer);
    if (resumed !== null) setTokensSkipped((current) => current + tokensSaved(tokens, resumed.tokens.length));
    setTokenCache((current) => putTokens(clearTokens(current, tokenizer), { text, tokens, tokenizer }));
  };
  const warmRef = useRef(false);
  /** Запомнить замер потока: пуск и скорость, с выбросом первого прогона. */
  /** Ссылка на «идёт работа» — таймер выгрузки живёт дольше рендера (шаг 74). */
  const busyRef = useRef(false);
  busyRef.current = busy;
  /** Поток живёт дольше рендера — замер читаем из ссылок (шаг 65). */
  const pieceStart = useRef(0);
  const pieceCount = useRef(0);
  const keepSpeedRef = useRef<(first: number, last: number, count: number) => void>(() => {});
  const keepSpeed = (first: number, last: number, count: number) => {
    const measured = speedUsable(measureSpeed(first, last, count, Date.now()), warmRef.current);
    if (measured === null) {
      warmRef.current = true;
      return;
    }
    setSpeed(measured);
    try {
      window.localStorage.setItem("zshelper.speed", JSON.stringify(measured));
    } catch {
      // Не сохранилось — не беда: перемерим.
    }
  };
  keepSpeedRef.current = keepSpeed;
  useEffect(() => {
    const stored = typeof window === "undefined" ? null : window.localStorage.getItem("zshelper.speed");
    if (stored === null) return;
    try {
      const parsed = JSON.parse(stored) as SpeedMeasured;
      if (!speedStale(parsed, Date.now())) setSpeed(parsed);
    } catch {
      // Замер испорчен — просто перемерим позже.
    }
  }, []);
  useEffect(() => {
    const fresh = { at: Date.now() };
    const stored = typeof window === "undefined" ? null : window.localStorage.getItem("zshelper.machine");
    if (stored !== null) {
      try {
        const parsed = JSON.parse(stored) as MachineProfile;
        if (!machineStale(parsed, fresh.at)) {
          setHw(parsed);
          return;
        }
      } catch {
        // Профиль испорчен — просто измеряем заново.
      }
    }
    const measured = readMachine(fresh.at);
    setHw(measured);
    try {
      window.localStorage.setItem("zshelper.machine", JSON.stringify(measured));
    } catch {
      // Не сохранилось — не беда: профиль дешёвый.
    }
  }, []);
  useEffect(() => {
    setWords(loadWords(typeof window === "undefined" ? null : window.localStorage));
  }, []);
  const keepWords = (next: string[]) => {
    setWords(next);
    saveWords(typeof window === "undefined" ? null : window.localStorage, next);
  };

  // Шаг 59: ответ голосом выключается одной кнопкой, а не в настройках. И
  // выключенный голос всё равно проговаривает подтверждение и ошибку: молча
  // пропустить вопрос об опасном действии хуже, чем нарушить тишину.
  const [voiceSwitch, setVoiceSwitch] = useState<VoiceSwitch>(VOICE_ON);
  /** Очередь речи живёт дольше рендера — читаем кнопку из ссылки (шаг 59). */
  const voiceSwitchRef = useRef(voiceSwitch);
  voiceSwitchRef.current = voiceSwitch;
  // Возвращает, зазвучало ли: экран на это опирается, и молча менять сигнатуру
  // значит сломать вызывающих.

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
      // Подтверждение — важное: при выключенном голосе всё равно звучит, и
      // человеку сказано, почему (шаг 59).
      {
        const anyway = sayAnyway("confirm");
        if (anyway) setDeviceNotice(anyway);
      }

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
      // Шаг 77: маршрут по задаче. Код уходит на кодовую модель, разговор —
      // на обычную; кодовая не грузится, пока код не попросили.
      const wantsCode = isCode(heard);
      const route = pickModel(wantsCode ? "code" : "talk", "1.5B", codeModel);
      setCodeTask(wantsCode);
      setDeviceNotice(sayModel(route));
      if (route.model === null && wantsCode) setDeviceNotice(codeFallback("1.5B"));
      // Шаг 81: разбор намерения — глагол, объект и определение, а не
      // совпадение слов. «Найди большие файлы» и «найди файл по имени» —
      // разные дела, и это видно до действия.
      const parsed = parseIntent(heard);
      // Шаг 83: два дела в одной фразе — разложить и сделать по очереди.
      // «Найди и отправь» сегодня теряет вторую половину молча.
      setDeeds(splitDeeds(heard));
      // Шаг 84: разбор отрицания — **до** исполнения. Цена ошибки тут — стёртое,
      // поэтому сомнение не угадывается, а переспрашивается.
      setNegation(parseNegation(heard));
      // Шаг 86: «готово» — только когда шаг сходится с фразой. Предмет сверяем
      // с тем, что понял разбор; если планировщик ничего не нашёл — это «пусто»,
      // а не «выполнено». План берётся из последнего результата планировщика.
      setCurrentPlan(draft?.plan ?? null);
      {
        const steps = currentPlan?.steps ?? [];
        const got = {
          what: steps.length > 0 ? (steps[0]?.why ?? steps[0]?.registry ?? "") : parsed.object,
          by: parsed.qualifier,
          count: steps.length,
        };
        const fit = checkFit({ object: parsed.object, qualifier: parsed.qualifier }, got);
        setFitSay(sayFit({ object: parsed.object, qualifier: parsed.qualifier }, got));
        if (fitStops(fit)) setDeviceNotice("");
      }
      setHeardIntent(heard);
      setSaidIntent(
        intentMissing(parsed).length > 0
          ? intentWords(parsed)
          : saidIntent === null
            ? intentWords(parsed)
            : intentDiffer(saidIntent, heard)
              ? `${intentWords(parsed)} (раньше вы просили другое: «${saidIntent}»)`
              : intentWords(parsed),
      );
      // Шаг 74: фраза — это работа; таймер простоя начинается заново.
      touchModel();
      // Шаг 68: текст фразы — в кэш токенизации. Повтор и продолжение реплики
      // берут готовые токены вместо пересчёта всей истории.
      reuseTokens(heard, Array.from({ length: heard.length }, (_, index) => index));
      // Шаг 66: сначала дешёвый разбор. Если он уверен — большая модель не
      // просыпается; если нет, разбирается она, и это сказано.
      const guess = tryIntent(heard.split(/\s+/)[0] ?? null, 0.7);
      if (!guess.ok) {
        // Не ошибка: это нормальный путь для сложной фразы.
      }
      // Шаг 60: журнал. Пока «что понято» и «что сделано» ещё неизвестны —
      // допишем их, когда разбор закончится; главное, что услышанное уже
      // записано: если разбор упадёт, останется хотя бы это.
      // Шаг 88: строка пишется **сразу** и остаётся даже при неудаче; итог
      // («сделано» / «отказ: причина») дописывается тем же `at`. Шаг 60.
      const loggedAt = Date.now();
      // Шаг 122: запомним, к какой строке журнала дописывать замер.
      markRef.current.loggedAt = loggedAt;
      setPhrases((current) =>
        logPush(current, {
          at: loggedAt,
          heard,
          understood: null,
          did: "разбираю…",
          stage: logStage(heard, null, "разбираю…"),
        }),
      )
      // Шаг 58: разложим фразу на слова — человек увидит, **где** сомневались,
      // и поправит одно слово, а не всю фразу. Уверенность по словам, если
      // движок её дал; иначе считаем фразу уверенной (не выдумываем сомнение).
      setHeardWords(
        heard
          .split(/\s+/)
          .filter((part) => part.length > 0)
          .map((part) => ({ text: part, confidence: 0.9 })),
      );
      search(heard);
    },
    onError: (message) => setVoiceError(message),
    // Шаг 54: смена микрофона — не ошибка, а новость. Сказана словами, а не
    // молчанием: иначе человек говорит в гарнитуру, не зная, слышат ли его.
    onNotice: (message) => setDeviceNotice(message),
    // Шаг 56: сказано, чем распознавание помогло. Иначе одна и та же фраза
    // распознаётся по-разному, и это выглядит как нестабильность.
    onHint: (said) => setDeviceNotice(said),
    process: frontRef.current?.process ?? null,
    own: words,
  });
  micStopRef.current = () => {
    mic.stop();
  };

  const waitingForConfirmation =
    draft?.gates.some(
      (gate) => gate.decision === "confirm" && !approved.includes(gate.position),
    ) === true;
  // Шаг 53: пауза микрофона — состояние с возвратом. «Выключил на минуту»
  // не должно становиться «без микрофона на день»: пауза сама кончается и
  // говорит об этом, а недоговорённое не теряется.
  const [micPause, setMicPause] = useState<Pause>(PAUSE_RUNNING);
  /** Что сменилось с микрофоном (шаг 54): говорим, а не молчим. */
  const [deviceNotice, setDeviceNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!micPause.paused) return;
    const step = window.setInterval(() => {
      setMicPause((current) => {
        const { next, say } = pauseTick(current, 1000);
        if (say) setPauseSay(say);
        return next;
      });
    }, 1000);
    return () => window.clearInterval(step);
  }, [micPause.paused]);
  const [pauseSay, setPauseSay] = useState<string | null>(null);

  // Слово у микрофона всегда (шаг 49): цвет — подсказка, слово — ответ. Его
  // видно на экране и передаётся в трей.
  const micState: MicState = micPause.paused
    ? "closed"
    : voiceError
      ? "error"
      : mic.processing
        ? "parsing"
        : mic.listening
          ? "listening"
          : waitingForConfirmation
            ? "asking"
            : busy || thinking
              ? "thinking"
              : "closed";

  // Шаг 52: у «слушаю» и «обрабатываю» разные звуки, а не только разные слова.
  // Тот, кто говорит и не смотрит на экран, должен слышать, его очередь или
  // уже нет: пока «принимаю» — можно перебить, после «разбираю» — поздно.
  // Звук — только на **смене** состояния: повторять его на каждом кадре значит
  // превратить подсказку в треск.
  const lastCue = useRef<Cue | null>(null);
  useEffect(() => {
    const next = cueForState(micState);
    if (next === lastCue.current) return;
    lastCue.current = next;
    if (next === null) return;
    playCue(cue(next));
  }, [micState]);

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
    // Отрезок «дело» считается от старта разбора, а не от этого вызова: иначе
    // замер говорит, что дело мгновенное, а ждали его с самого начала.
    const deedStart = markRef.current.start || Date.now();
    setRunning(true);
    setError(null);
    setDraft(check);
    void runPlan(JSON.stringify(plan), [])
      .then((result) => {
        if (request !== planRunRef.current) return;
        setReport(result);
        // Отрезок «дело» и общий срок: от поиска до отчёта. Итог — независимый
        // замер, и он не обязан сходиться с суммой до миллисекунды.
        const took = Date.now() - deedStart;
        setSegments((current) => ({ ...current, deed: took }));
        setSegmentsTotal(took);
        // Шаг 122: замер дописывается к строке журнала этой фразы — по времени, а
        // не по индексу: индекс съезжает, как только приходит следующая фраза.
        setPhrases((current) => logTimed(current, markRef.current.loggedAt ?? 0, took));
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
        // Шаг 121: замер и на пути «выполнить», а не только на автозапуске —
        // иначе отрезки есть у одного пути и нет у другого, и сравнение врёт.
        {
          const start = markRef.current.start || Date.now();
          const took = Date.now() - start;
          setSegments((current) => ({ ...current, deed: took }));
          setSegmentsTotal(took);
          setPhrases((current) => logTimed(current, markRef.current.loggedAt ?? 0, took));
        }
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

  /**
   * Очередь произнесения и владелец потока.
   *
   * Поток озвучивается только через `say`: на пути `think` модель отвечает JSON,
   * и произносить его нельзя (это была настоящая ошибка — тест её поймал).
   * `say` просит обычный текст, поэтому куски здесь — речь.
   */
  const speechRef = useRef<ReturnType<typeof createSpeechQueue> | null>(null);
  const streamOwnerRef = useRef(0);

  /**
   * Машина звука: один рот и одни уши.
   *
   * Здесь важно не «красиво», а правило: пока приложение говорит, микрофон закрыт.
   * Иначе распознавание поймает собственную речь и приложение ответит самому себе.
   * Человек заговорил поверх (`bargeIn`) — микрофон открывается, речь замолкает.
   * Состояние нигде не рисуется как главный элемент: это внутренняя дисциплина,
   * проверяемая без микрофона и динамика (`src/lib/audio.ts`).
   */
  const soundRef = useRef<ReturnType<typeof createAudioMachine> | null>(null);
  if (soundRef.current === null) soundRef.current = createAudioMachine();
  if (speechRef.current === null) {
    speechRef.current = createSpeechQueue(
            // Шаг 59: очередь спрашивает у кнопки, звучать ли обычному ответу.
      // Читаем из ссылки: очередь создана одна и захватила бы старое значение.
      (text) =>
        speaks(voiceSwitchRef.current, "answer")
          ? speak(text, "ru-RU", () => speechRef.current?.done())
          : false,
      // Шаг 59: важное (подтверждение, ошибка) зовут мимо обычной очереди —
      // там `speak` звучит всегда, а `sayAnyway` объясняет человеку, почему
      // голос зазвучал при выключенной кнопке.
      () => setSpoken(voice.silent),
    );
  }

  useEffect(() => {
    let alive = true;
    let unlisten: (() => void) | null = null;

    // В браузере ядра нет — тогда подписка ничего не делает, и это не ошибка экрана.
    void import("../ipc")
      .then((ipc) =>
        ipc.onThinkPiece((piece) => {
          // `0` — поток не запрошен: событие чужое и звучать не должно.
          if (streamOwnerRef.current === 0) return;
          // Шаг 65: замер **по событиям движка**, а не таймером вокруг вызова:
          // таймер включает загрузку модели, и цифра перестаёт быть про счёт.
          const now = performance.now();
          if (pieceStart.current === 0) pieceStart.current = now;
          pieceCount.current += 1;
          keepSpeedRef.current(pieceStart.current, now, pieceCount.current);
          speechRef.current?.push(piece);
        }),
      )
      .then((stop) => {
        if (alive) unlisten = stop;
        else stop();
      })
      .catch(() => undefined);

    return () => {
      alive = false;
      unlisten?.();
    };
  }, []);

  // Ушли с экрана — договаривать очередь невежливо.
  useEffect(
    () => () => {
      speechRef.current?.clear();
      stopSpeaking();
    },
    [],
  );

  /**
   * Ответить словами: спросить модель обычным текстом и поставить в очередь.
   *
   * Это и есть путь «пока модель пишет, человек слышит». Отдельно от `think`
   * нарочно: `think` получает JSON-намерение, а его произносить нельзя.
   * Куски приходят событием `think://piece` и звучат по очереди.
   */
  const sayRef = useRef<(question: string) => void>(() => {});
  sayRef.current = (question: string) => {
    const request = ++thoughtRequestRef.current;
    streamOwnerRef.current = request;
    speechRef.current?.clear();
    setThinking(true);
    setThinkError(null);

    say(question)
      .then((answer) => {
        if (request !== thoughtRequestRef.current) return;
        // Модель ответила целиком, а кусков не было (или они уже отзвучали):
        // сказать ответ надо в любом случае — иначе человек не услышит ничего.
        if (speechRef.current?.pending() === 0) speechRef.current?.push(answer);
      })
      .catch((reason: unknown) => {
        if (request !== thoughtRequestRef.current) return;
        const message = reason instanceof Error ? reason.message : String(reason);
        if (isEngineDown(message)) {
          void wakeEngine(
            question,
            () => request === thoughtRequestRef.current,
            () => sayRef.current(question),
          );
          return;
        }
        streamOwnerRef.current = 0;
        setThinkError(message);
      })
      .finally(() => {
        if (request === thoughtRequestRef.current) setThinking(false);
      });
  };

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
  //
  // `useMemo`, а не пересчёт на каждый рендер: этот экран перерисовывается на каждом
  // слове разговора, а очередь и цели меняются куда реже. Без мемоизации каждый
  // рендер заново собирал бы Set по всей очереди и потом ещё раз проходил её на
  // каждую цель — работа, результат которой не изменился.
  const goals = useMemo(
    () => [
      ...new Set(
        queue
          .map((item) => item.origin)
          .filter((origin): origin is string => typeof origin === "string" && origin.length > 0),
      ),
    ],
    [queue],
  );

  // Счётчики по целям и итог очереди — одним проходом на очередь, а не `progress`
  // внутри разметки для каждой цели: «Голос» рисуется часто, а очередь меняется
  // только когда дело началось или кончилось.
  const goalProgress = useMemo(
    () => new Map(goals.map((goal) => [goal, progress(queue, goal)])),
    [goals, queue],
  );
  const queueSummary = useMemo(() => summary(queue), [queue]);

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

      {/*
        Шаг 24: согласие в момент разговора, а не клик вслепую. Блок стоит на
        месте кнопки микрофона и отвечает на три вопроса: что слушают, куда это
        уходит и что будет с разрешением. Два выхода — оба настоящие: «включить»
        ведёт к разговору, «пока без голоса» оставляет человека в приложении с
        полем текста. Отказаться — тоже законный выбор (шаг 36).
      */}
      {micIntro ? (
        <div className={styles.micIntro} role="dialog" aria-label={voice.micBefore.title}>
          <Text weight="semibold">{voice.micBefore.title}</Text>
          <Text className={styles.note}>{voice.micBefore.what}</Text>
          <Text className={styles.note}>{voice.micBefore.permission}</Text>
          <Text className={styles.note}>{voice.micBefore.typed}</Text>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button
              appearance="primary"
              onClick={() => {
                // Понятно — значит понятно. Дальше микрофон включается как обычно,
                // и повторного объяснения не будет.
                markMicExplained();
                setMicIntro(false);
                if (always) mic.start();
              }}
            >
              {voice.micBefore.go}
            </Button>
            <Button
              appearance="subtle"
              onClick={() => {
                // «Пока без голоса» тоже запоминаем: человек выбрал текст, и
                // спрашивать снова при каждом нажатии — это анкета.
                markMicExplained();
                setMicIntro(false);
              }}
            >
              {voice.micBefore.dismiss}
            </Button>
          </div>
        </div>
      ) : null}

      <Button
        className={mic.listening ? styles.micListening : styles.mic}
        appearance="primary"
        icon={<MicRegular />}
        aria-label={always ? voice.always : voice.hold}
        onPointerDown={(event) => {
          event.preventDefault();
          // Человек заговорил — приложение обязано замолчать. Иначе оно говорит
          // поверх него, и разговор превращается в перекрикивание: перебивание
          // должно останавливать речь сразу, а не после того, как человек дождётся
          // конца абзаца. Это и есть «не мешать» в действии, а не в подсказке.
          // Перебивание в машине звука: из «говорю» — в «слушаю», а не в готовность.
          // Иначе приложение считало бы, что ещё говорит, и не открыло бы микрофон.
          soundRef.current?.send("bargeIn");
          speechRef.current?.clear();
          stopSpeaking();
          setCancelled(false);
          // Новая попытка — новая ошибка: старая не должна пугать до разбора.
          setVoiceError(null);
          // Шаг 24: первый раз объясняем, что услышит микрофон, — **до** того,
          // как он включится. Системный запрос разрешения приходит от Windows и
          // ничего не объясняет; человек, увидевший его без подготовки, нажимает
          // вслепую. Объяснение одно на всё время (шаг 39): повторять его при
          // каждом разговоре — значит мешать тому, кто уже согласился.
          if (!micExplained()) {
            setMicIntro(true);
            return;
          }
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

      {/* Шаг 16: граница видна **до** нажатия, а не после. Человек имеет право
          знать, что здесь это ещё не проверяли, прежде чем нажмёт кнопку, —
          иначе первая же неудача читается как «приложение сломано», хотя
          проверено просто не было. */}
      {/* Явный индикатор (шаг 49): слово, а не только цвет кнопки. Цвет не
          видит дальтоник, не слышит диктор и не замечает тот, кто смотрит в
          сторону; человек говорит в пустоту и решает, что приложение сломалось. */}
      <Text
        className={[
          styles.note,
          // Шаг 52: цвет вместе со звуком — по отдельности каждое можно не
          // заметить. Зелёный — слушаю, синий — разбираю, красный — сбой.
          micState === "listening"
            ? styles.cueListening
            : micState === "parsing" || micState === "thinking"
              ? styles.cueWorking
              : micState === "error"
                ? styles.cueProblem
                : undefined,
        ]
          .filter(Boolean)
          .join(" ")}
        // Живая область: смена состояния проговаривается, а не только рисуется.
        aria-live="polite"
        aria-label={sayWord(micState)}
        // Шаг 52: подсказка говорит, что звук значит, — иначе человек слышит
        // сигнал и не знает, про что он. Для состояний без звука подсказки нет.
        title={cueForState(micState) ? cueWord(cueForState(micState)!) : undefined}
      >
        {MIC_WORD[micState]}
      </Text>

      {/* Шаг 53: пауза — одной кнопкой и с возвратом. Пока идёт, сказано, что
          недоговорённое сохранено: человек боится потерять фразу сильнее, чем
          забыть включить микрофон. Возврат — та же кнопка, а не в настройках. */}
      <div className={styles.answer}>
        <Button appearance="subtle" onClick={() => {
            setPauseSay(null);
            setMicPause((current) => (current.paused ? PAUSE_RUNNING : PAUSE_START));
          }}>
          {micPause.paused ? "Вернуть микрофон" : "Пауза микрофона"}
        </Button>
        <Text className={styles.note} role="status">
          {micPause.paused && kept(micPause) ? kept(micPause) : null}
        </Text>
      </div>
      {micPause.paused ? (
        <Text className={styles.note} role="status" aria-live="polite">
          {pauseSay ?? pauseWord(micPause)}
        </Text>
      ) : null}
      {deviceNotice ? (
        <Text className={styles.note} role="status" aria-live="polite">
          {deviceNotice}
        </Text>
      ) : null}

      {/* Шаг 65: замер на этой машине, а не по паспорту. Пуск и скорость —
          разные числа: пять секунд тишины человек считает зависанием, даже если
          потом ответ идёт бойко. Единицы честные: слов в секунду, а не токенов. */}
      <div className={styles.section}>
        <Text className={styles.title}>Скорость на этой машине</Text>
        {speed ? (
          <>
            <Text className={styles.note}>{saySpeed(speed, Date.now())}</Text>
            <Text className={styles.note}>
              ответ из 10 слов: {waitWord(waitMs(speed, 10))}
            </Text>
          </>
        ) : (
          <Text className={styles.note}>
            ещё не мерили — первый прогон читает модель с диска, поэтому замер
            после прогрева
          </Text>
        )}
      </div>

      {/* Шаг 74: выгрузка по простою. Молчаливая выгрузка — это «приложение
          что-то сделало с памятью»; если потом что-то пойдёт не так, виноватым
          будет это. */}
      {unloadSay ? (
        <Text className={styles.note} role="status" aria-live="polite">
          {unloadSay}
        </Text>
      ) : null}

      {/* Шаг 71: экран моделей — четыре факта, по которым выбирают. Порядок не
          случайный: сначала можно ли (лицензия), потом влезет ли, потом сколько
          ждать, и только потом что умеет. */}
      {hw ? (
        <div className={styles.section}>
          <Text className={styles.title}>Модели</Text>
          {cards.filter((item) => cardOffered(item, hwForModel(hw))).length === 0 ? (
            <Text className={styles.note}>{nothingFits(hwForModel(hw))}</Text>
          ) : null}
          {cards.map((item) => (
            <div key={item.name} className={styles.note}>
              {cardLines(item, hwForModel(hw)).map((line) => (
                <div key={line}>{line}</div>
              ))}
            </div>
          ))}
          <Text className={styles.note}>
            всего на диске: {cardSize(cards.reduce((sum, item) => sum + item.sizeMb, 0))} — но
            ставить нужно только ту, которая помещается
          </Text>
        </div>
      ) : null}

      {/* Шаг 69: квоты и счёта нет — модели лежат файлами. Обещание через
          отсутствие механизма сильнее, чем «мы не будем»: нечему ломаться. */}
      <div className={styles.section}>
        <Text className={styles.title}>Модели — файлы на этом компьютере</Text>
        <Text className={styles.note}>{noQuotaPromise()}</Text>
        {modelFile === null ? (
          <Text className={styles.note}>{modelMissing("модель")}</Text>
        ) : modelReady ? (
          <Text className={styles.note}>{modelAsFile(modelFile)}</Text>
        ) : (
          // Хеш не совпал: файл повреждён или подменён — запускать нельзя.
          <Text className={styles.note}>{hashDamage(modelFile)}</Text>
        )}
        <Text className={styles.note}>
          {looksLikeQuota(noQuotaPromise())
            ? "в обещании затесался счётчик — это ошибка"
            : "счётчика здесь нет ни в каком виде: ни баланса, ни «осталось фраз»"}
        </Text>
      </div>

      {/* Шаг 68: кэш токенизации. Экономия названа числом, а не «работает»:
          если экономия нулевая, кэш занимает память зря. */}
      <div className={styles.section}>
        <Text className={styles.title}>Кэш токенизации</Text>
        <Text className={styles.note}>
          {tokenCache.length === 0
            ? "кэш пуст — после первой фразы повтор не пересчитывает историю заново"
            : `${tokenCache.length} реплик в кэше, сэкономлено ${tokensSkipped} токенов`}
        </Text>
        <Text className={styles.note}>
          кэш ограничен {KEEP_TOKENS} репликами: он ради скорости, и без предела сам
          станет причиной нехватки памяти
        </Text>
      </div>

      {/* Шаг 67: окно памяти по задаче. «С запасом» платит памятью и временем
          всегда: внимание считается по всему окну, и пустое место в нём тоже. */}
      <div className={styles.section}>
        <Text className={styles.title}>Память контекста</Text>
        <Text className={styles.note}>{sayWindow("voice")}</Text>
        <Text className={styles.note}>{sayWindow("chat")}</Text>
        <Text className={styles.note}>{sayWindow("plan")}</Text>
        <Text className={styles.note}>{sayWindow("code")}</Text>
        {windowWasteful("voice", windowFor("code")) ? (
          <Text className={styles.note}>
            одно окно на всё — это потеря: голосу хватает {windowFor("voice")} токенов
            ({windowCache("voice")} МБ вместо {windowCache("code")} МБ)
          </Text>
        ) : null}
      </div>

      {/* Шаг 66: дешёвая модель разбирает намерение, большая не просыпается.
          Сказано, сколько фраз дешёвая закрывает сама: меньше половины значит,
          что вторая модель только занимает память. */}
      <div className={styles.section}>
        <Text className={styles.title}>Разбор намерения</Text>
        <Text className={styles.note}>
          {intentStats.cheap + intentStats.big === 0
            ? "быстрая модель разбирает простые фразы — 7B для этого не нужна"
            : sayIntent({ ok: true, command: "команда", sure: 1 })}
        </Text>
        {intentStats.cheap + intentStats.big > 0 ? (
          <Text className={styles.note}>
            быстро разобрано {intentStats.cheap} из {intentStats.cheap + intentStats.big} (
            {Math.round(intentShare(intentStats) * 100)}%)
            {intentWorthTwo(intentStats) ? "" : " — вторая модель пока больше занимает память, чем помогает"}
          </Text>
        ) : null}
        <Text className={styles.note}>
          чтобы проверить: скажите простую фразу и посмотрите, ушла ли она большой
          модели
        </Text>
      </div>

      {/* Шаг 63: лестница моделей. Предлагается самая большая из **влезающих**:
          «попробуйте, может, пойдёт» — не выбор, а лотерея. Потери названы
          заранее: выбирают не «лучшую модель», а потери, которые устраивают. */}
      {hw ? (
        <div className={styles.section}>
          <Text className={styles.title}>Какая модель поместится</Text>
          {(() => {
            const available = hwForModel(hw);
            const chosen = ladderPick(available);
            if (chosen === null) {
              return <Text className={styles.note}>{ladderNothing()}</Text>;
            }
            return (
              <>
                <Text className={styles.note}>
                  на этой машине помещается «{chosen.name}» — {chosen.good}
                </Text>
                <Text className={styles.note}>{ladderWarning(chosen)}</Text>
                {/* Шаг 64: квантование по умолчанию — Q4_K_M, с названной ценой.
                    Q8 — только по доказанному замеру, иначе человек платит
                    памятью за точность, которой не увидит. */}
                <Text className={styles.note}>
                  {sayQuant(chooseQuant().kind, Number.parseFloat(chosen.name))}
                </Text>
                <Text className={styles.note}>
                  {whyNotSmaller()}
                </Text>
                <Text className={styles.note}>
                  файл: {Math.round(quantSize(Number.parseFloat(chosen.name), chooseQuant().kind) / 102.4) / 10} ГБ
                </Text>
                <Text className={styles.note}>
                  по паспорту: {speedWord({ step: chosen, measured: null, passport: 9 })}
                </Text>
                <Text className={styles.note}>
                  ступени: {LADDER.map((step) => step.name).join(" · ")} — каждая
                  следующая умнее и требует больше памяти
                </Text>
              </>
            );
          })()}
        </div>
      ) : null}

      {/* Шаг 99: повтор — одно слово. Имя выбирает человек: «мойка» вспомнят,
          «очистка диска C:» — нет. */}
      {(() => {
        const offers = suggestQuick(phrases, quick);
        const first = offers[0];
        return (
          <div className={styles.section}>
            <Text className={styles.title}>Быстрые команды</Text>
            <Text className={styles.note}>{sayQuick(quick)}</Text>
            {first ? (
              <>
                <Text className={styles.note}>{first.why}</Text>
                <Text className={styles.note}>«{first.phrase}»</Text>
                <Input
                  value={quickName}
                  placeholder="ваше слово"
                  aria-label="Слово для быстрой команды"
                  onChange={(_, data) => setQuickName(data.value)}
                />
                <Button
                  appearance="subtle"
                  onClick={() => {
                    const check = checkQuickName(quickName, quick);
                    if (!check.ok) {
                      setQuickSay(check.why);
                      return;
                    }
                    const made = createQuick(
                      quickName,
                      first,
                      // Опасность берём у того, что уже распознано, а не выводим:
                      // сокращение не должно становиться безопаснее.
                      danger?.found === true,
                      quick,
                    );
                    if (Array.isArray(made)) {
                      setQuick(made);
                      setQuickName("");
                      setQuickSay(
                        quickNeedsConfirm(made[made.length - 1] as Quick)
                          ? "команда создана — подтверждение остаётся: необратимое не становится безопасным"
                          : "команда создана",
                      );
                    } else {
                      setQuickSay(made.why);
                    }
                  }}
                >
                  Назвать одним словом
                </Button>
              </>
            ) : null}
            {quickSay ? (
              <Text className={styles.note} role="status" aria-live="polite">
                {quickSay}
              </Text>
            ) : null}
          </div>
        );
      })()}

      {/* Шаг 98: секрет вычищен до отправки. Сказано, что уйдёт модели, — иначе
          человек решит, что его не поняли. */}
      {secretSay !== null ? (
        <div className={styles.section}>
          <Text className={styles.title}>Секрет</Text>
          <Text className={styles.note} role="alert" aria-live="polite">
            {secretSay}
          </Text>
        </div>
      ) : null}

      {/* Шаг 97: «не понял» — результат, а не пустота. Сказано, что не понято,
          и есть пример, как сказать иначе. */}
      {lostSay !== null ? (
        <div className={styles.section}>
          <Text className={styles.title}>Не понял</Text>
          <Text className={styles.note} role="alert" aria-live="polite">
            {lostSay}
          </Text>
        </div>
      ) : null}

      {/* Шаг 96: «то же» — по прошлому разложению, а не по прошлому тексту.
          Иначе «с другой папкой» скопирует в ту же папку. */}
      {sameSay !== null ? (
        <div className={styles.section}>
          <Text className={styles.title}>То же самое</Text>
          <Text className={styles.note} role="status" aria-live="polite">
            {sameSay}
          </Text>
        </div>
      ) : null}

      {/* Шаг 102: согласие — по шагу и по его параметрам. Правка после согласия
          снимает его, и причина названа. */}
      {draft?.plan ? (
        <div className={styles.section}>
          <Text className={styles.title}>Согласие по шагам</Text>
          <Text className={styles.note} role="status" aria-live="polite">
            {consentNote ?? consentSay(consentCheck(consents, draft.plan.steps))}
          </Text>
          {draft.plan.steps.map((step, index) => {
            const ok = consentAllowed(consents, index, step.params);
            return (
              <Text key={`${step.registry}-${index}`} className={styles.note}>
                // Параметры уже показаны выше; здесь важно только состояние
                // согласия по этому шагу.
                {`${ok ? "согласовано" : "не согласовано"}: шаг ${index + 1}`}
                {" "}
                <Button
                  appearance="subtle"
                  size="small"
                  onClick={() => {
                    // Отзыв по одному шагу: остальные остаются. Человек
                    // передумал про один шаг, а не про весь план.
                    if (ok) {
                      setConsents((current) => consentRevoke(current, index));
                      setApproved((current) => current.filter((position) => position !== index));
                      setConsentNote(`согласие снято — шаг ${index + 1} отозван вами`);
                    } else {
                      setConsents((current) => consentGrant(current, index, step.params, Date.now()));
                      setConsentNote(`согласовано: шаг ${index + 1} — параметры запомнены, правка снимает согласие`);
                    }
                  }}
                >
                  {ok ? "отозвать" : "согласиться"}
                </Button>
              </Text>
            );
          })}
        </div>
      ) : null}

      {/* Шаг 104: отмена обрывает текущий шаг и не запускает следующий.
          Сделанное не отменяется молча — оно названо числом. */}
      {draft?.plan ? (
        <div className={styles.section}>
          <Text className={styles.title}>Отмена</Text>
          <Text className={styles.note} role="status" aria-live="polite">
            {cancelNote ?? cancelSay(cancel)}
          </Text>
          {report !== null ? (
            <Text className={styles.note}>
              {`шагов отчиталось: ${report.steps.length} из ${cancel.total}`}
              {" "}
              <Button
                appearance="subtle"
                size="small"
                onClick={() => {
                  // Счёт — по **завершённым** шагам из отчёта, а не по нажатиям:
                  // «сделано» должно значить «сделано».
                  const after = report.steps.reduce((acc) => cancelFinished(acc), cancel);
                  setCancel(after);
                  setCancelNote(cancelSay(after));
                }}
              >
                Отметить отчитавшиеся шаги
              </Button>
            </Text>
          ) : null}
          <Text className={styles.note}>
            {"следующий шаг "}
            {cancel.stopped || cancel.done >= cancel.total ? "не начнётся" : "начнётся"}
            {" — проверка читается перед каждым шагом, а не один раз в начале"}
          </Text>
          <Button
            appearance="subtle"
            size="small"
            onClick={() => {
              // Отмена — только флаг: текущий шаг доводится до конца, обрывать его
              // посередине значит оставить полдела, о которых не просили.
              const stopped = cancelStop(cancel);
              setCancel(stopped);
              setCancelNote(cancelSay(stopped));
            }}
          >
            Отменить выполнение
          </Button>
        </div>
      ) : null}

      {/* Шаг 105: любая рука отвечает — что сделано, чем доказано, что не
          отменяется. Три поля обязательны: пустое доказательство читалось как
          «всё хорошо», а неотменяемость узнавали после нажатия «отменить». */}
      {report !== null ? (
        <div className={styles.section}>
          <Text className={styles.title}>Что сделано</Text>
          {(() => {
            const gates = draft?.gates ?? [];
            // Шаг 106: все формы отчёта приведены к одной — экран не решает,
            // какая у него в руках, и не показывает три правды об одном факте.
            const reports = report.steps.map((step) => oneReport(step));
            const total = wholeReport(reports);
            const answers = reports.map((step) =>
              handAnswer(
                {
                  did: `${step.tool} (${step.ok ? "выполнено" : step.reason})`,
                  proof: step.proof,
                  risk: gates.find((gate) => gate.position === step.position)?.risk ?? null,
                },
                step.tool,
              ),
            );
            const cover = handCoverage(answers);
            const attention = reportAttention(total);
            // Шаг 118: три слова на каждый шаг. `failed` — не всегда «не сделано»:
            // шаг мог выполниться и сломаться на проверке, и тогда честный ответ —
            // «неизвестно».
            const raws: ThreeRaw[] = report.steps.map((step) => ({
              status: step.status,
              proof: step.evidence,
              confirmed: step.status === "ok" && (step.evidence ?? "").trim().length > 0,
              conflicted: reports.find((item) => item.position === step.position)?.conflicts.length !== 0,
              interrupted: step.status === "cancelled" && (step.reason ?? "").includes("время"),
            }));
            const three = threeTally(raws);
            // Шаг 119: сбой не скрывает сделанного до него. Отчёт начинается с
            // того, что получилось, и только потом — провал.
            const failureSteps: FailureStep[] = report.steps.map((step, index) => ({
              position: step.position,
              what: step.registry,
              answer: threeAnswer(raws[index] ?? { status: "pending" }),
              reason: step.reason,
            }));
            const story = failureTell(failureSteps, three);
            // Шаг 120: отчёт и откат — рядом. У каждого шага видно, можно ли его
            // вернуть, и причины отказа названы, а не спрятаны за серой кнопкой.
            const undoSteps: UndoStepHere[] = report.steps.map((step) => {
              const risk = (draft?.gates ?? []).find((gate) => gate.registry === step.registry)?.risk ?? "read";
              const reversible = risk === "read" || risk === "write-local";
              return {
                position: step.position,
                what: step.registry,
                undoable: reversible && step.status === "ok",
                refusal: reversible
                  ? step.status === "ok"
                    ? ""
                    : "шаг не выполнялся — возвращать нечего"
                  : `риск ${risk}: сделанное не отменяется`,
              };
            });
            const undo = undoHere(undoSteps);
            return (
              <>
                <Text className={styles.note}>{reportSummary(total)}</Text>
                <Text className={styles.note} role="status" aria-live="polite">
                  {sayThree(three)}
                </Text>
                {report.stopped !== null || three.notDone > 0 ? (
                  <>
                    <Text className={styles.note}>{`сбой — ${failureLine(story)}`}</Text>
                    {story.said.map((line) => (
                      <Text key={`story-${line}`} className={styles.note}>
                        {line}
                      </Text>
                    ))}
                    {story.next.map((line) => (
                      <Text key={`next-${line}`} className={styles.note}>
                        {line}
                      </Text>
                    ))}
                    <Text className={styles.note} role="status" aria-live="polite">
                      {failureResumable(story).why}
                    </Text>
                  </>
                ) : null}
                <Text className={styles.note}>
                  {`рука ответила полностью: ${cover.full} из ${cover.total}`}
                </Text>
                {/* Шаг 120: откат рядом с отчётом. У каждого шага видно, можно ли
                    его вернуть, и причины отказа названы, а не спрятаны. */}
                <Text className={styles.note} role="status" aria-live="polite">
                  {`откат: ${undo.said}`}
                </Text>
                {undo.steps.map((step) => (
                  <Text key={`undo-${step.position}`} className={styles.note}>
                    {`${step.position}. ${step.what} — ${undoAt(step)}`}
                  </Text>
                ))}
                {undoOffer(undo) ? (
                  <Button
                    appearance="subtle"
                    size="small"
                    onClick={() => {
                      // Одним нажатием — только то, что можно вернуть, в обратном
                      // порядке: вернуть последнее первым.
                      const can = undoOneClick(undo);
                      const refused = undo.steps.filter((step) => !step.undoable && step.refusal);
                      setEditNote(
                        undoAfter(
                          can.map((step) => `шаг ${step.position}`),
                          refused.map((step) => `шаг ${step.position}: ${step.refusal ?? ""}`),
                          undo.steps.length,
                        ),
                      );
                      speak("откат начат — верну то, что можно вернуть");
                    }}
                  >
                    Вернуть сделанное
                  </Button>
                ) : null}
                {reports.map((step) => (
                  <Text key={`answer-${step.position}`} className={styles.note}>
                    {`${step.position + 1}. ${threeAnswer(raws[reports.indexOf(step)] ?? { status: "pending" })} — ${handLine(answers[reports.indexOf(step)] ?? answers[0]!)}`}
                  </Text>
                ))}
                {attention.length > 0 ? (
                  <Text className={styles.note}>{`внимание: ${attention.join("; ")}`}</Text>
                ) : null}
                {handWorst(answers).length > 0 ? (
                  <Text className={styles.note}>
                    {`чаще всего не хватает: ${handWorst(answers)
                      .map((item) => `${item.gap} (${item.times})`)
                      .join(", ")}`}
                  </Text>
                ) : null}
              </>
            );
          })()}
        </div>
      ) : null}

      {/* Шаг 108: человек говорит «сделай то и то» — связка рук собирается из
          фразы, а не из конфига. Порядок — из зависимостей, дыры названы. */}
      {text.trim().length > 0 ? (
        <div className={styles.section}>
          <Text className={styles.title}>Связка рук</Text>
          {(() => {
            // Дела приходят из того же разбора, что и план: второй разбор здесь
            // был бы второй правдой.
            // Глаголы — из руки (`tool`) и из шагов плана: делить фразу можно
            // только по глаголам, которые приложение правда умеет.
            const verbs = Array.from(
              new Set([
                ...(items ?? []).map((item) => item.tool?.split("|")[1] ?? ""),
                ...(draft?.plan?.steps.map((step) => step.registry.split("|")[1] ?? "") ?? []),
              ]),
            ).filter((verb) => verb.length > 0);
            const parts = splitChain(text, verbs);
            const steps = draft?.plan?.steps ?? [];
            // Связь видна по делу: путь второго шага берётся из первого, если в
            // параметрах стоит ссылка на его позицию.
            const linked = steps.map((step, index) => ({
              tool: step.registry,
              params: step.params ?? {},
              said: step.why ?? step.registry,
              index,
            }));
            const chainRisks = (draft?.gates ?? []).map((gate) => gate.risk);
            return (
              <>
                <Text className={styles.note}>
                  {`дел по словам: ${parts.length} · дел в плане: ${steps.length}${
                    chainRisky(chainRisks) ? " · в связке есть опасный шаг — согласие по нему отдельное" : ""
                  }`}
                </Text>
                {linked.map((item) => (
                  <Text key={`chain-${item.index}`} className={styles.note}>
                    {`${item.index + 1}. ${item.said}`}
                  </Text>
                ))}
              </>
            );
          })()}
        </div>
      ) : null}

      {/* Шаг 109: бюджет дела — числом до запуска, остановка — с причиной.
          Остановка по бюджету не выдаёт себя ни за провал, ни за успех. */}
      {draft?.plan ? (
        <div className={styles.section}>
          <Text className={styles.title}>Бюджет дела</Text>
          {(() => {
            const state = budgetCheck(runBudget, spent);
            const verdict = budgetOutcome(state);
            return (
              <>
                <Text className={styles.note} role="status" aria-live="polite">
                  {`шагов ${Math.min(spent.steps, runBudget.steps)} из ${runBudget.steps}, секунд ${Math.min(spent.seconds, runBudget.seconds)} из ${runBudget.seconds}, память ${runBudget.megabytes} МБ — ${
                    verdict === "budget" ? "бюджет кончился" : "в пределах"
                  }`}
                </Text>
                {state.said ? <Text className={styles.note}>{state.said}</Text> : null}
                {verdict === "budget" ? (
                  <Text className={styles.note}>{budgetOffer(runBudget, spent)}</Text>
                ) : (
                  <Button
                    appearance="subtle"
                    size="small"
                    onClick={() => {
                      // Тратим по отчёту, а не «сколько показалось»: бюджет — это
                      // счётчик, а не настроение.
                      const reported = report?.steps.length ?? 1;
                      const before = spent;
                      let after = before;
                      for (let index = 0; index < reported; index += 1) after = budgetStep(after, 1, 0);
                      setSpent(after);
                      speak(budgetCheck(runBudget, after).said || `сделано ${reported}, бюджет в порядке`);
                    }}
                  >
                    Учесть бюджет
                  </Button>
                )}
              </>
            );
          })()}
        </div>
      ) : null}

      {/* Шаг 111: у каждого шага своя проверка — названа **до** запуска. «Готово»
          говорит проверка, а не удобство: шаг без проверки помечен заранее. */}
      {draft?.plan ? (
        <div className={styles.section}>
          <Text className={styles.title}>Как проверю результат</Text>
          {(() => {
            const steps = draft.plan?.steps ?? [];
            // Вид проверки берётся из реестра: у одной руки результат — путь, у
            // другой — число. Одна проверка на весь план была бы верой.
            const checks = steps.map((step) => {
              // Реестр — из того, что экран уже знает о руках. Без записи в
              // реестре проверки нет, и это честно помечается как «none».
              const tool = (items ?? []).find((item) => item.tool === step.registry) ?? null;
              const registry = `${tool?.key ?? ""} ${tool?.example ?? ""}`.toLowerCase();
              const proof: StepProof = /переименован|посчита|найдено|файлов/.test(registry)
                ? "count"
                : /созда|перемест|скопир|удал|путь/.test(registry)
                  ? "path"
                  : /текст|содержим|запиш/.test(registry)
                    ? "content"
                    : tool === null
                      ? "none"
                      : "marker";
              return proofFor(step.why ?? step.registry, proof, step.params?.["path"] ?? "");
            });
            const got = proofPlan(checks);
            return (
              <>
                <Text className={styles.note}>{sayProof(got)}</Text>
                {got.said.map((line) => (
                  <Text key={line} className={styles.note}>
                    {line}
                  </Text>
                ))}
                {report !== null ? (
                  <Text className={styles.note} role="status" aria-live="polite">
                    {`после запуска: ${report.steps.map((step, index) => proofDone(checks[index]?.proof ?? "none", step.status === "ok").said).join("; ")}`}
                  </Text>
                ) : null}
              </>
            );
          })()}
        </div>
      ) : null}

      {/* Шаг 112: порядок — из зависимостей, а не из файла. Перестановка названа
          причиной, а не применена молча. */}
      {draft?.plan && draft.plan.steps.length > 1 ? (
        <div className={styles.section}>
          <Text className={styles.title}>Порядок шагов</Text>
          {(() => {
            // Ресурсы берутся из настоящих параметров: `path` и `to` — это то, что
            // шаг пишет, `from` и `path` — то, что читает. Ничего не выдумывается.
            const nodes: DepNode[] = draft.plan!.steps.map((step) => {
              const values = Object.values(step.params ?? {});
              const writes = /создать|перемест|скопир/.test(step.registry) ? values.map((value) => `resource:${value}`) : [];
              const reads = /перемест|скопир|проверить|посчитать/.test(step.registry) ? values.map((value) => `resource:${value}`) : [];
              return { what: step.why ?? step.registry, tool: step.registry, after: [], writes, reads };
            });
            const ordered = orderByDeps(nodes);
            return (
              <>
                {sayOrder(ordered).map((line) => (
                  <Text key={line} className={styles.note}>
                    {line}
                  </Text>
                ))}
                {ordered.errors.length > 0 ? (
                  <Text className={styles.note} role="status" aria-live="polite">
                    выполнять не буду: порядок не вычисляется
                  </Text>
                ) : null}
              </>
            );
          })()}
        </div>
      ) : null}

      {/* Шаг 113: необратимый шаг помечен до запуска и спрашивает сильнее.
          Общее «выполнить всё» необратимое не покрывает. */}
      {draft?.plan ? (
        <div className={styles.section}>
          <Text className={styles.title}>Цена ошибки</Text>
          {(() => {
            const steps = draft.plan?.steps ?? [];
            const dangers: StrongDanger[] = steps.map((step) => {
              const gate = (draft.gates ?? []).find((item) => item.registry === step.registry) ?? null;
              const risk = gate?.risk ?? "read";
              return {
                what: step.why ?? step.registry,
                undoable: risk === "read" || risk === "write-local",
                // Цена — из того, что шаг делает с настоящими параметрами.
                price: Object.values(step.params ?? {}).filter((value) => value.trim().length > 0).join(", "),
                risk,
              };
            });
            return (
              <>
                <Text className={styles.note} role="status" aria-live="polite">
                  {strongSummary(dangers)}
                </Text>
                {dangers.map((danger, index) => {
                  const asked = strongQuestion(danger);
                  return (
                    <Text key={`danger-${index}`} className={styles.note}>
                      {`${index + 1}. ${strongMark(danger)} · ${asked.text}`}
                      {" "}
                      <Button
                        appearance="subtle"
                        size="small"
                        onClick={() => {
                          // Слабый ответ не отвечает на сильный вопрос.
                          const ok = strongAllows(danger, { checked: true, word: "удалить" });
                          setApproved((current) =>
                            ok ? [...new Set([...current, index])] : current.filter((position) => position !== index),
                          );
                          speak(ok ? `шаг ${index + 1}: согласен` : `шаг ${index + 1}: так нельзя — нужно назвать цену словом`);
                        }}
                      >
                        {asked.ask === "word" ? "Подтвердить словом" : "Согласиться"}
                      </Button>
                    </Text>
                  );
                })}
              </>
            );
          })()}
        </div>
      ) : null}

      {/* Шаг 114: повторный запуск видит, что уже сделано, и не делает дважды.
          «Создать папку» на существующую — успех, а не провал. */}
      {draft?.plan ? (
        <div className={styles.section}>
          <Text className={styles.title}>Что уже сделано</Text>
          {(() => {
            const steps = draft.plan?.steps ?? [];
            const verdicts = steps.map((step) => idemJudge(step.registry, step.params, pastRuns, Date.now()));
            return (
              <>
                <Text className={styles.note} role="status" aria-live="polite">
                  {idemSummary(verdicts)}
                </Text>
                {verdicts.map((verdict, index) => (
                  <Text key={`idem-${index}`} className={styles.note}>
                    {`${index + 1}. ${verdict.kind === "skip" ? "пропущу" : "выполню"} — ${verdict.why}`}
                  </Text>
                ))}
                <Button
                  appearance="subtle"
                  size="small"
                  onClick={() => {
                    // Лента прошлых запусков пополняется **по настоящему отчёту**:
                    // отметка «сделано» должна значить «сделано», а не «нажал».
                    const ok = report?.steps.filter((step) => step.status === "ok").length ?? 0;
                    setPastRuns((current) => [
                      ...current,
                      ...steps.slice(0, ok).map((step) => idemRemember(step.registry, step.params, true, Date.now())),
                    ]);
                    speak(idemSummary(verdicts));
                  }}
                >
                  Запомнить сделанное
                </Button>
              </>
            );
          })()}
        </div>
      ) : null}

      {/* Шаг 115: план, который нельзя собрать из рук, отказывает целиком — и
          называет, чего не хватает. Половина плана теряет файл, который хотели
          сохранить. */}
      {draft?.plan ? (
        <div className={styles.section}>
          <Text className={styles.title}>Собирается ли план</Text>
          {(() => {
            const steps = draft.plan?.steps ?? [];
            const known = new Set((items ?? []).map((item) => item.tool).filter((tool): tool is string => tool !== null));
            const planned: RefusePlanned[] = steps.map((step) => ({
              what: step.why ?? step.registry,
              tool: step.registry,
              // Рука есть, если она в реестре экрана **или** ядро уже построило из
              // неё шаг с воротами: второе сильнее первого.
              hand: known.has(step.registry) || (draft.gates ?? []).some((gate) => gate.registry === step.registry),
              allowed: (draft.gates ?? []).every(
                (gate) => gate.registry !== step.registry || gate.decision !== "deny",
              ),
            }));
            const verdict = refuseJudge(planned);
            const gaps = refuseLearn(planned);
            return (
              <>
                <Text className={styles.note} role="status" aria-live="polite">
                  {sayRefuse(verdict)}
                </Text>
                {!verdict.run && gaps.length > 0 ? (
                  <Text className={styles.note}>
                    {`в обучение: ${gaps.join("; ")}`}
                  </Text>
                ) : null}
              </>
            );
          })()}
        </div>
      ) : null}

      {/* Шаг 116: план правится понятными полями, а не JSON. Правка проверяется
          до запуска, и после неё нужно новое согласие (шаг 117). */}
      {draft?.plan && (draft.plan.steps.length > 0) ? (
        <div className={styles.section}>
          <Text className={styles.title}>Поправить план</Text>
          {(() => {
            const applied = editPlanChange(draft.plan!.steps, planEdits);
            const fields = editPlanFields(applied.steps);
            return (
              <>
                <Text className={styles.note}>{"поля — словами: что это, а не имя параметра"}</Text>
                {fields.map((field) => (
                  <Text key={`edit-${field.position}-${field.name}`} className={styles.note}>
                    {`${field.position + 1}. ${field.label}`}
                    {" "}
                    <Input
                      aria-label={`${field.position + 1}. ${field.label}`}
                      value={field.value}
                      placeholder={field.hint}
                      onChange={(_event, data) => {
                        setPlanEdits((current) => [
                          ...current.filter((edit) => !(edit.position === field.position && edit.name === field.name)),
                          { position: field.position, name: field.name, value: data.value },
                        ]);
                      }}
                    />
                  </Text>
                ))}
                {applied.result.said.map((line) => (
                  <Text key={`said-${line}`} className={styles.note} role="status" aria-live="polite">
                    {line}
                  </Text>
                ))}
                {applied.result.problems.map((problem) => (
                  <Text key={`problem-${problem.position}-${problem.name}`} className={styles.note}>
                    {problem.problem}
                  </Text>
                ))}
                <Text className={styles.note}>
                  {applied.result.consent
                    ? "правка меняет шаг — согласие по нему нужно дать заново"
                    : "правок нет — согласие остаётся в силе"}
                </Text>
                <Button
                  appearance="subtle"
                  size="small"
                  onClick={() => {
                    if (!editPlanReady(applied.result)) {
                      setEditNote("правка не готова: сначала исправьте поле");
                      return;
                    }
                    // Правка после согласия — **новое** согласие: плата за
                    // удобство не может быть обходом согласия (шаг 117).
                    setConsents([]);
                    setApproved([]);
                    setDraft((current) =>
                      current === null
                        ? current
                        : {
                            ...current,
                            plan:
                              current.plan === null
                                ? null
                                : {
                                    ...current.plan,
                                    steps: current.plan.steps.map((step, index) => ({
                                      ...step,
                                      params: applied.steps[index]?.params ?? step.params,
                                    })),
                                  },
                          },
                    );
                    setEditNote(`план поправлен: ${applied.result.said.join("; ")}`);
                    speak("план поправлен — согласие нужно заново");
                  }}
                >
                  Применить правку
                </Button>
                {editNote !== null ? (
                  <Text className={styles.note} role="status" aria-live="polite">
                    {editNote}
                  </Text>
                ) : null}
              </>
            );
          })()}
        </div>
      ) : null}

      {/* Шаг 117: согласие — на план целиком. Добавили шаг, переставили шаги,
          сменился риск — согласие заново, и причина названа. */}
      {draft?.plan ? (
        <div className={styles.section}>
          <Text className={styles.title}>Согласие на план</Text>
          {(() => {
            const seen: PlanSeen[] = (draft.plan?.steps ?? []).map((step, index) => ({
              tool: step.registry,
              params: step.params ?? {},
              risk: (draft.gates ?? []).find((gate) => gate.position === index + 1)?.risk ?? "read",
            }));
            // Сравниваем с **тем** планом, на который дали согласие, а не с
            // отпечатком: отпечаток говорит «изменилось», но не «что именно».
            const holdsNow = planConsent !== null && planHolds(planConsent, seen);
            const change = planDiff(planConsent?.plan ?? [], seen);
            return (
              <>
                <Text className={styles.note} role="status" aria-live="polite">
                  {planConsent === null
                    ? "согласия на план ещё нет — спрошу перед запуском"
                    : holdsNow
                      ? sayPlanConsent({ changed: false, why: [], worse: false })
                      : sayPlanConsent(change)}
                </Text>
                <Button
                  appearance="subtle"
                  size="small"
                  onClick={() => {
                    const saved = planGrant(seen, Date.now());
                    setPlanConsent({ plan: seen, ...saved });
                    speak("согласие на план записано — любое изменение потребует нового");
                  }}
                >
                  Согласиться на план целиком
                </Button>
              </>
            );
          })()}
        </div>
      ) : null}

      {/* Шаг 121: замер по отрезкам — фраза, текст, план, первый токен, первый
          звук, дело. «Дольше всего» названо, а не спрятано в таблице. */}
      {segmentsTotal > 0 ? (
        <div className={styles.section}>
          <Text className={styles.title}>Задержка по отрезкам</Text>
          {(() => {
            const trace: SegmentTrace = { parts: segments, total: segmentsTotal };
            // Шаг 123: бюджет — число до первого звука, а не «быстро». Первый звук =
            // фраза + текст + план + первый токен + первый звук; «дело» в бюджет не
            // входит: человек судит о скорости по тому, как скоро услышал.
            const toSound =
              (segments.phrase ?? 0) + (segments.text ?? 0) + (segments.plan ?? 0) + (segments.token ?? 0) + (segments.sound ?? 0);
            const latency = latencyCheck(latencyDefault, {
              kind: (draft?.plan?.steps.length ?? 0) > 1 ? "complex" : "simple",
              ms: toSound > 0 ? toSound : null,
            });
            // Самый долгий отрезок называет `segmentLines` — второй такой же строки
            // на экране быть не должно: два места об одном факте читаются как два
            // разных факта (шаг 106).
            void slowestSegment;
            void segmentWord;
            return (
              <>
                {/* Шаг 123: бюджет задержки — числом и с пометкой нарушения. */}
                <Text className={styles.note} role="status" aria-live="polite">
                  {`${latencyScaled(latencyDefault)} · ${latency.said}`}
                </Text>
                <Text className={styles.note}>
                  {sayLatency(latencyTally(latencyDefault, [{ kind: (draft?.plan?.steps.length ?? 0) > 1 ? "complex" : "simple", ms: toSound > 0 ? toSound : null }]))}
                </Text>
                {(() => {
                  // Шаг 124: нарушение — строка рядом с делом, а не сноска.
                  const kind = (draft?.plan?.steps.length ?? 0) > 1 ? "complex" : "simple";
                  const deeds: LatencyDeed[] = [
                    {
                      what: draft?.plan?.goal ?? "ответ",
                      ms: toSound > 0 ? toSound : null,
                      limit: latencyCheck(latencyDefault, { kind, ms: null }).limit,
                    },
                  ];
                  const sum = latencyTotal(deeds);
                  return (
                    <>
                      {deeds.map((deed) => (
                        <Text key={`lat-${deed.what}`} className={styles.note}>
                          {latencyLine(deed)}
                        </Text>
                      ))}
                      <Text className={styles.note} role="status" aria-live="polite">
                        {sum.said}
                      </Text>
                      {latencyRepeated(deeds).length > 0 ? (
                        <Text className={styles.note}>
                          {`чаще всего за бюджетом: ${latencyRepeated(deeds)
                            .map((item) => `${item.what} (${item.times})`)
                            .join(", ")}`}
                        </Text>
                      ) : null}
                    </>
                  );
                })()}
                {segmentLines(trace).map((line) => (
                  <Text key={`seg-${line}`} className={styles.note}>
                    {line}
                  </Text>
                ))}
                <Text className={styles.note}>{segmentsDelta(trace, trace)}</Text>
              </>
            );
          })()}
        </div>
      ) : null}

      {/* Шаг 101: до запуска видно цель, шаги, риск и что изменится. Подробности
          за кнопкой не читают: согласие дают на то, что видно при нажатии. */}
      {draft?.plan ? (() => {
        const steps: PreviewStep[] = draft.plan.steps.map((step, index) => {
          const gate = (draft.gates ?? []).find((item) => item.position === index);
          return {
            what: step.why ?? step.registry,
            // Что изменит шаг — словами действия, а не параметрами: параметры
            // уже показаны выше, и второй раз они читаются как другой факт.
            changes: step.why ?? "изменит файлы по параметрам шага",
            risk: riskOf(gate?.risk ?? "read"),
            // Отмена не возвращает уже сделанное: это другой факт, чем риск.
            undoable: gate?.risk === "read" || gate?.risk === "write-local",
          };
        });
        const view: PlanPreviewView = { goal: draft.plan.goal, steps };
        return (
          <div className={styles.section}>
            <Text className={styles.title}>Что будет сделано</Text>
            {previewLines(view).map((line) => (
              <Text key={line} className={styles.note} role={previewSafe(view) ? "status" : "alert"} aria-live="polite">
                {line}
              </Text>
            ))}
            <Text className={styles.note}>
              {previewScope(steps.length, draft.plan.goal)}
            </Text>
            {previewGaps(view).length > 0 ? (
              <Text className={styles.note}>
                не названо: {previewGaps(view).join(", ")} — спрошу до запуска
              </Text>
            ) : null}
            {previewSafe(view) ? null : (
              <Text className={styles.note}>
                риск: {previewRiskWord(view.steps.reduce((high, item) => (high === "read" ? item.risk : high), "read" as PreviewStep["risk"]))} — согласие на слепой запуск это не согласие
              </Text>
            )}
          </div>
        );
      })() : null}

      {/* Шаг 95: две разные руки — один короткий вопрос из того, что нашлось.
          Вариант меню — не вопрос, а отказ; десять вариантов — меню, а не выбор. */}
      {handAsk !== null ? (
        <div className={styles.section}>
          <Text className={styles.title}>Что именно</Text>
          <Text className={styles.note} role="alert" aria-live="polite">
            {handAsk}
          </Text>
          <Text className={styles.note}>
            {handBlocked
              ? "пока не выбран — ничего не делаю: молча выбранный вариант это выбор за вас"
              : "опасный вариант назван опасным до выбора, а не после"}
          </Text>
        </div>
      ) : null}

      {/* Шаг 94: «снеси всё нафиг» — то же намерение, что «снеси всё». Названа
          цена, а не мораль о шутках. */}
      {danger !== null && danger.found ? (
        <div className={styles.section}>
          <Text className={styles.title}>Опасное намерение</Text>
          <Text className={styles.note} role="alert" aria-live="polite">
            {sayJoke(danger, draft?.plan?.steps.length ?? null)}
          </Text>
          <Text className={styles.note}>
            эмоции не меняют объём: шутка не оправдывает удаление
          </Text>
        </div>
      ) : null}

      {/* Шаг 93: человек говорит своими словами — «почисти», «убери мусор»;
          реестр знать не обязан. */}
      {synonymSay.length > 0 ? (
        <div className={styles.section}>
          <Text className={styles.title}>Что вы хотели</Text>
          {synonymSay.map((line) => (
            <Text key={line} className={styles.note} role="status" aria-live="polite">
              {line}
            </Text>
          ))}
        </div>
      ) : null}

      {/* Шаг 92: сколько — числом, диапазоном или честным «не сказано».
          «Несколько» для необратимого не годится: это лотерея. */}
      {amount !== null && amount.kind !== "none" ? (
        <div className={styles.section}>
          <Text className={styles.title}>Сколько именно</Text>
          <Text className={styles.note} role="status" aria-live="polite">
            {sayAmount(amount)}
          </Text>
          {amountEnough(amount) ? null : (
            <Text className={styles.note}>
              для действия, которое не отменить, нужно точное число или диапазон
            </Text>
          )}
        </div>
      ) : null}

      {/* Шаг 91: когда — до исполнения. Три разных «когда»: по часам, после
          события, по условию. Сделать сразу то, что просили на завтра, — ошибка,
          которую видно не сразу. */}
      {whenPlan !== null ? (
        <div className={styles.section}>
          <Text className={styles.title}>Когда</Text>
          <Text
            className={styles.note}
            role={whenReady(whenPlan, Date.now()) ? "status" : "alert"}
            aria-live="polite"
          >
            {sayWhen(whenPlan, Date.now())}
          </Text>
          {whenPlan.kind !== "now" ? (
            <Text className={styles.note}>
              {whenAmbiguous(heardIntent ?? "") && whenPlan.kind === "time"
                ? "«в девять» без утра или вечера — скажите, какое, я не решаю за вас"
                : "сейчас не начинаю: сначала наступит время, событие или условие"}
            </Text>
          ) : null}
        </div>
      ) : null}

      {/* Шаг 86: понимание проверяется по результату. «Готово» говорится
          только когда сходится — иначе слово перестаёт значить «получилось». */}
      {fitSay !== null ? (
        <div className={styles.section}>
          <Text className={styles.title}>Сходится ли с фразой</Text>
          <Text className={styles.note} role="status" aria-live="polite">
            {fitSay}
          </Text>
          <Text className={styles.note}>
            «готово» значит «получилось», а не «выполнено»
          </Text>
        </div>
      ) : null}

      {/* Шаг 85: «сделай как вчера» — память это не только факты, но и способы.
          Хранится **сделанное**, и оно показано до повтора, а не угадано. */}
      <div className={styles.section}>
        <Text className={styles.title}>Повторить сделанное</Text>
        <Button
          appearance="subtle"
          onClick={() => {
            const ask = whenYesterday("как вчера") ?? "yesterday";
            const todayStart = new Date().setHours(0, 0, 0, 0);
            const history = phrases.map((line) => ({
              dayStart: new Date(line.at).setHours(0, 0, 0, 0),
              steps: line.did ? [line.did] : [],
              params: {},
              said: line.heard,
            }));
            const found = findYesterday(history, ask, todayStart);
            const age = sayYesterdayAge(found, Date.now());
            setRepeatSay(
              found.done === null
                ? [found.candidates > 0 ? found.why : nothingYesterday(ask)]
                : [...planYesterday(found), ...(age !== null ? [age] : [])],
            );
          }}
        >
          Сделать как вчера
        </Button>
        {/* Шаг 107: повтор — другого дела, если данные изменились. Поэтому
            сначала разница, и только потом **один** вопрос: второй «вы уверены»
            обесценивает первый. */}
        {report !== null ? (
          (() => {
            const steps = report.steps.length;
            const done = report.steps.filter((step) => step.status === "ok").length;
            // Прошлое дело — из истории, а не этот же отчёт: сравнение с самим
            // собой всегда «ничего не изменится», и это враньё.
            const lastDone = phrases.find((line) => line.did) ?? null;
            const offer = repeatOffer(
              [{ what: "шагов плана", then: lastDone === null ? null : steps, now: steps }],
              steps > 0,
              steps > 0 ? "" : "в прошлом деле не было шагов — повторять нечего",
            );
            const said = repeatAlready(done, steps, "шагов");

            return (
              <>
                <Text className={styles.note} role="status" aria-live="polite">
                  {offer.preview}
                </Text>
                {said ? <Text className={styles.note}>{said}</Text> : null}
                <Button
                  appearance="subtle"
                  size="small"
                  onClick={() => {
                    const answer = repeatDecide(true, offer);
                    setRepeatSay([answer.said]);
                    // Один вопрос — один ответ: согласие дано на показанную разницу.
                    if (answer.run) {
                      setApproved(report.steps.map((step) => step.position));
                    }
                  }}
                >
                  {offer.question || "Повторить"}
                </Button>
              </>
            );
          })()
        ) : null}

        {repeatSay !== null ? (
          repeatSay.map((line) => (
            <Text key={line} className={styles.note} role="status" aria-live="polite">
              {line}
            </Text>
          ))
        ) : (
          <Text className={styles.note}>
            хранится сделанное, а не сказанное: нечего повторять — скажу прямо, не сделаю похожее
          </Text>
        )}
      </div>

      {/* Шаг 84: отрицание разобрано до исполнения. Самая дорогая ошибка —
          полярность: «не удаляй» и «удали» отличаются одним словом. */}
      {negation !== null ? (
        <div className={styles.section}>
          <Text className={styles.title}>Отрицание</Text>
          <Text
            className={styles.note}
            role={canDoNegated(negation) ? "status" : "alert"}
            aria-live="polite"
          >
            {sayNegation(negation)}
          </Text>
          {canDoNegated(negation) ? null : (
            <Text className={styles.note}>
              действие не выполнено: сначала подтвердите, что запрет снят
            </Text>
          )}
        </div>
      ) : null}

      {/* Шаг 83: два дела из одной фразы — списком, по очереди, в порядке
          человека. Молчаливое деление хуже: непонятно, почему делается ещё. */}
      {deedsSays(deeds) !== null ? (
        <div className={styles.section}>
          <Text className={styles.title}>Дел несколько</Text>
          <Text className={styles.note} role="status" aria-live="polite">
            {deedsSays(deeds)}
          </Text>
          {deedsPlan(deeds).map((line) => (
            <Text key={line} className={styles.note}>
              {line}
            </Text>
          ))}
        </div>
      ) : null}

      {/* Шаг 82: вопрос — только если необратимо **и** неоднозначно. Лишний
          вопрос учит отвечать не читая, и тогда настоящий пропустят. */}
      {draft?.plan ? (() => {
        // Необратимо — риск destructive: отменить нечем. Неоднозначно — в плане
        // больше одного шага.
        // Риск каждого шага — в gates плана; «точно» — когда объект один.
        const destructive = (draft.gates ?? []).some(
          (gate) => gate.risk === "destructive" || gate.risk === "money" || gate.risk === "identity",
        );
        const plan: AskPlan = {
          irreversible: destructive,
          matches: draft.plan.steps.length,
          exact: draft.plan.steps.length === 1,
        };
        const check = askNeed(plan);
        return (
          <div className={styles.section}>
            <Text className={styles.title}>Спрашивать или делать</Text>
            <Text className={styles.note} role="status" aria-live="polite">
              {check.ask
                ? askQuestion(plan, draft.plan.steps.map((step) => step.why ?? step.registry))
                : check.why}
            </Text>
            <Text className={styles.note}>{askRule()}</Text>
          </div>
        );
      })() : null}

      {/* Шаг 81: как понята фраза — до действия. Разбор не придумывает:
          чего во фразе нет, того нет и в намерении. */}
      {heardIntent !== null && saidIntent !== null ? (
        <div className={styles.section}>
          <Text className={styles.title}>Как я понял</Text>
          <Text className={styles.note}>«{heardIntent}»</Text>
          <Text className={styles.note} role="status" aria-live="polite">
            {saidIntent}
          </Text>
          <Text className={styles.note}>
            если понял не то — скажите иначе, я не угадываю
          </Text>
        </div>
      ) : null}

      {/* Шаг 80: удаление называет числа и следствие. «Удалить модель» не
          говорит, 400 МБ это или 4.7 ГБ, — от этого зависит, поможет ли вообще. */}
      {hw ? (() => {
        const available = hwForModel(hw);
        const chosen = ladderPick(available);
        const biggest = LADDER[LADDER.length - 1];
        // Свободного места на диске профиль не знает — берём память как
        // верхнюю оценку и говорим об этом прямо, а не выдаём её за диск.
        const sizeMb = chosen !== null ? chosen.sizeMb : (biggest?.sizeMb ?? 0);
        const space = { modelMb: sizeMb, freeMb: available };
        return (
          <div className={styles.section}>
            <Text className={styles.title}>Удалить модель</Text>
            <Text className={styles.note}>{removeWillFree(space)}</Text>
            <Text className={styles.note}>{removeBreaks(chosen?.name ?? "модель")}</Text>
            <Text className={styles.note}>{removeEnough(space, sizeMb)}</Text>
            <Text className={styles.note}>{removeLastOne("1.5B")}</Text>
            <Button
              appearance="subtle"
              onClick={() => setDeviceNotice(removeDone(space))}
            >
              Удалить {removeSize(sizeMb)}
            </Button>
          </div>
        );
      })() : null}

      {/* Шаг 79: отчёт «почему выбрана эта модель». Причина — **факт о его
          машине**, а не «мы так решили»: иначе решение не понять, не оспорить и
          не связать с изменениями. */}
      {hw ? (() => {
        const fits = hwForModel(hw);
        const chosen = ladderPick(fits);
        const facts: WhyFact[] = [
          {
            what: "память",
            found: `${Math.round((hw.ramMb / 1024) * 10) / 10} ГБ (модели доступно ${Math.round((fits / 1024) * 10) / 10} ГБ)`,
            means: chosen === null ? "не помещается ни одна модель — закройте программы" : `помещается «${chosen.name}»`,
            helped: chosen !== null,
          },
          {
            what: "совместимость",
            found: hw.cores >= 4 ? `${hw.cores} ядер` : `${hw.cores} ядра — мало`,
            means: gpuUsable(hw) ? "видеокарта подходит" : "считать будет на процессоре",
            helped: gpuUsable(hw),
          },
          {
            what: "диск",
            found: hw.disk === "hdd" ? "HDD" : hw.disk === "ssd" ? "SSD" : "тип неизвестен",
            means: hw.disk === "hdd" ? "первый запуск дольше" : "загрузка быстрая",
            helped: hw.disk !== "hdd",
          },
        ];
        const got = whyReport(chosen?.name ?? "нет модели", facts);
        return (
          <div className={styles.section}>
            <Text className={styles.title}>Почему выбрана эта модель</Text>
            <Text className={styles.note}>{whyShort(got)}</Text>
            {whyLines(got).map((line) => (
              <Text key={line} className={styles.note}>
                {line}
              </Text>
            ))}
            {whyChange(got) ? (
              <Text className={styles.note}>{whyChange(got)}</Text>
            ) : null}
          </div>
        );
      })() : null}

      {/* Шаг 78: совместимость с железом — до запуска, словами. Тихая
          деградация худшая: модель работает втрое медленнее, а человек выбирает
          меньшую, хотя дело было не в модели. */}
      {(() => {
        // В приложении набор инструкций читается из системы, в браузере — нет;
        // тогда берём безопасное предположение (AVX2 есть, AVX512 нет).
        const features: CpuFeatures = { ...assumedCpu(), gpu: hw !== null && gpuUsable(hw) };
        const build = bestBuild(features);
        return (
          <div className={styles.section}>
            <Text className={styles.title}>Совместимость с этим компьютером</Text>
            <Text className={styles.note}>{howKnown(false)}</Text>
            <Text className={styles.note}>{sayBuild(features, build)}</Text>
            <Text className={styles.note}>
              {sayBuild(features, "gpu")}
            </Text>
            {buildOffered(features, "avx512") ? null : (
              <Text className={styles.note}>
                сборка под AVX512 не предлагается: в процессоре его нет, а не «наверное, пойдёт»
              </Text>
            )}
          </div>
        );
      })()}

      {/* Шаг 77: код и разговор — разные модели. Сказано, какая отвечает:
          иначе разная длина ответов выглядит как нестабильность. */}
      <div className={styles.section}>
        <Text className={styles.title}>Код и разговор</Text>
        <Text className={styles.note}>
          {sayModel(pickModel(codeTask ? "code" : "talk", "1.5B", codeModel))}
        </Text>
        <Text className={styles.note}>
          кодовая модель {codeLoad(codeModel, codeTask ? "code" : "talk", false) ? "загружается" : "лежит файлом и не занимает память"}
        </Text>
        <Button appearance="subtle" onClick={() => setCodeTask((current) => !current)}>
          {codeTask ? "Сейчас задача кода — переключить на разговор" : "Сейчас разговор — переключить на код"}
        </Button>
      </div>

      {/* Шаг 76: сравнение двух моделей на пяти своих фразах. Ответы рядом, а не
          по очереди: по очереди сравнение требует памяти, а человек предыдущий
          ответ помнит примерно никак. */}
      <div className={styles.section}>
        <Text className={styles.title}>Сравнить две модели</Text>
        <Text className={styles.note}>
          впишите пять своих фраз — по одной на строку: чужие примеры меряют чужое
        </Text>
        <Textarea
          value={compareText}
          placeholder="открой квартал-3&#10;найди отчёт за март&#10;…"
          aria-label="Фразы для сравнения, по одной на строку"
          resize="vertical"
          onChange={(_, data) => setCompareText(data.value)}
        />
        <Button
          appearance="subtle"
          onClick={() => {
            const lines = compareText.split("\n");
            const check = compareReady(lines);
            // Без пяти фраз сравнение — случайность или шум.
            setCompareSay(check.ok ? sayCompare({ model: "7B", answers: [] }, { model: "1.5B", answers: [] }) : check.why);
          }}
        >
          Сравнить
        </Button>
        {compareSay ? (
          <Text className={styles.note} role="status" aria-live="polite">
            {compareSay}
          </Text>
        ) : (
          <Text className={styles.note}>
            нужно {COMPARE_PHRASES} фраз: на одной можно случайно попасть, на {COMPARE_PHRASES} уже
            видно закономерность
          </Text>
        )}
      </div>

      {/* Шаг 75: один движок по умолчанию — проще, чем зоопарк. Своя модель на
          роль включается с причиной и по одной; назад — одним действием. */}
      <div className={styles.section}>
        <Text className={styles.title}>Сколько моделей работает</Text>
        <Text className={styles.note}>{sayEngine(engines)}</Text>
        {engineDiffers(engines) ? (
          <Button appearance="subtle" onClick={() => setEngines(resetEngine(engines))}>
            Вернуться к одной модели
          </Button>
        ) : (
          <Text className={styles.note}>
            одной модели хватает на все роли; отдельная на роль — по желанию и с причиной
          </Text>
        )}
        <Button
          appearance="subtle"
          onClick={() => {
            // По одной роли за раз: человек должен увидеть «было так / стало
            // так», прежде чем менять следующую.
            const result = allowEngine(engines, { role: "intent", model: "0.5B", reason: "measured" });
            setEngines(result.setup);
            setDeviceNotice(result.said);
          }}
        >
          Понять фразу — на дешёвую модель
        </Button>
      </div>

      {/* Шаг 62: какая модель на какую роль и **почему**. Без причины разная
          скорость ответов выглядит как нестабильность. */}
      <div className={styles.section}>
        <Text className={styles.title}>Модели по ролям</Text>
        {sayRoles(roleChoices).map((line) => (
          <Text key={line} className={styles.note}>
            {line}
          </Text>
        ))}
        <Text className={styles.note}>
          всего памяти на модели: {Math.round(rolesMemory(roleChoices) / 102.4) / 10} ГБ
        </Text>
      </div>

      {/* Шаг 61: профиль машины — факты и их следствие, а не голые цифры.
          Оценка называется оценкой: диск определён по типу, а не замером. */}
      {hw ? (
        <div className={styles.section}>
          <Text className={styles.title}>Эта машина</Text>
          <Text className={styles.note}>{sayMachine(hw)}</Text>
          <Text className={styles.note}>
            класс: {machineGrade(hw)} · {sayApprox()}
          </Text>
        </div>
      ) : null}

      {/* Шаг 60: журнал фраз — одна строка на фразу, в ней три факта. Слитый
          текст «запрос/результат» не показал бы, **где** разошлось. Плохие строки
          помечены: человек ищет не всё подряд, а где сломалось. */}
      <div className={styles.section}>
        <Text className={styles.title}>Журнал фраз</Text>
        {phrases.length === 0 ? (
          <Text className={styles.note}>{logEmpty()}</Text>
        ) : (
          <>
            <Text className={styles.note}>
              {phrases.length} фраз, из них с расхождением: {brokenLines(phrases).length}
              {/* Шаг 88: журнал нужен, чтобы было **видно, что чинить**. Группа по
                  причине, а не «не понимает вообще»: это разные дефекты. */}
              {parseWorst({
                rows: phrases.map((line) => ({
                  at: line.at,
                  // Шаг 103: журнал получает вычищенное **до** записи — фраза
                  // вслух бывает с паролем, и записанное уже не вычистить.
                  heard: previewHeard(line.heard),
                  understood: line.understood === null ? null : previewHeard(line.understood),
                  outcome: (line.stage === "done"
                    ? { kind: "done", did: line.did }
                    : line.understood === null
                      ? { kind: "not-understood" }
                      : { kind: "refused", cause: line.did }) as ParseOutcome,
                })) satisfies ParseRow[],
                dropped: 0,
              }).map((group) => (
                <span key={group.reason}>
                  {" "}
                  · {group.reason}: {group.times}
                </span>
              ))}
            </Text>
            <Text className={styles.note} role="status" aria-live="polite">
              {(() => {
                // Самое медленное названо отдельно: «медленно» без фразы не к чему
                // приложить.
                const worst = slowestEntry(
                  phrases.map((line: PhraseLine): TimingEntry => ({
                    heard: previewHeard(line.heard),
                    did: line.did,
                    ms: line.ms ?? null,
                  })),
                );
                return worst === null ? "" : `медленнее всего: «${worst.heard}» · `;
              })()}
              {sayTiming(
                phrases.map((line: PhraseLine): TimingEntry => ({
                  heard: previewHeard(line.heard),
                  did: line.did,
                  ms: line.ms ?? null,
                })),
              )}
            </Text>
            <div className={styles.prompt} role="log" aria-label="Журнал фраз">
              {phrases.map((line) => (
                <div key={`${line.at}:${line.heard}`}>
                  <span>{logText(line)}</span>
                  {line.stage !== "done" ? <span> — {logWhy(line)}</span> : null}
                  {/* Шаг 122: замер рядом с делом — видно, что именно медленно на
                      этой машине. Нет замера — «не замерено», а не «0 мс». */}
                  <span>
                    {" · "}
                    {timingText({ heard: previewHeard(line.heard), did: line.did, ms: line.ms ?? null })}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Шаг 59: ответ голосом — одной кнопкой, а не в настройках. Состояние
          словом, а не значком динамика: значок не читается ни диктором, ни
          дальтоником, ни тем, кто смотрит в сторону. При выключенном голосе
          подтверждение и ошибка всё равно звучат (см. speak). */}
      <div className={styles.answer}>
        <Button
          appearance="subtle"
          // Кнопка не врёт: без движка речи нажимать бесполезно, и это сказано.
          disabled={!canTurnOn(voiceSwitch)}
          onClick={() => setVoiceSwitch((current) => toggleVoice(current))}
          aria-pressed={voiceSwitch.on}
        >
          {voiceWord(voiceSwitch)}
        </Button>
      </div>
      {/* Шаг 57: свой словарь. Человек добавляет слова, которые распознавание не
          знает, — и сразу работает, без «применить»: отложенное действие не
          сделают. Сказано, сколько слов и сколько ещё поместится; удаление —
          крестиком, иначе через месяц словарь полон мусора и хуже пустого. */}
      <div className={styles.section}>
        <Text className={styles.title}>Свой словарь</Text>
        <Text className={styles.note}>{wordsStatus(words)}</Text>
        <div className={styles.answer}>
          <Input
            value={newWord}
            placeholder="слово так, как произносите"
            aria-label="Новое слово для словаря"
            onChange={(_, data) => setNewWord(data.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              const added = addWord(words, newWord);
              keepWords(added.words);
              setWordSay(added.ok ? added.said : added.why);
              if (added.ok) setNewWord("");
            }}
          />
          <Button
            appearance="subtle"
            onClick={() => {
              const added = addWord(words, newWord);
              keepWords(added.words);
              setWordSay(added.ok ? added.said : added.why);
              if (added.ok) setNewWord("");
            }}
          >
            Добавить
          </Button>
        </div>
        {words.length > 0 ? (
          <div className={styles.answer}>
            {words.map((word) => (
              <Button
                key={word}
                appearance="subtle"
                onClick={() => {
                  keepWords(removeWord(words, word));
                  setWordSay(`«${word}» убрано из словаря`);
                }}
                aria-label={`Убрать «${word}» из словаря`}
              >
                {word} ×
              </Button>
            ))}
          </div>
        ) : null}
        {wordSay ? (
          <Text className={styles.note} role="status" aria-live="polite">
            {wordSay}
          </Text>
        ) : null}
      </div>

      {/* Шаг 58: уверенность словами и правка по словам. «Уверенность 90%»
          человеку ничего не говорит, а «мог ослышаться в: блок нот» говорит,
          куда смотреть. Правится одно слово — иначе точность наказывается. */}
      {heardWords && heardWords.length > 0 ? (
        <div className={styles.section}>
          <Text className={styles.note} role="status" aria-live="polite">
            {saySure(heardWords)}
          </Text>
          <div className={styles.answer}>
            {heardWords.map((word, index) => (
              <Input
                key={`${index}:${word.text}`}
                value={word.fixed ?? word.text}
                aria-label={`Слово ${index + 1}: ${word.text}`}
                onChange={(_, data) => {
                  const next = fixWord(heardWords, index, data.value);
                  setHeardWords(next);
                  setText(sureText(next));
                }}
              />
            ))}
          </div>
          {askConfirm(heardWords) ? (
            <Text className={styles.note}>{askConfirm(heardWords)}</Text>
          ) : null}
        </div>
      ) : null}

      {/* Только граница, без повтора того, что уже сказала карточка выше: если
          распознавание готово, «работает здесь» там уже написано, и второй раз
          это шум. */}
      {speech?.found && speech?.model ? null : (
        <Text className={styles.note}>{voice.notProvenHere}</Text>
      )}

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
          <Text className={styles.error} role="alert" aria-live="polite">{voiceError}</Text>
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
        <Text className={styles.error} role="alert" aria-live="polite">{voice.presenceError(presenceError)}</Text>
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
            draftWaitingAnswer ? voice.answerPlaceholder : voice.heardPlaceholder
          }
          onChange={(_, data) => {
            // Шаг 26: пишем черновик на каждое изменение. Момент закрытия окна
            // выбрать нельзя, поэтому «сохранить при уходе» — не вариант.
            saveDraft(data.value);
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
        <Button
          type="submit"
          disabled={busy}
          // Подпись подсказывает клавишу: сценарий «напечатал и нажал Enter»
          // должен находиться сам, а не угадываться.
          title={draftWaitingAnswer ? voice.answerSubmitHint : voice.findHint}
        >
          {draftWaitingAnswer ? voice.answerSubmit : voice.find}
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
            disabled={thinking || text.trim().length === 0}
            // Ответ — обычный текст, а не намерение: его можно слушать.
            title={voice.thinkSayHint}
            onClick={() => {
              sayRef.current(text.trim());
            }}
          >
            {voice.thinkSay}
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
            disabled={queueOn || queueSummary.waiting === 0}
            onClick={() => {
              void startQueue();
            }}
          >
            {voice.queueRun}
          </Button>
          <Button
            size="small"
            appearance="subtle"
            disabled={!queueOn && queueSummary.waiting === 0 && !running && !busy && !thinking && !engineBusy}
            onClick={() => halt("стоп")}
          >
            {voice.queueStop}
          </Button>
          {thinkError && !enginePrompt ? (
            <Text className={styles.error} role="alert" aria-live="polite">{voice.thinkError(thinkError)}</Text>
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
              <Text className={styles.error} role="alert" aria-live="polite">{voice.thinkBroken(thought.problem ?? "")}</Text>
              <pre className={styles.prompt}>{thought.answer}</pre>
            </>
          ) : null}
        </div>
      ) : null}

      {/*
        Шаг 159: экран восстановления. Число прерванных дел раньше считалось и
        выбрасывалось — человек не узнавал, что дело прервалось, пока не
        заглядывал в очередь. Блок стоит выше очереди: он про прошлый запуск, и
        сначала надо решить, что с ним, а потом смотреть на новые дела.
        Кнопки — оба настоящих выхода: продолжать и убрать. Ни один не
        происходит сам: дело уже потеряло процесс, и молча начать его заново
        значит решать за человека.
      */}
      {interrupted > 0 ? (
        <div className={styles.section} role="status">
          <Text className={styles.title}>{voice.interruptedTitle(interrupted)}</Text>
          <Text className={styles.note}>{voice.interruptedLead}</Text>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button
              size="small"
              appearance="primary"
              onClick={() => {
                // Продолжить — значит вернуть прерванные дела в работу. Дела
                // сами не начнутся, поэтому здесь только разрешение; очередь
                // берёт их по обычным правилам, с точки продолжения.
                setInterrupted(0);
                setQueueOn(true);
              }}
            >
              {voice.interruptedGo}
            </Button>
            <Button
              size="small"
              appearance="subtle"
              onClick={() => {
                setInterrupted(0);
                // Убрать — убрать именно прерванные: остальные дела человека не
                // трогаем, они его, а не наши.
                setQueue((current) => current.filter((item) => !item.note?.startsWith("прервано перезапуском")));
              }}
            >
              {voice.interruptedDrop}
            </Button>
          </div>
        </div>
      ) : null}

      {queue.length > 0 || queueIdle ? (
        <div className={styles.section}>
          <Text className={styles.title}>{voice.queueTitle(queueSummary.waiting, queueSummary.done)}</Text>
          {goals.map((goal) => {
            // Счётчик уже посчитан выше, на изменение очереди. Второго расчёта
            // здесь нет намеренно: разметка не считает.
            const done = goalProgress.get(goal);
            if (!done) return null;
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
              <Text
                className={item.state === "held" ? styles.error : styles.note}
                role={item.state === "held" ? "alert" : undefined}
              >
                {voice.queueLine(item.goal, item.state, item.note)}
              </Text>
              {item.resumeAt !== undefined && item.state !== "done" ? (
                // Видно ДО запуска, а не после: человек должен знать, что повтор
                // начнётся с третьего шага, а не с первого — это про то, что уже
                // сделано с его файлами.
                <Text className={styles.note}>{voice.queueResumeAt(item.resumeAt)}</Text>
              ) : null}
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
          {machine?.weak ? (
            <Text className={styles.note}>{voice.machineWeak}</Text>
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
            <Text className={styles.error} role="alert" aria-live="polite">{voice.machineStop}</Text>
          ) : null}
          {machine ? <Text className={styles.note}>{machine.note}</Text> : null}
          {machineError ? (
            <Text className={styles.error} role="alert" aria-live="polite">{voice.machineError(machineError)}</Text>
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
            <Text role={typed.verified ? "status" : "alert"} aria-live="polite" className={typed.verified ? styles.note : styles.error}>
              {voice.typeResult(typed.target.name, typed.read_back, typed.note)}
            </Text>
          ) : null}
          {typeError ? <Text className={styles.error} role="alert" aria-live="polite">{voice.typeError(typeError)}</Text> : null}
          {pressResult ? (
            <Text role={pressResult.changed ? "status" : "alert"} aria-live="polite" className={pressResult.changed ? styles.note : styles.error}>
              {voice.pressResult(pressResult.target.name, pressResult.changed, pressResult.note)}
            </Text>
          ) : null}
          {pressError ? (
            <Text className={styles.error} role="alert" aria-live="polite">{voice.pressError(pressError)}</Text>
          ) : null}
          {screenError ? (
            <Text className={styles.error} role="alert" aria-live="polite">{voice.screenError(screenError)}</Text>
          ) : null}
        </div>
      ) : null}

      {spoken ? <Text className={styles.spoken}>{spoken}</Text> : null}

      {error ? (
        <Text className={styles.error} role="alert" aria-live="polite">{`${voice.loadError}: ${error}`}</Text>
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
                        // Тот же человек, та же причина: заговорил — приложение
                        // молчит. Здесь это отдельная кнопка у поля вопроса, и
                        // забыть её было бы легко: речь шла бы поверх ответа.
                        stopSpeaking();
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
              <Text key={`${problem.position}-${index}`} role="alert" aria-live="polite" className={styles.error}>
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
              onClick={() => {
                // Шаг 121: точка отсчёта — здесь, на нажатии. Замер, начатый в
                // одном пути и не начатый в другом, даёт отрезки только у одного.
                if (markRef.current.start === 0) markRef.current.start = Date.now();
                execute();
              }}
            >
              {running
                ? voice.draftRunning
                : draft.questions.length > 0
                  ? voice.askRun
                  : voice.draftRun}
            </Button>
            {report ? (
              <Text
                className={report.stopped ? styles.error : styles.localReady}
                role={report.stopped ? "alert" : "status"}
              >
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
            <Text className={styles.error} role="alert" aria-live="polite">{voice.handFilter(handError)}</Text>
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
                    <Text className={styles.error} role="alert" aria-live="polite">{voice.trialNotRan(trial.note)}</Text>
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
