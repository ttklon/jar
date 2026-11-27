import { useEffect, useState } from "react";
import { Button, makeStyles, Text, tokens } from "@fluentui/react-components";
import { isTauri, unfinished, unfinishedForget, unfinishedSave, unfinishedSet } from "../ipc";
import type { UnfinishedNeed } from "../ipc";
import { notDo as sleepNotDo, releases, sleep, wake } from "../lib/sleepRelease";
import { mustSave, notDo as shutdownNotDo, save } from "../lib/shutdownSave";

/**
 * «Сон и выключение» (шаги 457, 458).
 *
 * Два места, где чаще всего теряется дело:
 *
 *  * **сон** — приложение продолжает держать микрофон и движок, и на утро в
 *    памяти появляются «факты» из шорохов в чехле;
 *  * **выключение** — Windows даёт несколько секунд, и если номер шага не
 *    сохранён, дело не продолжится. Утром человек видит, что просил, и не
 *    понимает, почему оно не сделано.
 *
 * И симметричное правило после включения: **не продолжаем молча**. Дело
 * возвращается с вопросом.
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
});

export function SleepCard() {
  const styles = useStyles();
  const [left, setLeft] = useState<UnfinishedNeed | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const tauri = isTauri();

  useEffect(() => {
    unfinished()
      .then((need) => {
        if (need !== null) {
          setLeft(need);
        }
      })
      .catch(() => setLeft(null));
  }, []);

  // Что говорит правило про сон: тот же текст, что увидит человек при уходе в сон.
  const nap = sleep({ recording: true, engine: true, stepsDone: left?.step ?? 0, deed: left?.deed ?? undefined });
  const back = wake(nap);

  return (
    <div className={styles.card}>
      <div>
        <Text weight="semibold" block>
          Сон и выключение
        </Text>
        <Text className={styles.muted} block>
          {nap.said}
        </Text>
      </div>

      <ul className={styles.list}>
        {releases().map((line) => (
          <li key={line}>
            <Text className={styles.muted}>{line}</Text>
          </li>
        ))}
      </ul>

      <Text className={styles.muted} block>
        {`при пробуждении: ${back.said}`}
      </Text>

      {left !== null ? (
        <div role="status" aria-live="polite">
          <Text className={styles.muted} block>
            {`нашлось незавершённое: дело «${left.deed ?? "без названия"}» на шаге ${left.step}`}
          </Text>
          <div className={styles.row}>
            <Button
              onClick={() => {
                // Ответ «продолжить» — это ответ в деле, а не молчаливое
                // возобновление: экран лишь забывает незавершённое.
                unfinishedForget()
                  .then(() => {
                    setLeft(null);
                    setSaid(`продолжаем дело «${left.deed ?? "без названия"}» с шага ${left.step}`);
                  })
                  .catch((reason: unknown) => setSaid(reason instanceof Error ? reason.message : String(reason)));
              }}
            >
              продолжить с того же шага
            </Button>
            <Button
              onClick={() => {
                unfinishedForget()
                  .then(() => {
                    setLeft(null);
                    setSaid("незавершённое забыто: дело не продолжится само");
                  })
                  .catch((reason: unknown) => setSaid(reason instanceof Error ? reason.message : String(reason)));
              }}
            >
              не продолжать
            </Button>
          </div>
        </div>
      ) : null}

      <div className={styles.row}>
        <Button
          disabled={!tauri}
          onClick={() => {
            // Проверка «сохранится ли»: то же правило, что сработает при выходе.
            const demo: UnfinishedNeed = left ?? {
              deed: "уборка загрузок",
              step: 3,
              said: "убери загрузки",
              draft: "и ещё почисти",
            };
            unfinishedSet(demo)
              .then(() => unfinishedSave())
              .then((saved) => setSaid(saved.said))
              .catch((reason: unknown) => setSaid(reason instanceof Error ? reason.message : String(reason)));
          }}
        >
          проверить сохранение при выключении
        </Button>
      </div>

      <details>
        <summary className={styles.muted}>что сохраняется за секунды и чего не делаем</summary>
        <ul className={styles.list}>
          {mustSave().map((line) => (
            <li key={line}>
              <Text className={styles.muted}>{`сохраняется: ${line}`}</Text>
            </li>
          ))}
          {shutdownNotDo().slice(0, 3).map((line) => (
            <li key={line}>
              <Text className={styles.muted}>{`не делаем: ${line}`}</Text>
            </li>
          ))}
          {sleepNotDo().slice(0, 3).map((line) => (
            <li key={line}>
              <Text className={styles.muted}>{`после сна: ${line}`}</Text>
            </li>
          ))}
          <li>
            <Text className={styles.muted}>
              {save({ deed: "уборка загрузок", step: 3, said: "убери загрузки", draft: "" }, false).said}
            </Text>
          </li>
        </ul>
      </details>

      {said !== null ? (
        <Text className={styles.muted} role="status" aria-live="polite">
          {said}
        </Text>
      ) : null}
    </div>
  );
}
