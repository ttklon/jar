import { useEffect, useState } from "react";
import { makeStyles, Text, tokens } from "@fluentui/react-components";
import { auditTail, isTauri } from "../ipc";
import type { AuditEvent } from "../ipc";
import { lastFailures } from "../lib/journal";
import type { Failure } from "../lib/journal";
import { recentFailures } from "../i18n/ru";

/**
 * Последние отказы — карточка в настройках.
 *
 * Зачем это на экране, а не в логах. Человек не должен читать логи, чтобы
 * понять, почему вчера не сработало: пять строк с причиной и советом отвечают
 * на это без путей и файлов.
 *
 * Четыре правила:
 *
 *  * **причина, а не текст ошибки**: «нет сети», а не «could not resolve host»;
 *  * **совет рядом**, и он про действие: «проверьте сеть», а не «попробуйте ещё
 *    раз»;
 *  * **время названо** — «вчера» тоже информация, но точное время не даёт
 *    ошибиться при разборе;
 *  * **пусто — так и сказано**: «отказов не было» честнее пустого места.
 */

const useStyles = makeStyles({
  card: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    padding: "14px 16px",
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground2,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    maxWidth: "96ch",
  },
  lead: { color: tokens.colorNeutralForeground3 },
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "10px" },
  row: { display: "flex", flexDirection: "column", gap: "2px" },
  head: { display: "flex", gap: "8px", alignItems: "baseline", flexWrap: "wrap" },
  reason: { color: tokens.colorPaletteRedForeground1 },
  muted: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
});

function when(atMs: number): string {
  const date = new Date(atMs);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function RecentFailures() {
  const styles = useStyles();
  const [failures, setFailures] = useState<Failure[] | null>(null);
  // Сбой чтения — не «отказов не было». Пустота после ошибки читается как
  // «всё хорошо», а это ложь в самую опасную сторону.
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    // В браузере журнала нет: это не «отказов не было», а «журнала нет», и
    // карточка говорит это словами, а не пустотой.
    if (!isTauri()) {
      setFailures([]);
      return () => {
        alive = false;
      };
    }
    auditTail(100)
      .then((events: AuditEvent[]) => {
        if (alive) setFailures(lastFailures(events));
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <section className={styles.card} aria-label={recentFailures.title}>
      <Text weight="semibold">{recentFailures.title}</Text>
      <Text className={styles.lead}>{recentFailures.lead}</Text>

      {!isTauri() ? <Text className={styles.lead}>{recentFailures.browser}</Text> : null}

      {failed ? (
        <Text role="alert" aria-live="polite" className={styles.reason}>
          {recentFailures.failed}
        </Text>
      ) : failures === null ? (
        <Text className={styles.muted} role="status" aria-live="polite">
          {recentFailures.loading}
        </Text>
      ) : failures.length === 0 && isTauri() ? (
        <Text className={styles.muted}>{recentFailures.empty}</Text>
      ) : (
        <ul className={styles.list}>
          {failures.map((failure) => (
            <li key={`${failure.atMs}-${failure.subject}`} className={styles.row}>
              <div className={styles.head}>
                <Text weight="semibold" className={styles.reason}>
                  {failure.reason}
                </Text>
                <Text className={styles.muted}>{when(failure.atMs)}</Text>
                {failure.subject ? <Text className={styles.muted}>{failure.subject}</Text> : null}
              </div>
              {failure.advice ? <Text>{failure.advice}</Text> : null}
              <Text className={styles.muted}>{failure.detail}</Text>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
