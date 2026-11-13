import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Input, makeStyles, Switch, Text, tokens } from "@fluentui/react-components";
import { MicRegular } from "@fluentui/react-icons";
import {
  adoptHand,
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
  isolationStatus,
  speechStatus,
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
  SpeechStatus,
  UiDump,
  UiPress,
  UiTyped,
} from "../ipc";
import { speak } from "../lib/voice";
import { aroundPhrase, rankForWindow } from "../lib/context";
import { factKey, factsToRemember, seedAnswers } from "../lib/facts";
import { describeThought } from "../lib/thought";
import {
  add,
  next,
  setState,
  stopRemaining,
  summary,
  unattended,
  type QueueItem,
  type QueueState,
} from "../lib/queue";
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
  /** Отменил ли человек запись — чтобы «ничего не ушло» было видно, а не молчало. */
  const [cancelled, setCancelled] = useState(false);
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
  /** Черновик руки. Это текст: у него нет пути к запуску, и это сказано на экране. */
  const [handDraft, setHandDraft] = useState<HandDraft | null>(null);
  const [handError, setHandError] = useState<string | null>(null);
  const [handBusy, setHandBusy] = useState(false);
  /** Отчёт о пробе в клетке. Отчёт, а не «научились». */
  const [trial, setTrial] = useState<TrialReport | null>(null);
  const [trialBusy, setTrialBusy] = useState(false);
  /** Принятые руки: отдельно от встроенных и не исполняются. */
  const [adopted, setAdopted] = useState<CustomHand | null>(null);
  /** Очередь дел: несколько задач подряд, пока человек не скажет «стоп». */
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [queueOn, setQueueOn] = useState(false);
  /** Почему очередь стоит — словами, а не пустым местом. */
  const [queueIdle, setQueueIdle] = useState<string | null>(null);
  const queueRef = useRef<QueueItem[]>([]);
  const queueStopRef = useRef(false);
  const queueRunningRef = useRef(false);
  /** Что с машиной: загрузка, память, присутствие человека. Ничего не запускает. */
  const [machine, setMachine] = useState<MachineState | null>(null);
  const [machineError, setMachineError] = useState<string | null>(null);
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
  /**
   * Одно дело из очереди: собрать план, проверить, можно ли без человека, и исполнить.
   *
   * Ничего нового здесь не решается: политика та же, что и в ручном режиме. Разница одна —
   * если плану нужно подтверждение или ответ, дело помечается «ваше слово» и очередь идёт
   * дальше. Исполнить такое молча было бы подлогом.
   */
  const runQueuedGoal = useCallback(
    async (goal: string): Promise<{ state: QueueState; note: string }> => {
      const check = await draftPlan(goal).catch(() => null);
      const verdict = unattended(check);

      if (!verdict.can || !check?.plan) {
        return { state: "held", note: verdict.why };
      }

      const report = await runPlan(JSON.stringify(check.plan), []).catch(() => null);
      if (!report) {
        return { state: "failed", note: "запуск не состоялся: ядро не ответило" };
      }
      if (report.stopped) {
        return { state: "failed", note: report.stopped };
      }

      return { state: "done", note: `шагов: ${report.steps.length}, всё выполнено` };
    },
    [],
  );

  /**
   * Идти по очереди, пока не скажут «стоп».
   *
   * Перед каждым делом спрашиваем машину заново: за время работы человек мог вернуться,
   * а память — кончиться. Один раз спросить и решить на весь вечер было бы самонадеянно.
   */
  const startQueue = useCallback(async () => {
    if (queueRunningRef.current) return;

    queueRunningRef.current = true;
    queueStopRef.current = false;
    setQueueOn(true);
    setQueueIdle(null);

    let items = queueRef.current;

    try {
      for (;;) {
        if (queueStopRef.current) {
          setQueueIdle("остановлено вами: начатое доведено, остальное не начиналось");
          break;
        }

        const machine = await Promise.resolve(machineState()).catch(() => null);
        const decision = next(items, {
          parallel: machine?.budget.parallel ?? 1,
          mayStart: machine?.budget.may_start ?? true,
          // Без измерения «ушёл» не подтверждено: сам идти не начинаю.
          away: machine?.budget.mode === "away",
        });

        if (decision.index < 0) {
          setQueueIdle(decision.reason);
          break;
        }

        const item = items[decision.index];
        if (!item) break;

        items = setState(items, item.id, "running", "");
        queueRef.current = items;
        setQueue(items);

        const outcome = await runQueuedGoal(item.goal);

        items = setState(items, item.id, outcome.state, outcome.note);
        queueRef.current = items;
        setQueue(items);
      }
    } finally {
      queueRunningRef.current = false;
      setQueueOn(false);
    }
  }, [runQueuedGoal]);

  const stopQueue = useCallback(() => {
    queueStopRef.current = true;
    const stopped = stopRemaining(queueRef.current);
    queueRef.current = stopped;
    setQueue(stopped);
  }, []);

  /**
   * Померить машину. Это совет самому себе, а не приказ человеку: рядом с числом всегда
   * стоит причина, иначе «умное» распределение нельзя ни объяснить, ни проверить.
   */
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

        // Слова не совпали — не тупик: спрашиваем модель. Она нужна ровно здесь, где
        // поиск по буквам бессилен («сделай потише» → «убавить громкость»). Молча
        // превращать такую фразу в «не умею» было бы обиднее всего.
        let answered: Thought | null = null;
        if (!proposal) {
          const window = frontRef.current;
          // Экран читаем до вопроса: без него у «нажми эту кнопку» нет адресата.
          const screenText = window ? await readScreen() : null;
          answered = await Promise.resolve(
            think(
              query,
              window
                ? { title: window.title, process: window.process, screen: screenText }
                : null,
            ),
          ).catch(() => null);
          setThought(answered);

          // План от модели — обычный план: политика, вопросы и подтверждение те же.
          if (answered?.plan) {
            setDraft(answered.plan);
            setApproved(false);
            setReport(null);
            const phrase = `${voice.thinkPlanReady(answered.plan.plan?.steps.length ?? 0)}. ${voice.thinkNotExecuted}`;
            setSpoken(speak(phrase) ? voice.said(phrase) : voice.silent);
            return;
          }
        }

        // Не умеем — не тупик: записываем задачу на обучение и говорим, что для неё
        // нужно. Учиться приложение должно уметь само, но молча — нельзя.
        const promise =
          proposal || answered?.plan
            ? null
            : answered?.learning ?? (await requestLearning(query).catch(() => null));
        if (promise) {
          setLearning(promise);
          speak(
            answered?.learning
              ? voice.thinkLearnRecorded(query, promise.example)
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

      {mic.listening && !always ? (
        <Text className={styles.note}>{voice.pauseSend}</Text>
      ) : null}

      {mic.listening && !always ? (
        <Button
          appearance="subtle"
          onClick={() => {
            mic.cancel();
            setCancelled(true);
          }}
        >
          {voice.cancelShow}
        </Button>
      ) : null}

      {cancelled ? <Text className={styles.note}>{voice.cancelled}</Text> : null}

      <Button
        className={mic.listening ? styles.micListening : styles.mic}
        appearance="primary"
        icon={<MicRegular />}
        aria-label={always ? voice.always : voice.hold}
        onPointerDown={(event) => {
          event.preventDefault();
          setCancelled(false);
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

      {text.trim().length > 0 ? (
        <div>
          <Button
            size="small"
            appearance="subtle"
            onClick={() => {
              if (promptText !== null) {
                setPromptText(null);
                return;
              }
              modelPrompt(text.trim(), front ? { title: front.title, process: front.process } : null)
                .then((value) => {
                  setPromptText(value);
                  setPromptError(null);
                })
                .catch((reason: unknown) => {
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
              setThinking(true);
              setThinkError(null);
              setThought(null);
              readScreen()
                .then((screenText) =>
                  think(
                    text.trim(),
                    front
                      ? { title: front.title, process: front.process, screen: screenText }
                      : null,
                  ),
                )
                .then((answer) => {
                  setThought(answer);

                  // План модели — это обычный план: политика, вопросы и подтверждение те же.
                  // Никакого «модель сказала, значит можно».
                  // Просьба об обучении уже записана ядром — показываем её карточкой, а не
                  // только словами: человек видит, что задача осталась, а не исчезла с фразой.
                  if (answer.learning) setLearning(answer.learning);

                  if (answer.plan) {
                    setDraft(answer.plan);
                    setAnswers({});
                    setRemembered([]);
                    setApproved(false);
                    setReport(null);
                  }

                  const phrase = answer.plan
                    ? `${describeThought(answer)}. ${voice.thinkPlanReady(answer.plan.plan?.steps.length ?? 0)}`
                    : describeThought(answer);
                  speak(phrase);
                })
                .catch((reason: unknown) =>
                  setThinkError(reason instanceof Error ? reason.message : String(reason)),
                )
                .finally(() => setThinking(false));
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
            disabled={!queueOn && summary(queue).waiting === 0}
            onClick={stopQueue}
          >
            {voice.queueStop}
          </Button>
          {thinkError ? (
            <Text className={styles.error}>{voice.thinkError(thinkError)}</Text>
          ) : null}
          {thought?.proposal ? (
            <>
              <Text className={styles.spoken}>{describeThought(thought)}</Text>
              <Text className={styles.note}>{voice.thinkNotExecuted}</Text>
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
          {queueIdle ? <Text className={styles.note}>{voice.queueIdle(queueIdle)}</Text> : null}
          {queue.map((item) => (
            <Text key={item.id} className={item.state === "held" ? styles.error : styles.note}>
              {voice.queueLine(item.goal, item.state, item.note)}
            </Text>
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
