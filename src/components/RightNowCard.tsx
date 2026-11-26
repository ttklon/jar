import { useEffect, useState } from "react";
import { makeStyles, Spinner, Text, tokens } from "@fluentui/react-components";
import { bodyOf, type Blocks } from "../lib/rightNowLive";

/**
 * «Что сейчас» — ответ, который не надо спрашивать (шаг 43).
 *
 * Правило `rightNow` было написано и не подключено. Человек, у которого
 * приложение «что-то шевелится», должен увидеть ответ, а не догадываться.
 *
 * Три правила экрана, и все три — из модуля:
 *
 *  1. **показывает, а не управляет**: «остановить всё» одним неосторожным
 *     нажатием — худшее, что можно поставить рядом с идущим делом;
 *  2. **ничего не происходит — это ответ**, а не пустой экран: пустота читается
 *     как «сломалось»;
 *  3. **не додумывает**: говорит только то, что правда известно (дела в памяти,
 *     состояние модели), и молчит про остальное.
 */

const useStyles = makeStyles({
  card: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    padding: "16px 18px",
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground2,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  block: { display: "flex", flexDirection: "column", gap: "2px" },
  muted: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
});

export function RightNowCard({ blocks }: { blocks?: Blocks } = {}) {
  const styles = useStyles();
  const [got, setGot] = useState<Blocks | null>(blocks ?? null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (blocks) {
      setGot(blocks);
      return;
    }
    let alive = true;
    bodyOf(Date.now())
      .then((next) => {
        if (alive) setGot(next);
      })
      .catch((reason: unknown) => {
        if (alive) setError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => {
      alive = false;
    };
  }, [blocks]);

  return (
    <div className={styles.card}>
      <Text weight="semibold" block>
        Что сейчас
      </Text>
      {got === null && error === null ? (
        <div role="status" aria-live="polite">
          <Spinner size="tiny" />
          <Text className={styles.muted}> смотрю…</Text>
        </div>
      ) : null}
      {error !== null ? (
        <Text role="alert" className={styles.muted}>{`не удалось посмотреть: ${error}`}</Text>
      ) : null}
      {got !== null
        ? got.map((block) => (
            <div key={block.title} className={styles.block}>
              <Text weight="semibold">{block.title}</Text>
              {block.lines.map((line) => (
                <Text key={line} className={styles.muted}>
                  {line}
                </Text>
              ))}
            </div>
          ))
        : null}
    </div>
  );
}
