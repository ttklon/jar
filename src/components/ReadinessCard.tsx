import { useCallback, useEffect, useRef, useState } from "react";
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
import { assessReadiness, formatSize, hasRoom, planPrepare } from "../lib/readiness";
import { readiness as text } from "../i18n/ru";

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
  const [includeSpeech, setIncludeSpeech] = useState(true);
  const [sequence, setSequence] = useState<string | null>(null);
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
      actionLock.current = true;
      setBusy(kind);
      setProgress(null);
      setActionError(null);
      setDone(null);
      setSmoke(null);
      try {
        if (kind === "model") {
          const spec = status.model_spec;
          await downloadModel(spec.url, spec.file, spec.sha256);
          if (!alive.current) return;
          setDone(text.downloaded(spec.file));
        } else if (kind === "speech-model") {
          const spec = status.speech_model_spec;
          await downloadModel(spec.url, spec.file, spec.sha256);
          if (!alive.current) return;
          setDone(text.downloaded(spec.file));
        } else if (kind === "runtime") {
          const installed = await downloadRuntime("llama");
          if (!alive.current) return;
          setDone(text.downloaded(installed.program));
        } else {
          const installed = await downloadRuntime("whisper");
          if (!alive.current) return;
          setDone(text.downloaded(installed.program));
        }
        refresh();
      } catch (reason: unknown) {
        if (!alive.current) return;
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

  if (status === null && error === null) {
    return (
      <section className={styles.card} aria-label={text.title}>
        <div className={styles.row}>
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
        <Text className={styles.error}>{text.loadError(error ?? "")}</Text>
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
        </div>
      ) : null}
      {!browser && plan.block === "no-room" ? <Text className={styles.error}>{text.prepareNoRoom}</Text> : null}
      {!browser && plan.block === "runtime-unsupported" ? (
        <Text className={styles.error}>{text.prepareUnsupported}</Text>
      ) : null}
      {!browser && plan.block === "runtime-owned" ? <Text className={styles.error}>{text.prepareOwned}</Text> : null}

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
                  {busy === "runtime" ? <Button size="small" onClick={cancel}>{text.cancel}</Button> : null}
                </div>
              ) : null}
              {!browser && !status.runtime_supported ? <Text className={styles.error}>{text.runtimeUnsupported}</Text> : null}
            </div>
          ) : null}

          {assessment.missing.includes("model") ? (
            <div className={styles.item}>
              <Text weight="semibold">{status.model_spec.title}</Text>
              <Text className={styles.note}>{text.missingModel}</Text>
              <Text className={styles.note}>{text.modelSize(modelTotal)}</Text>
              <Text className={styles.note}>{text.modelRequirements(status.model_spec.min_ram_gb, status.models_dir)}</Text>
              {!hasRoom(status.free_bytes, status.model_spec.bytes) ? <Text className={styles.error}>{text.noRoom}</Text> : null}
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
                  {busy === "model" ? (
                    <Button size="small" appearance="subtle" onClick={cancel}>
                      {text.cancel}
                    </Button>
                  ) : null}
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
              {!browser && !status.runtime_supported ? <Text className={styles.error}>{text.runtimeUnsupported}</Text> : null}
            </>
          ) : null}

          {assessment.speechMissing.includes("speech-model") ? (
            <>
              <Text weight="semibold">{status.speech_model_spec.title}</Text>
              <Text className={styles.note}>{text.speechMissingModel}</Text>
              <Text className={styles.note}>{text.modelSize(speechModelTotal)}</Text>
              <Text className={styles.note}>{text.modelRequirements(status.speech_model_spec.min_ram_gb, status.models_dir)}</Text>
              {!speechRoom ? <Text className={styles.error}>{text.noRoom}</Text> : null}
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

      {status.download_name && busy !== "model" && busy !== "runtime" && busy !== "speech-model" && busy !== "speech-runtime" ? <div className={styles.row}>
        <Text>{text.ongoing(status.download_name, progress === null ? null : formatSize(progress))}</Text>
        {!browser ? <Button onClick={cancel}>{text.cancel}</Button> : null}
      </div> : null}
      {busy === "model" && progress !== null ? (
        <Text className={styles.progress}>{text.progress(formatSize(progress), modelTotal)}</Text>
      ) : null}
      {busy === "runtime" && progress !== null ? (
        <Text className={styles.progress}>{text.progress(formatSize(progress), runtimeTotal)}</Text>
      ) : null}
      {busy === "speech-model" && progress !== null ? (
        <Text className={styles.progress}>{text.progress(formatSize(progress), speechModelTotal)}</Text>
      ) : null}
      {busy === "speech-runtime" && progress !== null ? (
        <Text className={styles.progress}>{text.progress(formatSize(progress), speechRuntimeTotal)}</Text>
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
      {error ? <Text className={styles.error}>{text.loadError(error)}</Text> : null}
      {actionError ? <Text className={styles.error}>{actionError}</Text> : null}
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
        <Text className={smoke.ok ? styles.ok : styles.error}>
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
