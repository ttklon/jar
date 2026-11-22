import { useEffect, useState } from "react";
import { Button, makeStyles, Text, tokens } from "@fluentui/react-components";
import { isTauri, resourceReport } from "../ipc";
import type { ResourceReport as Report } from "../ipc";
import { resources } from "../i18n/ru";

/**
 * «Где приложение тратит ресурсы» — карточка в настройках (шаг 400).
 *
 * Три решения:
 *
 *  * **число всегда рядом с порогом.** «Память 214 МБ» без «при обещанных
 *    150» ничего не говорит: человек не помнит порог, а разработчик не помнит,
 *    когда его поставили;
 *  * **«не измерено» — не «хорошо».** Неизмеренное названо словами: пустая
 *    зелёная строка приучает не смотреть;
 *  * **превышение не красится в красный.** Это факт, а не падение: красный
 *    цвет здесь означал бы «сломалось», и человек привык бы его игнорировать.
 */

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
  lead: { color: tokens.colorNeutralForeground2, maxWidth: "78ch" },
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "8px" },
  row: { display: "flex", flexDirection: "column", gap: "2px" },
  head: { display: "flex", gap: "10px", alignItems: "baseline", flexWrap: "wrap" },
  ok: { color: tokens.colorPaletteGreenForeground1 },
  over: { color: tokens.colorPaletteDarkOrangeForeground1 },
  muted: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  mono: { fontFamily: tokens.fontFamilyMonospace },
});

export function ResourceReportCard() {
  const styles = useStyles();
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    setBusy(true);
    setError(null);
    resourceReport()
      .then(setReport)
      .catch((problem: unknown) =>
        setError(problem instanceof Error ? problem.message : String(problem)),
      )
      .finally(() => setBusy(false));
  };

  useEffect(load, []);

  return (
    <div className={styles.card}>
      <div>
        <Text weight="semibold">{resources.title}</Text>
        <Text className={styles.lead} block>
          {resources.lead}
        </Text>
      </div>

      {error ? (
        <Text role="alert" className={styles.over}>
          {resources.failed(error)}
        </Text>
      ) : null}

      {report ? (
        <>
          <Text role="status" aria-live="polite" className={styles.lead}>
            {report.summary}
          </Text>
          <ul className={styles.list}>
            {report.metrics.map((metric) => (
              <li key={metric.name} className={styles.row}>
                <div className={styles.head}>
                  <Text weight="semibold">{metric.name}</Text>
                  {metric.value === null ? (
                    <Text className={styles.muted}>{resources.notMeasured}</Text>
                  ) : (
                    <Text className={styles.mono}>
                      {resources.value(metric.value, metric.unit)}
                    </Text>
                  )}
                  {metric.budget !== null ? (
                    <Text className={styles.muted}>
                      {resources.budget(metric.budget, metric.unit)}
                    </Text>
                  ) : null}
                  {metric.within !== null ? (
                    <Text className={metric.within ? styles.ok : styles.over}>
                      {metric.within ? resources.within : resources.over}
                    </Text>
                  ) : null}
                </div>
                {/* Как мерили — чтобы цифре можно было верить; у неизмеренного
                    здесь причина, а не способ. */}
                <Text className={styles.muted}>{metric.how}</Text>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <div>
        <Button size="small" appearance="secondary" onClick={load} disabled={busy}>
          {busy ? resources.busy : resources.refresh}
        </Button>
        {!isTauri() ? <Text className={styles.muted}> {resources.browser}</Text> : null}
      </div>
    </div>
  );
}
