import { useEffect, useState } from "react";
import { makeStyles, Spinner, Text, tokens } from "@fluentui/react-components";
import { memoryRuns } from "../ipc";
import { compare, count, week, type Deed, type Stats } from "../lib/myStats";

/**
 * «Как у меня дела» — одна сводка за неделю на экране «Голос» (шаг 44).
 *
 * Два модуля говорили об одном: `myStats` (сводка с сэкономленным временем) и
 * `weekCounters` (неделя к неделе). Сведены к одному: счёт и сравнение берутся
 * из `myStats.count/week/compare`, а «неделя к неделе» — это `week(…)` для двух
 * окон и `compare`, то есть то же самое, без второго набора правил.
 *
 * Правила, которые тут видны человеку:
 *
 *  * отмены считаются **отдельно** от отказов: «я передумал» и «не получилось» —
 *    разные вещи, и смешивать их значит делать отчёту упрёк;
 *  * пустая неделя — «пока нечего считать», а не аккуратный ноль;
 *  * сэкономленное время показывается только если его правда можно посчитать.
 */

const useStyles = makeStyles({
  card: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    padding: "14px 16px",
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground2,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  muted: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
});

/** Запуски из памяти → дела для счёта. Неизвестный исход не притворяется успехом. */
export function toDeeds(runs: readonly { started_ms: number; outcome: string; finished_ms: number | null }[]): Deed[] {
  return runs.map((run) => ({
    at: run.started_ms,
    outcome:
      run.outcome.startsWith("ok")
        ? "done"
        : run.outcome.startsWith("cancel")
          ? "cancelled"
          : run.outcome === "failed" || run.outcome.startsWith("denied")
            ? "failed"
            : "done",
    // Время «как если бы руками» приложение не знает: выдумывать его нельзя,
    // поэтому `null`, и строка о сэкономленном просто не появляется.
    savedMs: null,
  }));
}

export function WeekStatsCard() {
  const styles = useStyles();
  const [got, setGot] = useState<{ now: Stats; said: string } | null>(null);

  useEffect(() => {
    let alive = true;
    memoryRuns(100)
      .then((runs) => {
        if (!alive) return;
        const deeds = toDeeds(runs);
        const now = Date.now();
        setGot({
          now: week(deeds, now),
          said: compare(week(deeds, now), week(deeds, now - 7 * 86_400_000)),
        });
      })
      .catch(() => {
        // Молчать лучше, чем показать ноль: ноль читается как «всё плохо».
        if (alive) setGot(null);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (got === null) {
    return (
      <div className={styles.card} role="status" aria-live="polite">
        <Text weight="semibold">Как у меня дела</Text>
        <Text className={styles.muted}>считаю за неделю…</Text>
        <Spinner size="tiny" />
      </div>
    );
  }

  return (
    <div className={styles.card}>
      <Text weight="semibold" block>
        Как у меня дела
      </Text>
      {/* Числа правила, а не вёрстки: «12 дел за неделю, сделано 11…» */}
      <Text>{got.now.said}</Text>
      <Text className={styles.muted}>{got.said}</Text>
      {got.now.failed > 0 ? (
        <Text className={styles.muted}>отказы — не ваша вина, но причины стоит посмотреть в журнале</Text>
      ) : null}
    </div>
  );
}

/** Для проверок: сводка без React. */
export function summaryOf(runs: Parameters<typeof toDeeds>[0], now: number): { now: Stats; said: string } {
  const deeds = toDeeds(runs);
  return { now: count(deeds.filter((deed) => deed.at >= now - 7 * 86_400_000)), said: compare(week(deeds, now), week(deeds, now - 7 * 86_400_000)) };
}
