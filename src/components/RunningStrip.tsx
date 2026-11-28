import { makeStyles, Text, tokens } from "@fluentui/react-components";
import { badgeAll, everywhere, type Running } from "../lib/runningGlobally";
import { badge as waitingBadge, queue, remindAfter, type Waiting } from "../lib/waitingGlobally";

/**
 * Плашка «что сейчас происходит» на всех экранах (шаги 367, 376).
 *
 * Два разных дефекта, и оба про **забыть**:
 *
 *  * дело **идёт** — человек ушёл в настройки, вернулся через час и не знает,
 *    закончилось ли. Дело закончится и само, но человек этого не видел;
 *  * дело **ждёт ответа** — оно не закончится вовсе. Без плашки на чужом экране
 *    оно стоит молча, а человек уверен, что «всё работает».
 *
 * Поэтому плашка живёт **не на экране дел**: именно потому, что человек с него
 * ушёл, она и нужна.
 *
 * Порядок важности: ждущее ответа важнее идущего. «Стопка плашек» — тоже дефект,
 * поэтому несколько дел складываются в одну строку.
 */

const useStyles = makeStyles({
  strip: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "8px 12px",
    marginBottom: "12px",
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground3,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  waiting: {
    backgroundColor: tokens.colorPaletteYellowBackground1,
    border: `1px solid ${tokens.colorPaletteYellowBorder2}`,
  },
  dot: {
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    backgroundColor: tokens.colorBrandForeground1,
    flexShrink: 0,
  },
  dotWaiting: { backgroundColor: tokens.colorPaletteYellowForeground1 },
  text: { fontSize: tokens.fontSizeBase300 },
  more: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
});

/** Что сейчас показывать. Пусто — плашки нет. */
export function stripOf(running: readonly Running[], waitedSinceMin: number): { text: string; waiting: boolean; extra: string | null } | null {
  const waiting = running.filter((item) => item.waiting);
  if (waiting.length > 0) {
    const first = waiting[0];
    const asWaiting = (item: Running, answer: string): Waiting => ({
      what: item.what,
      ask: "нужен ваш ответ",
      since: waitedSinceMin,
      canDefer: answer !== "",
    });
    const text = first === undefined ? null : waitingBadge([asWaiting(first, "нужен ваш ответ")]);
    const rest = queue(waiting.slice(1).map((item) => asWaiting(item, "нужен ваш ответ")));
    return text === null
      ? null
      : { text, waiting: true, extra: [remindAfter(waitedSinceMin), rest.length > 0 ? `за ним ещё ${rest.length}` : null].filter((line): line is string => line !== null).join("; ") || null };
  }
  const text = badgeAll(running);
  if (text === null) return null;
  return { text, waiting: false, extra: null };
}

export function RunningStrip({ running = [], waitedSinceMin = 0 }: { running?: readonly Running[]; waitedSinceMin?: number }) {
  const styles = useStyles();
  const strip = stripOf(running, waitedSinceMin);
  if (strip === null) return null;

  return (
    <div className={strip.waiting ? `${styles.strip} ${styles.waiting}` : styles.strip} role="status" aria-live="polite">
      <span className={strip.waiting ? `${styles.dot} ${styles.dotWaiting}` : styles.dot} aria-hidden="true" />
      <Text className={styles.text}>{strip.text}</Text>
      {strip.extra !== null ? <Text className={styles.more}>{strip.extra}</Text> : null}
      <Text className={styles.more}>{`видно: ${everywhere()[0]}`}</Text>
    </div>
  );
}
