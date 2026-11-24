import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, makeStyles, Spinner, Text, tokens } from "@fluentui/react-components";
import { ArrowClockwiseRegular } from "@fluentui/react-icons";
import {
  cancelDownload,
  downloadModel,
  downloadRuntime,
  removeRuntime,
  downloadProgress,
  isTauri,
  readinessStatus,
  smokeCheck,
  stopEngine,
} from "../ipc";
import type { ReadinessStatus, SmokeResult } from "../ipc";
import { NEED_NETWORK_MIXED, needsNetworkFor, offlineNote, onlineState } from "../lib/offline";
import { verdict as requestVerdict, type Attempt } from "../lib/offlineRequests";
import { assessReadiness, formatSize, hasRoom, planPrepare } from "../lib/readiness";
import { readiness as text } from "../i18n/ru";
import { ErrorLine } from "./ErrorLine";
import { appendEvent, isEmpty, readLog, summarize } from "../lib/firstRunLog";

const useStyles = makeStyles({
  card: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    padding: "16px 18px",
    borderRadius: tokens.borderRadiusLarge,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2,
    maxWidth: "96ch",
  },
  title: { fontWeight: tokens.fontWeightSemibold },
  note: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
    maxWidth: "78ch",
  },
  ok: { color: tokens.colorPaletteGreenForeground2 },
  error: { color: tokens.colorPaletteRedForeground2, maxWidth: "78ch" },
  mono: { fontFamily: tokens.fontFamilyMonospace, fontSize: tokens.fontSizeBase200 },
  row: { display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" },
  item: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    padding: "10px 12px",
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  progress: { fontFamily: tokens.fontFamilyMonospace, fontSize: tokens.fontSizeBase200 },
  logCard: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    padding: "10px 12px",
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground3,
  },
});

interface ReadinessCardProps {
  active?: boolean;
  /** Переход к разговору. */
  onToVoice?: () => void;
  /** Переход к экрану «Модели». */
  onToModels?: () => void;
  /** Внешний статус (для тестов и переиспользования). Без него карточка читает сама. */
  status?: ReadinessStatus | null;
  /** Ошибка чтения статуса. */
  error?: string | null;
  /** Перечитать статус. */
  onRefresh?: () => void;
}

/**
 * Карточка «Чтобы начать разговор, нужно…».
 *
 * Читает реальные состояния (движок, модели, распознавание, место) и называет только
 * то, чего действительно не хватает. Скачивание и запуск — только по явной кнопке:
 * карточка сама ничего не качает и не запускает. В браузере машины нет, поэтому
 * кнопки скрыты, а оговорка стоит на карточке, а не в документации.
 */
export function ReadinessCard({
  active = true,
  onToVoice,
  onToModels,
  status: statusProp,
  error: errorProp,
  onRefresh,
}: ReadinessCardProps) {
  const styles = useStyles();
  const [innerStatus, setInnerStatus] = useState<ReadinessStatus | null>(null);
  const [innerError, setInnerError] = useState<string | null>(null);
  const status = statusProp !== undefined ? statusProp : innerStatus;
  const error = errorProp !== undefined ? errorProp : innerError;
  const browser = !isTauri();
  const [micPermission, setMicPermission] = useState<PermissionState | "unknown">("unknown");
  useEffect(() => {
    let active = true;
    let permission: PermissionStatus | undefined;
    const update = () => { if (active && permission) setMicPermission(permission.state); };
    // query только читает: не вызывает getUserMedia и не запрашивает согласие.
    void navigator.permissions?.query({ name: "microphone" as PermissionName })
      .then((value) => {
        if (!active) return;
        permission = value;
        update();
        value.addEventListener("change", update);
      }).catch(() => undefined);
    return () => { active = false; permission?.removeEventListener("change", update); };
  }, []);

  const [busy, setBusy] = useState<
    | "model"
    | "runtime"
    | "speech-model"
    | "speech-runtime"
    | "remove"
    | "speech-remove"
    | "stop"
    | "smoke"
    | null
  >(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [confirmSpeechRemove, setConfirmSpeechRemove] = useState(false);
  const [smoke, setSmoke] = useState<SmokeResult | null>(null);
  // Попытки, которые карточка уже сделала. При запуске их ноль — и это видно
  // прямо в тексте: «ни одного запроса наружу». Заполняются только скачивания по
  // нажатию; фоновых у карточки нет (это проверяет `no_silent_download.py`).
  // Хук объявлен здесь, а не у места показа: ниже есть ранний `return` для
  // «статуса ещё нет», и `useState` после него давал «Rendered more hooks than
  // during the previous render» — приложение падало на первом же статусе.
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [includeSpeech, setIncludeSpeech] = useState(true);
  const [sequence, setSequence] = useState<string | null>(null);
  // Идёт ли скачивание прямо сейчас. Отдельно от `sequence`: та строка есть только
  // у «подготовить всё», а одиночная кнопка «Скачать модель» её не ставит — и без
  // этого признака объяснение не появлялось бы там, где нужнее всего (шаг 23).
  const downloading = busy !== null || !!status?.download_name;
  const stopPrepare = useRef(false);

  const requestRef = useRef(0);
  const alive = useRef(true);
  const actionLock = useRef(false);
  const smokeGeneration = useRef(0);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const refresh = useCallback(() => {
    const request = ++requestRef.current;
    setInnerError(null);
    readinessStatus()
      .then((value) => {
        if (alive.current && request === requestRef.current) setInnerStatus(value);
      })
      .catch((reason: unknown) => {
        if (alive.current && request === requestRef.current) {
          setInnerStatus(null);
          setInnerError(reason instanceof Error ? reason.message : String(reason));
        }
      });
    onRefresh?.();
  }, [onRefresh]);

  useEffect(() => {
    if (active && statusProp === undefined) refresh();
    return () => { ++requestRef.current; };
  }, [active, statusProp, refresh]);

  useEffect(() => {
    const onFocus = () => { if (active && statusProp === undefined) refresh(); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [active, statusProp, refresh]);

  // Прогресс скачивания: опрашиваем размер `.part`, пока качаем.
  useEffect(() => {
    const name =
      busy === "model"
        ? status?.model_spec.file
        : busy === "runtime"
          ? status?.runtime_spec.asset
          : busy === "speech-model"
            ? status?.speech_model_spec.file
            : busy === "speech-runtime"
              ? status?.speech_runtime_spec.asset
              : status?.download_name;
    if (!name) return;
    let active = true;
    let polling = false;
    const timer = setInterval(() => {
      if (polling) return;
      polling = true;
      downloadProgress(name)
        .then((value) => { if (active) setProgress(value); })
        .catch(() => undefined)
        .finally(() => { polling = false; });
    }, 500);
    return () => { active = false; clearInterval(timer); };
  }, [busy, status]);

  useEffect(() => {
    if (!active || statusProp !== undefined || !status?.download_name) return;
    const timer = setInterval(refresh, 1000);
    return () => clearInterval(timer);
  }, [active, statusProp, status?.download_name, refresh]);

  const download = useCallback(
    async (kind: "model" | "runtime" | "speech-model" | "speech-runtime") => {
      if (!status || actionLock.current) return;

      // Сеть выключена — говорим об этом до попытки, а не после таймаута.
      // Одна и та же проверка на обоих путях (кнопка и «подготовить всё»):
      // два пути к одному действию не должны вести себя по-разному.
      //
      // Что именно недоступно, называется по виду скачивания. Раньше здесь была
      // одна фраза «скачать модель» на все четыре вида: человек жал «скачать
      // движок», а ему отвечали про модель — и он шёл искать, при чём тут
      // модель, вместо того чтобы узнать, что нужна сеть.
      const note = offlineNote(onlineState(globalThis.navigator), needsNetworkFor(kind));
      if (note !== null) {
        setActionError(note);
        return;
      }

      actionLock.current = true;
      setBusy(kind);
      setProgress(null);
      setActionError(null);
      setDone(null);
      setSmoke(null);
      // Учёт попытки — **до** вызова, а не после успеха: провал тоже случился, и
      // именно он должен быть в списке. Иначе список показывал бы одни удачи и
      // молчал о том, что не прошло.
      const where =
        kind === "model"
          ? status.model_spec.url
          : kind === "speech-model"
            ? status.speech_model_spec.url
            : kind === "runtime"
              ? status.runtime_spec.source
              : status.speech_runtime_spec.source;
      const what = needsNetworkFor(kind);
      try {
        // Шаг 40: каждое скачивание оставляет след в журнале первого запуска.
        // Пишем при успехе, а не при нажатии: журнал говорит, что **произошло**,
        // а не что человек собирался сделать.
        if (kind === "model") {
          const spec = status.model_spec;
          const got = await downloadModel(spec.url, spec.file, spec.sha256);
          if (!alive.current) return;
          remember({ what: "downloaded", item: text.prepareStep.model });
          /*
            Шаг 174: хеш — не украшение. Ядро его считает и сверяет с эталоном, а
            экран раньше выбрасывал ответ: человек не знал, проверен файл или просто
            лёг на диск. «Сверено с эталоном» и «эталона не было» — разные факты.
          */
          setDone(
            got.verified
              ? `${text.downloaded(spec.file)} · хеш сверен с эталоном: ${got.sha256.slice(0, 12)}…`
              : `${text.downloaded(spec.file)} · эталона хеша не было: ${got.sha256.slice(0, 12)}… — файл не с чем сверить`,
          );
        } else if (kind === "speech-model") {
          const spec = status.speech_model_spec;
          const got = await downloadModel(spec.url, spec.file, spec.sha256);
          if (!alive.current) return;
          remember({ what: "downloaded", item: text.prepareStep["speech-model"] });
          setDone(
            got.verified
              ? `${text.downloaded(spec.file)} · хеш сверен с эталоном: ${got.sha256.slice(0, 12)}…`
              : `${text.downloaded(spec.file)} · эталона хеша не было: ${got.sha256.slice(0, 12)}… — файл не с чем сверить`,
          );
        } else if (kind === "runtime") {
          const installed = await downloadRuntime("llama");
          if (!alive.current) return;
          remember({ what: "downloaded", item: text.prepareStep.runtime });
          setDone(text.downloaded(installed.program));
        } else {
          const installed = await downloadRuntime("whisper");
          if (!alive.current) return;
          remember({ what: "downloaded", item: text.prepareStep["speech-runtime"] });
          setDone(text.downloaded(installed.program));
        }
        // Успех тоже попытка: список без удач не отвечает на «а оно стучалось?».
        if (alive.current) setAttempts((list) => [...list, { where, by: "press", result: "ok", what }]);
        refresh();
      } catch (reason: unknown) {
        if (!alive.current) return;
        // Провал — в список **и** на экран. Провал без записи и без строки — это
        // ровно тот тихий сбой, который шаг запрещает.
        setAttempts((list) => [...list, { where, by: "press", result: "failed", what }]);
        const message = reason instanceof Error ? reason.message : String(reason);
        refresh(); // Publication may have succeeded even when temporary-file cleanup failed.
        setActionError(
          ["скачивание отменено человеком", "установка отменена человеком", "распаковка отменена человеком"].includes(message)
            ? text.cancelled : text.downloadError(message),
        );
      } finally {
        actionLock.current = false;
        if (alive.current) setBusy(null);
        if (alive.current) setProgress(null);
      }
    },
    [status, refresh],
  );

  // Куда ведёт кнопка в отказе: в «Модели». Ошибку снимаем — человек ушёл
  // разбираться, и старый текст, оставшийся на экране, читался бы как новый сбой.
  // Записать событие и сразу показать его: журнал на экране должен обновляться
  // после скачивания, а не после перезапуска.
  const remember = useCallback((event: Parameters<typeof appendEvent>[0]) => {
    if (appendEvent(event)) setLog(readLog());
  }, []);

  const actToModels = useMemo(
    () =>
      onToModels
        ? () => {
            setActionError(null);
            onToModels();
          }
        : undefined,
    [onToModels],
  );

  const runSmoke = useCallback(async () => {
    if (actionLock.current) return;
    actionLock.current = true;
    const generation = ++smokeGeneration.current;
    setBusy("smoke");
    setActionError(null);
    setSmoke(null);
    try {
      const result = await smokeCheck();
      if (!alive.current || generation !== smokeGeneration.current) return;
      setSmoke(result);
      refresh();
    } catch (reason: unknown) {
        if (!alive.current || generation !== smokeGeneration.current) return;
      setActionError(text.smokeError(reason instanceof Error ? reason.message : String(reason)));
    } finally {
      if (generation === smokeGeneration.current) {
        actionLock.current = false;
        if (alive.current) setBusy(null);
      }
    }
  }, [refresh]);

  const stop = useCallback(async () => {
    if (busy === "stop") return;
    actionLock.current = true;
    setBusy("stop");
    ++smokeGeneration.current;
    setSmoke(null);
    setActionError(null);
    try {
      await stopEngine();
      if (alive.current) refresh();
    } catch (reason: unknown) {
      if (alive.current) setActionError(text.smokeError(reason instanceof Error ? reason.message : String(reason)));
    } finally {
      actionLock.current = false;
      if (alive.current) setBusy(null);
    }
  }, [refresh, busy]);

  const remove = useCallback(async (kind: "llama" | "whisper") => {
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(kind === "llama" ? "remove" : "speech-remove");
    setActionError(null);
    setSmoke(null);
    setDone(null);
    try {
      await removeRuntime(kind);
      if (!alive.current) return;
      setConfirmRemove(false);
      setConfirmSpeechRemove(false);
      setDone(kind === "llama" ? text.removeRuntimeDone : text.removeSpeechRuntimeDone);
      refresh();
    } catch (reason: unknown) {
      const message = reason instanceof Error ? reason.message : String(reason);
      if (alive.current) {
        setActionError(
          kind === "llama"
            ? text.removeRuntimeError(message)
            : text.removeSpeechRuntimeError(message),
        );
      }
    } finally {
      actionLock.current = false;
      if (alive.current) setBusy(null);
    }
  }, [refresh]);

  useEffect(() => { if (!status?.engine_running) setSmoke(null); }, [status?.engine_running]);
  useEffect(() => { setSmoke(null); }, [status?.engine_program, status?.model_name]);

  const cancel = useCallback(() => {
    stopPrepare.current = true;
    void cancelDownload().catch((reason: unknown) => {
      if (alive.current) setActionError(text.downloadError(reason instanceof Error ? reason.message : String(reason)));
    });
  }, []);

  const prepare = useCallback(async () => {
    if (!status || actionLock.current) return;
    const speechWanted = includeSpeech && (!status.speech_found || status.speech_model === null);
    const plan = planPrepare(status, speechWanted);
    if (plan.block || plan.steps.length === 0) return;

    // Сеть выключена — это не сбой, а факт, и о нём говорится до попытки.
    // Без этой проверки человек видел бы «скачивание не удалось» на нарочно
    // выключенной сети: приложение обвиняло бы его в том, что он сделал сам.
    if (plan.steps.some((step) => step !== "smoke")) {
      // Называем то, что этот план действительно собирается скачивать. План из
      // одного движка не должен получать отказ про модель: человек пойдёт
      // искать, при чём тут модель. Если в плане разное — говорим общим словом.
      const downloads = plan.steps.filter(
        (step): step is "model" | "runtime" | "speech-model" | "speech-runtime" => step !== "smoke",
      );
      const kinds = [...new Set(downloads.map(needsNetworkFor))];
      // `kinds[0]` без проверки не годится: при `noUncheckedIndexedAccess` он
      // может быть `undefined`, а тип отказа не допускает «ничего».
      const only = kinds.length === 1 ? kinds[0] : undefined;
      const note = offlineNote(
        onlineState(globalThis.navigator),
        only ?? NEED_NETWORK_MIXED,
      );
      if (note !== null) {
        setActionError(note);
        return;
      }
    }
    actionLock.current = true;
    stopPrepare.current = false;
    setActionError(null);
    setDone(null);
    setSmoke(null);
    const cancelled = (message: string) =>
      ["скачивание отменено человеком", "установка отменена человеком", "распаковка отменена человеком"].includes(message);
    try {
      for (let index = 0; index < plan.steps.length; index += 1) {
        if (stopPrepare.current || !alive.current) {
          setActionError(text.cancelled);
          return;
        }
        const step = plan.steps[index];
        if (!step) return;
        setBusy(step === "smoke" ? "smoke" : step);
        setSequence(text.prepareProgress(index + 1, plan.steps.length, text.prepareStep[step]));
        if (step === "smoke") {
          if (statusProp === undefined) {
            const fresh = await readinessStatus();
            if (!fresh.engine_found || !fresh.model_present) {
              setActionError(text.prepareIncomplete);
              return;
            }
          }
          const generation = ++smokeGeneration.current;
          const result = await smokeCheck();
          if (!alive.current || generation !== smokeGeneration.current) return;
          setSmoke(result);
          refresh();
          if (result.ok) onToVoice?.();
          else setActionError(text.smokeFailed(result.note));
          return;
        }
        if (step === "model") {
          await downloadModel(status.model_spec.url, status.model_spec.file, status.model_spec.sha256);
        } else if (step === "speech-model") {
          await downloadModel(status.speech_model_spec.url, status.speech_model_spec.file, status.speech_model_spec.sha256);
        } else if (step === "runtime") {
          await downloadRuntime("llama");
        } else {
          await downloadRuntime("whisper");
        }
        if (!alive.current) return;
        refresh();
      }
      if (alive.current) {
        setDone(text.prepareOpened);
        onToVoice?.();
      }
    } catch (reason: unknown) {
      if (!alive.current) return;
      const message = reason instanceof Error ? reason.message : String(reason);
      refresh();
      setActionError(cancelled(message) || stopPrepare.current ? text.cancelled : text.downloadError(message));
    } finally {
      actionLock.current = false;
      if (alive.current) {
        setBusy(null);
        setProgress(null);
        setSequence(null);
      }
    }
  }, [status, includeSpeech, statusProp, refresh, onToVoice]);

  // Шаг 40: журнал читается до **любых** ранних `return`. Хук ниже первого
  // выхода вызывался бы не на каждом рендере, и React падал бы с «change in the
  // order of Hooks» — экран навсегда застревал на «Смотрю, что уже есть». Это
  // и случилось с первой попыткой; тест «читает статус сама» поймал сразу.
  // Перечитываем не на каждый рендер: только когда в журнал что-то записали
  // (см. `remember` ниже) или при монтировании. Иначе чтение хранилища шло бы
  // на каждое движение статуса.
  const [log, setLog] = useState(() => readLog());
  const logSummary = useMemo(() => summarize(log), [log]);

  if (status === null && error === null) {
    return (
      <section className={styles.card} aria-label={text.title}>
        <div className={styles.row} role="status" aria-live="polite">
          <Spinner size="tiny" />
          <Text className={styles.note}>{text.loading}</Text>
        </div>
      </section>
    );
  }

  if (status === null) {
    return (
      <section className={styles.card} aria-label={text.title}>
        <Text className={styles.title}>{text.title}</Text>
        <ErrorLine className={styles.error} text={text.loadError(error ?? "")} />
        <div className={styles.row}>
          <Button size="small" icon={<ArrowClockwiseRegular />} onClick={refresh}>
            {text.refresh}
          </Button>
        </div>
      </section>
    );
  }

  const assessment = assessReadiness(status);
  const speechOptional = assessment.speechMissing.length > 0;
  const plan = planPrepare(status, speechOptional && includeSpeech);
  const showPrepare = !browser && plan.block === null && plan.steps.some((step) => step !== "smoke");
  const modelTotal = formatSize(status.model_spec.bytes);
  const runtimeTotal = formatSize(status.runtime_spec.bytes);
  const speechModelTotal = formatSize(status.speech_model_spec.bytes);
  const speechRuntimeTotal = formatSize(status.speech_runtime_spec.bytes);
  // Что именно сейчас качается — по тому же признаку, что и опрос прогресса.
  // Имя нужно в строке прогресса: «скачано 40 из 100» без имени файла
  // заставляет догадываться, что это за 100 мегабайт (шаг 22).
  // Журнал читается при монтировании и после каждого скачивания — не на каждый
  // рендер: хранилище читает диск, и делать это на каждое движение статуса
  // незачем. `done` меняется ровно тогда, когда в журнале появилась запись.
  const downloadingName =
    busy === "model"
      ? status.model_spec.file
      : busy === "runtime"
        ? status.runtime_spec.asset
        : busy === "speech-model"
          ? status.speech_model_spec.file
          : busy === "speech-runtime"
            ? status.speech_runtime_spec.asset
            : (status.download_name ?? "");
  const downloadingTotal =
    busy === "model"
      ? modelTotal
      : busy === "runtime"
        ? runtimeTotal
        : busy === "speech-model"
          ? speechModelTotal
          : speechRuntimeTotal;
  const speechNeeded =
    status.speech_model_spec.bytes + status.speech_runtime_spec.bytes;
  const speechRoom = hasRoom(status.free_bytes, speechNeeded);

  return (
    <section className={styles.card} aria-label={text.title}>
      <Text className={styles.title}>
        {assessment.ready ? text.readyTitle : text.title}
      </Text>

      {showPrepare ? (
        <div className={styles.item}>
          {speechOptional ? (
            <label>
              <input
                type="checkbox"
                checked={includeSpeech}
                disabled={busy !== null}
                onChange={(event) => setIncludeSpeech(event.target.checked)}
              />{" "}
              {text.prepareSpeech}
            </label>
          ) : null}
          {speechOptional ? <Text className={styles.note}>{text.prepareSpeechHint}</Text> : null}
          <Text className={styles.note}>
            {plan.steps.includes("smoke")
              ? text.prepareHint(formatSize(plan.bytes))
              : text.prepareHintNoStart(formatSize(plan.bytes))}
          </Text>
          {plan.speechSkipped ? (
            <Text className={styles.note}>
              {text.prepareSpeechSkipped(
                plan.speechSkipped === "no-room"
                  ? text.prepareSpeechSkipRoom
                  : plan.speechSkipped === "owned"
                    ? text.prepareSpeechSkipOwned
                    : text.prepareSpeechSkipUnsupported,
              )}
            </Text>
          ) : null}
          <div className={styles.row}>
            <Button
              appearance="primary"
              disabled={busy !== null || !!status.download_name}
              onClick={() => void prepare()}
            >
              {text.prepare}
            </Button>
            {sequence ? (
              <Button size="small" onClick={cancel}>
                {text.cancel}
              </Button>
            ) : null}
          </div>
          {sequence ? <Text className={styles.progress}>{sequence}</Text> : null}
          {/* Шаг 23: полоса загрузки без объяснения читается как «пока не
              скачается — делать нечего». Называем, что уже работает, и даём
              кнопку туда — чтобы это была не утешительная фраза, а выход. */}
          {downloading && !browser ? (
            <Text className={styles.note}>{text.whileDownloading(status.download_name ?? status.model_spec.file)}</Text>
          ) : null}
        </div>
      ) : null}
      {!browser && plan.block === "no-room" ? <ErrorLine className={styles.error} text={text.prepareNoRoom} /> : null}
      {!browser && plan.block === "runtime-unsupported" ? (
        <ErrorLine className={styles.error} text={text.prepareUnsupported} />
      ) : null}
      {!browser && plan.block === "runtime-owned" ? <ErrorLine className={styles.error} text={text.prepareOwned} /> : null}

      {/*
        Шаг 40: журнал первого запуска. Стоит ниже действий и выше итога: это
        не то, что надо делать, а то, что уже случилось. Пустой журнал не
        рисуется вовсе — пустая карточка выглядит как потерянный отчёт.
      */}
      {!isEmpty(log) ? (
        <div className={styles.logCard}>
          <Text weight="semibold">{text.firstRunLogTitle}</Text>
          {logSummary.downloaded.length > 0 ? (
            <Text className={styles.note}>{text.firstRunLogDownloaded(logSummary.downloaded.join(", "))}</Text>
          ) : null}
          {logSummary.verified.length > 0 ? (
            <Text className={styles.note}>{text.firstRunLogVerified(logSummary.verified.join(", "))}</Text>
          ) : null}
          {logSummary.deferred.length > 0 ? (
            <Text className={styles.note}>{text.firstRunLogDeferred(logSummary.deferred.join(", "))}</Text>
          ) : null}
          {logSummary.checked.length > 0 ? (
            <Text className={styles.note}>{text.firstRunLogChecked(logSummary.checked.join(", "))}</Text>
          ) : null}
        </div>
      ) : null}

      {assessment.ready ? (
        <Text className={styles.ok}>{text.readyText}</Text>
      ) : (
        <>
          {assessment.missing.includes("engine") ? (
            <div className={styles.item}>
              <Text weight="semibold">{status.runtime_spec.title}</Text>
              <Text className={styles.note}>{text.missingEngine}</Text>
              <Text className={styles.note}>{text.runtimeSize(runtimeTotal)}</Text>
              <Text className={styles.note}>{text.license(status.runtime_spec.license)}</Text>
              <Text className={styles.note}>{text.source(status.runtime_spec.source)}</Text>
              <Text className={styles.mono}>{text.sha(status.runtime_spec.sha256)}</Text>
              <Text className={styles.note}>{text.runtimeDelivery(status.engine_search_dir, status.runtime_spec.url, status.runtime_spec.sha256)}</Text>
              {!browser && status.runtime_supported && !status.runtime_managed ? (
                <div className={styles.row}>
                  <Button size="small" appearance="primary" disabled={busy !== null || !!status.download_name} onClick={() => void download("runtime")}>
                    {busy === "runtime" ? text.installing : text.downloadRuntime}
                  </Button>
                  {/* Отмена живёт в общей строке прогресса, а не рядом с каждой
                      кнопкой: иначе при загрузке видно две «Отменить» (шаг 22). */}
                </div>
              ) : null}
              {!browser && !status.runtime_supported ? <ErrorLine className={styles.error} text={text.runtimeUnsupported} /> : null}
            </div>
          ) : null}

          {assessment.missing.includes("model") ? (
            <div className={styles.item}>
              <Text weight="semibold">{status.model_spec.title}</Text>
              <Text className={styles.note}>{text.missingModel}</Text>
              <Text className={styles.note}>{text.modelSize(modelTotal)}</Text>
              <Text className={styles.note}>{text.modelRequirements(status.model_spec.min_ram_gb, status.models_dir)}</Text>
              {!hasRoom(status.free_bytes, status.model_spec.bytes) ? <ErrorLine className={styles.error} text={text.noRoom} /> : null}
              <Text className={styles.note}>{text.license(status.model_spec.license)}</Text>
              <Text className={styles.note}>{text.source(status.model_spec.source)}</Text>
              <Text className={styles.mono}>{text.sha(status.model_spec.sha256)}</Text>
              {!browser ? (
                <div className={styles.row}>
                  <Button
                    size="small"
                    appearance="primary"
                    disabled={busy !== null || !!status.download_name || !hasRoom(status.free_bytes, status.model_spec.bytes)}
                    onClick={() => void download("model")}
                  >
                    {busy === "model" ? text.downloading : text.downloadModel}
                  </Button>
                  {/* Отмена — в общей строке прогресса: она одна на экран и
                      называет файл, тогда как кнопка рядом этого не делает
                      (шаг 22). */}
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      )}

      {assessment.speechMissing.length > 0 ? (
        <div className={styles.item}>
          <Text weight="semibold">{text.speechSectionTitle}</Text>
          <Text className={styles.note}>{text.speechWhy}</Text>

          {assessment.speechMissing.includes("speech-engine") ? (
            <>
              <Text weight="semibold">{status.speech_runtime_spec.title}</Text>
              <Text className={styles.note}>{text.speechMissingEngine}</Text>
              <Text className={styles.note}>{text.runtimeSize(speechRuntimeTotal)}</Text>
              <Text className={styles.note}>{text.license(status.speech_runtime_spec.license)}</Text>
              <Text className={styles.note}>{text.source(status.speech_runtime_spec.source)}</Text>
              <Text className={styles.mono}>{text.sha(status.speech_runtime_spec.sha256)}</Text>
              <Text className={styles.note}>{text.runtimeDelivery(status.speech_search_dir, status.speech_runtime_spec.url, status.speech_runtime_spec.sha256)}</Text>
              {!browser && status.runtime_supported && !status.speech_runtime_managed ? (
                <div className={styles.row}>
                  <Button
                    size="small"
                    appearance="primary"
                    disabled={busy !== null || !!status.download_name}
                    onClick={() => void download("speech-runtime")}
                  >
                    {busy === "speech-runtime" ? text.installing : text.downloadSpeechRuntime}
                  </Button>
                  {busy === "speech-runtime" ? (
                    <Button size="small" appearance="subtle" onClick={cancel}>
                      {text.cancel}
                    </Button>
                  ) : null}
                </div>
              ) : null}
              {!browser && !status.runtime_supported ? <ErrorLine className={styles.error} text={text.runtimeUnsupported} /> : null}
            </>
          ) : null}

          {assessment.speechMissing.includes("speech-model") ? (
            <>
              <Text weight="semibold">{status.speech_model_spec.title}</Text>
              <Text className={styles.note}>{text.speechMissingModel}</Text>
              <Text className={styles.note}>{text.modelSize(speechModelTotal)}</Text>
              <Text className={styles.note}>{text.modelRequirements(status.speech_model_spec.min_ram_gb, status.models_dir)}</Text>
              {!speechRoom ? <ErrorLine className={styles.error} text={text.noRoom} /> : null}
              <Text className={styles.note}>{text.license(status.speech_model_spec.license)}</Text>
              <Text className={styles.note}>{text.source(status.speech_model_spec.source)}</Text>
              <Text className={styles.mono}>{text.sha(status.speech_model_spec.sha256)}</Text>
              {!browser ? (
                <div className={styles.row}>
                  <Button
                    size="small"
                    appearance="primary"
                    disabled={busy !== null || !!status.download_name || !speechRoom}
                    onClick={() => void download("speech-model")}
                  >
                    {busy === "speech-model" ? text.downloading : text.downloadSpeechModel}
                  </Button>
                  {busy === "speech-model" ? (
                    <Button size="small" appearance="subtle" onClick={cancel}>
                      {text.cancel}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : null}

        </div>
      ) : null}

      {status.speech_runtime_managed && !browser ? (
        <div className={styles.row}>
          {confirmSpeechRemove ? (
            <>
              <Text>{text.removeSpeechRuntimeConfirm}</Text>
              <Button disabled={busy !== null || !!status.download_name} onClick={() => void remove("whisper")}>
                {text.removeSpeechRuntime}
              </Button>
              <Button disabled={busy !== null} onClick={() => setConfirmSpeechRemove(false)}>
                {text.cancel}
              </Button>
            </>
          ) : (
            <Button disabled={busy !== null || !!status.download_name} onClick={() => setConfirmSpeechRemove(true)}>
              {text.removeSpeechRuntime}
            </Button>
          )}
        </div>
      ) : null}

      {/* Загрузка, начатая не этой карточкой (например, из экрана «Модели»),
          тоже видна и тоже отменяется — но одной строкой, а не второй копией:
          две кнопки «Отменить» на экране — это выбор, которого не должно быть. */}
      {status.download_name && busy === null ? <div className={styles.row}>
        <Text>{text.ongoing(status.download_name, progress === null ? null : formatSize(progress))}</Text>
        {!browser ? <Button onClick={cancel}>{text.cancel}</Button> : null}
      </div> : null}
      {/*
        Шаг 22: одна строка прогресса — имя файла и сколько уже есть — и отмена
        рядом. Раньше здесь были только «скачано N из M», без имени и без
        кнопки: человек не знал, что именно качается, и не мог это остановить,
        если решил, что 1 ГБ ему сейчас не нужен. Столбик цифр без выхода —
        это модальное окно, только без рамки.
      */}
      {downloading && busy !== null ? (
        <div className={styles.row}>
          <Text className={styles.progress}>
            {text.progressLine(
              status.download_name ?? downloadingName,
              progress === null ? null : formatSize(progress),
              downloadingTotal,
            )}
          </Text>
          {/* Одна «Отменить» на экран: при «подготовить всё» она уже стоит у
              кнопки подготовки и отменяет всю цепочку — вторую не добавляем. */}
          {!browser && !sequence ? <Button size="small" onClick={cancel}>{text.cancel}</Button> : null}
        </div>
      ) : null}
      {status.runtime_managed && !browser ? (
        <div className={styles.row}>
          {confirmRemove ? <>
            <Text>{text.removeRuntimeConfirm}</Text>
            <Button disabled={busy !== null || status.engine_running || !!status.download_name} onClick={() => void remove("llama")}>{text.removeRuntime}</Button>
            <Button disabled={busy !== null} onClick={() => setConfirmRemove(false)}>{text.cancel}</Button>
          </> : <Button disabled={busy !== null || status.engine_running || !!status.download_name} onClick={() => setConfirmRemove(true)}>{text.removeRuntime}</Button>}
          {status.engine_running ? <Text className={styles.note}>{text.stopBeforeRemove}</Text> : null}
        </div>
      ) : null}
      {error ? <ErrorLine className={styles.error} text={text.loadError(error)} /> : null}
      {/* Шаг 25: в отказе есть кнопка, а не только текст. Кнопку рисует сам
          `ErrorLine` — и только когда причина известна и экран умеет отвести
          туда, где проблему видно (шаг 29: пустая кнопка хуже её отсутствия). */}
      {actionError ? <ErrorLine className={styles.error} text={actionError} onAct={actToModels} /> : null}
      {done ? <Text className={styles.ok}>{done}</Text> : null}

      {assessment.ready ? <Text className={styles.note}>{text.detected(status.engine_program, status.model_name, status.engine_running)}</Text> : null}
      {assessment.ready && !browser ? <Text className={styles.note}>{text.runtimeTrust}</Text> : null}
      {assessment.ready && !browser ? (
        <div className={styles.row}>
          <Button
            size="small"
            appearance="primary"
            disabled={busy !== null || !!status.download_name}
            onClick={() => void runSmoke()}
          >
            {busy === "smoke" ? text.smokeRunning : text.smoke}
          </Button>
          {onToVoice ? (
            <Button size="small" onClick={onToVoice}>
              {text.toVoice}
            </Button>
          ) : null}
        </div>
      ) : null}

      {!browser && (status.engine_running || busy === "smoke") ? (
        <Button size="small" disabled={busy === "stop"} onClick={() => void stop()}>{text.stop}</Button>
      ) : null}
      {smoke ? (
        // Пробный запуск: успех — обычная новость, провал — ошибка, и её
        // должен услышать диктор. `assertive` только у провала: объявлять
        // добрую весть срочно значит перебивать человека по пустякам.
        <Text
          className={smoke.ok ? styles.ok : styles.error}
          role={smoke.ok ? "status" : "alert"}
          aria-live={smoke.ok ? "polite" : "assertive"}
        >
          {smoke.ok ? text.smokeOk(smoke.answer ?? "") : text.smokeFailed(smoke.note)}
        </Text>
      ) : null}

      <Text className={styles.note}>
        {status.free_bytes === null
          ? text.freeUnknown
          : text.freeSpace(formatSize(status.free_bytes))}
      </Text>
      <Text className={styles.note}>
        {assessment.speechLocal ? text.speechReady : text.speechNote}
      </Text>
      <Text className={styles.note}>{text.micPermission(micPermission)}</Text>
      {/* Шаг 220: обещание «без сети ни одного неуспешного запроса, кроме
          названного» проверяется списком, а не словом. Здесь — ровно то, что
          случилось в этом сеансе: пусто значит «приложение никуда не стучалось»,
          а не «мы не смотрели». */}
      <Text className={styles.note} data-testid="offline-promise">
        {requestVerdict(
          attempts,
          attempts.filter((item) => item.by === "press").map((item) => ({ where: item.where, how: `кнопка «${item.what}»` })),
        ).said}
      </Text>
      {browser ? <Text className={styles.note}>{text.browserNote}</Text> : null}

      <div className={styles.row}>
        <Button size="small" appearance="subtle" icon={<ArrowClockwiseRegular />} onClick={refresh}>
          {text.refresh}
        </Button>
        {onToModels ? (
          <Button size="small" appearance="subtle" onClick={onToModels}>
            {text.toModels}
          </Button>
        ) : null}
      </div>
    </section>
  );
}
