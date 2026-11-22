import { useState } from "react";
import { Button, makeStyles, Text, tokens } from "@fluentui/react-components";
import { isTauri, removeEverything } from "../ipc";
import type { RemovedAll } from "../ipc/types";
import { models } from "../i18n/ru";

/**
 * «Удалить всё скачанное» — одна кнопка на все гигабайты.
 *
 * Зачем отдельная карточка. Модели и движки удалялись по файлу: у кого-то это
 * 1.2 ГБ в пяти местах, и убирать их по одному — издевательство. При этом
 * «удалить всё» — необратимое действие, и делать его по одному нажатию нельзя.
 *
 * Четыре правила:
 *
 *  * **спрашивает.** Одно нажатие убирает полтора гигабайта; вопрос дешевле
 *    повторного скачивания;
 *  * **говорит числом, сколько освободилось,** а не «готово». «Освободилось
 *    0 байт» тоже возможно — и тогда это правда, а не успех;
 *  * **называет, что осталось.** Работающий движок нельзя удалить, и молчать об
 *    этом значит оставить человека с мыслью, что удалилось всё;
 *  * **в браузере кнопки нет.** Там нет файлов, и «удалить» было бы выдумкой.
 */

const useStyles = makeStyles({
  card: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    padding: "14px 16px",
    borderRadius: tokens.borderRadiusLarge,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2,
    maxWidth: "96ch",
  },
  row: { display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" },
  lead: { color: tokens.colorNeutralForeground3 },
  kept: { color: tokens.colorPaletteYellowForeground2 },
});

export function RemoveEverything() {
  const styles = useStyles();
  const [asked, setAsked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RemovedAll | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isTauri()) return null;

  const run = () => {
    setBusy(true);
    setError(null);
    removeEverything()
      .then((report) => {
        setResult(report);
        setAsked(false);
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason)))
      .finally(() => setBusy(false));
  };

  return (
    <section className={styles.card} aria-label={models.removeAllTitle}>
      <Text weight="semibold">{models.removeAllTitle}</Text>
      <Text className={styles.lead}>{models.removeAllLead}</Text>

      {asked ? (
        <div className={styles.row}>
          <Text>{models.removeAllConfirm}</Text>
          <Button appearance="primary" onClick={run} disabled={busy}>
            {busy ? models.removeAllBusy : models.removeAllYes}
          </Button>
          <Button appearance="secondary" onClick={() => setAsked(false)} disabled={busy}>
            {models.removeAllNo}
          </Button>
        </div>
      ) : (
        <div className={styles.row}>
          <Button appearance="secondary" onClick={() => setAsked(true)}>
            {models.removeAllAsk}
          </Button>
        </div>
      )}

      {result ? (
        <Text role="status" aria-live="polite">
          {models.removeAllDone(result.freed_bytes)}
          {result.kept.length > 0 ? ` ${models.removeAllKept(result.kept.join("; "))}` : ""}
        </Text>
      ) : null}
      {error ? (
        <Text role="alert" aria-live="assertive">
          {models.removeAllError(error)}
        </Text>
      ) : null}
    </section>
  );
}
