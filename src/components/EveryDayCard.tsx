import { useEffect, useState } from "react";
import { Button, Spinner, makeStyles, Text, tokens } from "@fluentui/react-components";
import { isTauri, memoryRuns, scheduleAdd } from "../ipc";
import type { RunRecord } from "../ipc";
import { fromDeed, preview, whereButton, type Done } from "../lib/fromOneDeed";
import { duringFirstMonth, grewUp, SHOWS_NEEDED, type Rule } from "../lib/firstMonth";

/**
 * «Каждый день в это время» (шаги 332, 329).
 *
 * Человек не программирует расписание: он **только что сделал дело руками** и
 * нажимает одну кнопку. Формы нет — время берётся из дела (если оно было в
 * 09:12, правило будет «в 09:12», а не «в 09:00»: человек делал в это время не
 * случайно).
 *
 * И правило не начинает работать молча: первый месяц оно **делает и говорит**,
 * а не спрашивает каждый раз. Доверие зарабатывается показами, а не возрастом:
 * «месяц прошёл, а опыта почти нет» — это отказ, а не успех.
 */

const useStyles = makeStyles({
  card: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    padding: "16px 18px",
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground2,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  row: { display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" },
  list: { display: "flex", flexDirection: "column", gap: "6px", margin: 0, padding: 0, listStyle: "none" },
  muted: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  mono: { fontFamily: tokens.fontFamilyMonospace, fontSize: tokens.fontSizeBase200 },
});

/** Дело из записи журнала — так, как его видит человек. */
export function doneOf(run: RunRecord): Done {
  return {
    what: run.subject,
    at: run.started_ms,
    steps: run.steps.map((step) => ({ kind: step.tool, target: step.evidence })),
    // Подтверждённым считаем только успешный и законченный прогон: автоматизировать
    // то, чего человек не сделал сам, нельзя.
    confirmed: run.outcome === "ok" && run.finished_ms !== null,
  };
}

export function EveryDayCard() {
  const styles = useStyles();
  const [runs, setRuns] = useState<RunRecord[] | null>(null);
  const [made, setMade] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isTauri()) {
      setRuns([]);
      return;
    }
    memoryRuns(20)
      .then((got) => setRuns(got))
      .catch(() => setRuns([]));
  }, []);

  const last = runs?.find((run) => run.steps.length > 0 && run.outcome === "ok") ?? null;
  const plan = last === null ? null : fromDeed(doneOf(last));

  // Молодое правило: месяц и пять показов. Оба условия, а не одно.
  const young: Rule = { createdAt: Date.now() - 10 * 86_400_000, ranQuietly: 3, acknowledged: 2 };
  const grown: Rule = { createdAt: Date.now() - 40 * 86_400_000, ranQuietly: 5, acknowledged: 5 };
  const monthOnly: Rule = { createdAt: Date.now() - 40 * 86_400_000, ranQuietly: 1, acknowledged: 1 };

  return (
    <div className={styles.card}>
      <div>
        <Text weight="semibold" block>
          Каждый день в это время
        </Text>
        <Text className={styles.muted} block>
          {whereButton()}
        </Text>
      </div>

      {runs === null ? (
        <div role="status" aria-live="polite">
          <Spinner size="tiny" />
          <Text className={styles.muted}> смотрю последние дела…</Text>
        </div>
      ) : plan === null ? (
        <Text className={styles.muted}>
          пока нет выполненного дела с шагами: кнопка появляется после первого дела, а не в пустом
          списке
        </Text>
      ) : (
        <>
          <ul className={styles.list}>
            {preview(plan)
              .split("\n")
              .map((line) => (
                <li key={line}>
                  <Text className={styles.muted}>{line}</Text>
                </li>
              ))}
          </ul>
          <div className={styles.row}>
            <Button
              disabled={!plan.ok || busy}
              onClick={() => {
                const at = new Date(Date.now());
                const minute = at.getHours() * 60 + at.getMinutes();
                setBusy(true);
                scheduleAdd(plan.said, "daily", minute)
                  .then((rows) => {
                    setBusy(false);
                    setMade(plan.label);
                    setSaid(`правило создано: ${plan.said}. Всего правил: ${rows.length}`);
                  })
                  .catch((reason: unknown) => {
                    setBusy(false);
                    setSaid(reason instanceof Error ? reason.message : String(reason));
                  });
              }}
            >
              {plan.label}
            </Button>
          </div>
        </>
      )}

      {made !== null ? (
        <Text className={styles.mono} role="status" aria-live="polite">
          {made}
        </Text>
      ) : null}

      <Text className={styles.muted} block>
        {`первый месяц: ${duringFirstMonth(young, Date.now()).said}`}
      </Text>
      <Text className={styles.muted} block>
        {grewUp(grown, Date.now()).said}
      </Text>
      {/* Месяц без показов — не зрелость: правило не сработало ни разу, опыта нет. */}
      <Text className={styles.muted} block>
        {grewUp(monthOnly, Date.now()).said}
      </Text>
      <Text className={styles.muted} block>
        {`показов нужно: ${SHOWS_NEEDED}, и месяц — вместе, а не вместо`}
      </Text>

      {said !== null ? (
        <Text className={styles.muted} role="status" aria-live="polite">
          {said}
        </Text>
      ) : null}
    </div>
  );
}
