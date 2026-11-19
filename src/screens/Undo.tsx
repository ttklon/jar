import { useCallback, useEffect, useState } from "react";
import { Button, makeStyles, Spinner, Text, tokens } from "@fluentui/react-components";
import { undoReport, undoApply } from "../ipc";
import type { UndoPreview, UndoReport } from "../ipc";
import { undo } from "../i18n/ru";

/**
 * Откат за сессию — карточка в настройках.
 *
 * Правила, по которым она сделана:
 *
 *  * **сначала показать, потом сделать.** Список того, что вернётся, виден до нажатия:
 *    откат без списка — это лотерея с файлами;
 *  * **второй щелчок, а не диалог.** Кнопка сначала «взводится» и говорит «Точно
 *    откатить?»: случайное нажатие ничего не делает, и лишнее окно не нужно;
 *  * **отчёт без слова «успешно».** Итог — числа: сколько вернулось, сколько нет и
 *    почему; причины приходят из ядра, а не придумываются здесь;
 *  * **оговорка рядом.** «Запись, копия, сжатие, скачивание и корзина не откатываются» —
 *    стоит под кнопкой, а не в документации.
 */

const KIND_LABEL: Record<string, string> = {
  move: "перенос",
  rename: "переименование",
  copy: "копия",
  compress: "сжатие",
  product: "собранный файл",
};

const useStyles = makeStyles({
  card: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    padding: "16px 18px",
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground2,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  lead: { color: tokens.colorNeutralForeground2 },
  muted: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  steps: { display: "flex", flexDirection: "column", gap: "6px", margin: 0, padding: 0 },
  step: { display: "flex", flexDirection: "column", gap: "2px", listStyle: "none" },
  path: { fontFamily: tokens.fontFamilyMonospace, fontSize: tokens.fontSizeBase200 },
  refusal: { color: tokens.colorPaletteRedForeground1, fontSize: tokens.fontSizeBase200 },
  actions: { display: "flex", gap: "8px", alignItems: "center" },
});

export function UndoCard() {
  const styles = useStyles();
  const [preview, setPreview] = useState<UndoPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [armed, setArmed] = useState(false);
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<UndoReport | null>(null);

  const load = useCallback(() => {
    undoReport()
      .then((data) => {
        setPreview(data);
        setError(null);
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : String(reason));
      });
  }, []);

  useEffect(load, [load]);

  const run = useCallback(() => {
    setRunning(true);
    undoApply()
      .then((result) => {
        setReport(result);
        setArmed(false);
        load();
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => setRunning(false));
  }, [load]);

  const possible = preview ? preview.steps.filter((step) => step.refusal === null).length : 0;

  return (
    <div className={styles.card}>
      <div>
        <Text weight="semibold">{undo.title}</Text>
        <Text className={styles.lead} block>
          {undo.lead}
        </Text>
      </div>

      {error ? (
        <Text className={styles.refusal} block>
          {undo.error(error)}
        </Text>
      ) : preview === null ? (
        <Text className={styles.muted} block>
          {undo.loading}
        </Text>
      ) : preview.steps.length === 0 ? (
        <Text className={styles.muted} block>
          {undo.nothing}
        </Text>
      ) : (
        <ul className={styles.steps}>
          {preview.steps.map((step) => (
            <li key={`${step.entry.at}-${step.entry.from}`} className={styles.step}>
              <Text className={styles.path}>
                {undo.step(
                  KIND_LABEL[step.entry.kind] ?? undo.kind(step.entry.kind),
                  step.entry.from,
                  step.entry.to,
                )}
              </Text>
              <Text className={step.refusal ? styles.refusal : styles.muted}>
                {step.refusal ?? undo.possible}
              </Text>
            </li>
          ))}
        </ul>
      )}

      {possible > 0 ? (
        <div className={styles.actions}>
          {running ? (
            <>
              <Spinner size="tiny" />
              <Text className={styles.muted}>{undo.running}</Text>
            </>
          ) : armed ? (
            <>
              <Button appearance="primary" onClick={run}>
                {undo.armed}
              </Button>
              <Button appearance="secondary" onClick={() => setArmed(false)}>
                {undo.cancel}
              </Button>
            </>
          ) : (
            <Button appearance="primary" onClick={() => setArmed(true)}>
              {undo.action(possible)}
            </Button>
          )}
        </div>
      ) : null}

      {report ? (
        <div>
          <Text block>{undo.undone(report.undone)}</Text>
          {report.refused.length > 0 ? (
            <>
              <Text className={styles.refusal} block>
                {undo.refused(report.refused.length)}
              </Text>
              {report.refused.map((reason) => (
                <Text key={reason} className={styles.muted} block>
                  {reason}
                </Text>
              ))}
            </>
          ) : null}
        </div>
      ) : null}

      {preview ? (
        <Text className={styles.muted} block>
          {preview.note}
        </Text>
      ) : null}
    </div>
  );
}
