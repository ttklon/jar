import { useEffect, useRef, useState } from "react";
import { Button, Text } from "@fluentui/react-components";
import { checkMicrophone, type MicrophoneMeasurement } from "../lib/microphoneCheck";
import { microphoneCheck as text } from "../i18n/ru";

interface Props {
  active?: boolean;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
}

/** Only an explicit button opens the device. A stale permission grant cannot restart it. */
export function MicrophoneCheck({ active = true, disabled = false, onBusyChange }: Props) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<MicrophoneMeasurement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [wasCancelled, setCancelled] = useState(false);
  const operation = useRef<AbortController | null>(null);
  const notify = useRef(onBusyChange);
  notify.current = onBusyChange;

  useEffect(() => {
    if (!active) {
      operation.current?.abort();
      operation.current = null;
      setBusy(false);
      setResult(null);
      setError(null);
      setCancelled(false);
      notify.current?.(false);
    }
    return () => {
      operation.current?.abort();
      operation.current = null;
      notify.current?.(false);
    };
  }, [active]);

  async function start() {
    if (!active || disabled || operation.current) return;
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true);
    setResult(null);
    setError(null);
    setCancelled(false);
    notify.current?.(true);
    try {
      const measured = await checkMicrophone(controller.signal);
      if (operation.current === controller) setResult(measured);
    } catch (reason: unknown) {
      if (operation.current === controller && !controller.signal.aborted) {
        setError(reason instanceof Error ? reason.message : String(reason));
      }
    } finally {
      if (operation.current === controller) {
        operation.current = null;
        setBusy(false);
        notify.current?.(false);
      }
    }
  }

  function cancel() {
    operation.current?.abort();
    operation.current = null;
    setBusy(false);
    setCancelled(true);
    notify.current?.(false);
  }

  return <section aria-label={text.title}>
    <Text as="h2" size={400} block>{text.title}</Text>
    <Text block>{text.privacy}</Text>
    {busy ? <>
      <Text role="status" block>{text.pending}</Text>
      <Button onClick={cancel}>{text.cancel}</Button>
    </> : <Button disabled={!active || disabled} onClick={() => void start()}>{text.start}</Button>}
    {disabled ? <Text block>{text.locked}</Text> : null}
    {wasCancelled ? <Text role="status" block>{text.cancelled}</Text> : null}
    {error ? <Text role="alert" block>{text.error(error)}</Text> : null}
    {result ? <div role="status">
      <Text block>{result.kind === "signal" ? text.signal : result.kind === "quiet" ? text.quiet : text.noFrames}</Text>
      <Text block>{text.stats(result.seconds.toFixed(1), (result.rms * 100).toFixed(1), (result.peak * 100).toFixed(1))}</Text>
    </div> : null}
    <Text block>{text.boundary}</Text>
  </section>;
}
