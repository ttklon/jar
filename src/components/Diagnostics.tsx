import { useState } from "react";
import { Button, makeStyles, Text, Textarea, tokens } from "@fluentui/react-components";
import { isTauri } from "../ipc";
import { t } from "../i18n/ru";

/**
 * «Собрать для разбора» — пакет, который человек читает до отправки.
 *
 * Порядок здесь и есть суть. Обычные «отчёты об ошибке» собираются сразу и
 * уходят сразу: человек нажимает кнопку и узнаёт, что отправил, уже никак.
 * Здесь наоборот — **сначала текст на экране, потом решение**. Кнопки «отправить»
 * нет вовсе: пакет копируется в буфер, а куда его девать, человек решает сам.
 *
 * Три правила:
 *
 *  * **видно, что вычищено.** «Пути и секреты вычищены» без подробностей — это
 *    просьба верить. Счётчик — это факт;
 *  * **текст можно править.** Человек лучше знает, что лишнее; запрещать правку
 *    значило бы заставлять отправлять лишнее;
 *  * **в браузере карточки нет.** Там нет ни журнала, ни ядра, и «пакет собран»
 *    было бы выдумкой.
 */

type Pack = {
  text: string;
  paths_scrubbed: number;
  secrets_scrubbed: number;
  notes: string[];
};

const useStyles = makeStyles({
  card: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    padding: "14px 16px",
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground2,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  row: { display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" },
  muted: { color: tokens.colorNeutralForeground2 },
  ok: { color: tokens.colorPaletteGreenForeground1 },
});

export function Diagnostics() {
  const styles = useStyles();
  const [pack, setPack] = useState<Pack | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isTauri()) return null;

  const collect = async () => {
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      const ipc = await import("../ipc/tauri");
      const made = await ipc.diagnosticsPack();
      setPack(made);
      setText(made.text);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : String(problem));
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      // Буфер может быть запрещён — тогда текст уже на экране, и его можно
      // выделить руками. Врать про «скопировано» нельзя.
      setError(t.diagnosticsCopyFailed);
    }
  };

  return (
    <div className={styles.card} aria-label={t.diagnosticsTitle}>
      <Text weight="semibold">{t.diagnosticsTitle}</Text>
      <Text className={styles.muted}>{t.diagnosticsHint}</Text>

      <div className={styles.row}>
        <Button appearance="primary" disabled={busy} onClick={() => void collect()}>
          {t.diagnosticsCollect}
        </Button>
        {pack ? (
          <Button disabled={!text} onClick={() => void copy()}>
            {t.diagnosticsCopy}
          </Button>
        ) : null}
        {pack ? (
          <Text className={styles.muted} role="status" aria-live="polite">
            {pack.notes.join(" · ")}
          </Text>
        ) : null}
        {copied ? <Text className={styles.ok}>{t.diagnosticsCopied}</Text> : null}
      </div>

      {pack ? (
        <>
          <Text className={styles.muted}>{t.diagnosticsReview}</Text>
          <Textarea
            aria-label={t.diagnosticsText}
            value={text}
            resize="vertical"
            rows={12}
            onChange={(_, data) => setText(data.value)}
          />
        </>
      ) : null}

      {error ? (
        <Text role="alert" className={styles.muted}>
          {error}
        </Text>
      ) : null}
    </div>
  );
}
