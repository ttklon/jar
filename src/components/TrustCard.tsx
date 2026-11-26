import { useEffect, useState } from "react";
import { makeStyles, Text, tokens } from "@fluentui/react-components";
import { memoryRuns } from "../ipc";
import { mayRunQuietly, status, type History } from "../lib/earnedTrust";

/**
 * «Что можно без вопроса» — доверие, заработанное делом (шаг 50).
 *
 * Правило `earnedTrust` было написано и не подключено. Оно отвечает на вопрос,
 * который человек задаёт себе после недели работы: «оно что, теперь само это
 * делает?». Молчание здесь — худший ответ: непонятно, спросят или нет.
 *
 * Доверие считается **по делам, а не по времени**: то же дело руками, не меньше
 * двух раз, недавно, и без отмены после. Всё это говорится словами правила,
 * поэтому «почему спросит» всегда имеет ответ.
 */

const useStyles = makeStyles({
  card: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    padding: "14px 16px",
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground2,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  muted: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
});

/**
 * История доверия из запусков памяти.
 *
 * Считаются только **удавшиеся** запуски одного и того же дела, и только те, что
 * человек запускал сам: отменённое обнуляет счёт (правило `cancel`).
 */
export function trustFrom(
  runs: readonly { subject: string; outcome: string; started_ms: number }[],
): Map<string, History> {
  const byKind = new Map<string, History>();
  for (const run of [...runs].sort((a, b) => a.started_ms - b.started_ms)) {
    const key = run.subject.trim().toLowerCase();
    if (key === "") continue;
    const previous = byKind.get(key) ?? null;
    if (run.outcome.startsWith("cancel")) {
      // Отмена — сигнал, а не наказание: счёт начинается заново.
      byKind.set(key, {
        kind: key,
        confirmed: 0,
        lastAt: previous?.lastAt ?? 0,
        cancelledAt: run.started_ms,
      });
      continue;
    }
    if (!run.outcome.startsWith("ok")) continue;
    byKind.set(key, {
      kind: key,
      // После отмены старые подтверждения не возвращаются: считается только то,
      // что человек подтвердил уже после неё.
      confirmed: (previous !== null && previous.cancelledAt > previous.lastAt ? 0 : (previous?.confirmed ?? 0)) + 1,
      lastAt: run.started_ms,
      cancelledAt: previous?.cancelledAt ?? 0,
    });
  }
  return byKind;
}

export function TrustCard({ history }: { history?: Map<string, History> } = {}) {
  const styles = useStyles();
  const [got, setGot] = useState<Map<string, History> | null>(history ?? null);

  useEffect(() => {
    if (history) {
      setGot(history);
      return;
    }
    let alive = true;
    memoryRuns(100)
      .then((runs) => {
        if (alive) setGot(trustFrom(runs));
      })
      .catch(() => {
        if (alive) setGot(new Map());
      });
    return () => {
      alive = false;
    };
  }, [history]);

  const now = Date.now();
  const rows = [...(got ?? new Map<string, History>()).entries()].sort((a, b) => b[1].confirmed - a[1].confirmed);

  return (
    <div className={styles.card}>
      <Text weight="semibold" block>
        Что можно без вопроса
      </Text>
      <Text className={styles.muted} block>
        Доверие зарабатывается делом: то, что вы сами делали и подтверждали, приложение не спрашивает заново.
      </Text>
      {rows.length === 0 ? (
        <Text className={styles.muted}>пока ничего: каждое дело спросит подтверждение</Text>
      ) : (
        <ul>
          {rows.map(([kind, entry]) => {
            const verdict = mayRunQuietly(entry, now);
            return (
              <li key={kind}>
                <Text>{`«${kind}» — ${status(entry, now)}`}</Text>
                {/* Почему — словами правила, а не «недостаточно данных». */}
                <Text className={styles.muted} block>
                  {verdict.said}
                </Text>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
