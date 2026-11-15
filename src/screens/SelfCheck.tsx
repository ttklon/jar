import { useState } from "react";
import { Button, makeStyles, Text, tokens } from "@fluentui/react-components";
import { selfCheck } from "../ipc";
import type { SelfCheckVerdict } from "../ipc";
import { selfCheck as text } from "../i18n/ru";

/**
 * Проверка себя — карточка в настройках.
 *
 * Три решения:
 *
 *  * **проверки запускаются по кнопке**, а не при открытии экрана: они поднимают настоящие
 *    процессы, и делать это каждый раз при заходе в настройки было бы бесцеремонно;
 *  * **провал не прячется**: строка с `passed: false` остаётся в списке с тем, что увидели, —
 *    «проверок прошло 4 из 5» и причина честнее зелёной галочки;
 *  * **в браузере проверять нечего** — сказано прямо, а не пустым списком.
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
  lead: { color: tokens.colorNeutralForeground2 },
  muted: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  list: { display: "flex", flexDirection: "column", gap: "8px", margin: 0, padding: 0 },
  row: { display: "flex", flexDirection: "column", gap: "2px", listStyle: "none" },
  head: { display: "flex", gap: "8px", alignItems: "baseline" },
  pass: { color: tokens.colorPaletteGreenForeground1 },
  fail: { color: tokens.colorPaletteRedForeground1 },
});

export function SelfCheckCard() {
  const styles = useStyles();
  const [verdicts, setVerdicts] = useState<SelfCheckVerdict[] | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = () => {
    setRunning(true);
    setError(null);
    selfCheck()
      .then((result) => setVerdicts(result))
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : String(reason)),
      )
      .finally(() => setRunning(false));
  };

  const passed = verdicts?.filter((verdict) => verdict.passed).length ?? 0;
  const allPassed = verdicts !== null && verdicts.length > 0 && passed === verdicts.length;

  return (
    <div className={styles.card}>
      <div>
        <Text weight="semibold">{text.title}</Text>
        <Text className={styles.lead} block>
          {text.lead}
        </Text>
      </div>

      <div>
        <Button onClick={run} disabled={running}>
          {running ? text.running : text.run}
        </Button>
      </div>

      {error ? (
        <Text className={styles.fail} block>
          {text.error(error)}
        </Text>
      ) : null}

      {verdicts === null ? (
        <Text className={styles.muted} block>
          {text.idle}
        </Text>
      ) : verdicts.length === 0 ? (
        <Text className={styles.muted} block>
          {text.browser}
        </Text>
      ) : (
        <>
          <Text weight={allPassed ? "semibold" : "regular"} block>
            {text.summary(passed, verdicts.length)}
          </Text>
          <ul className={styles.list}>
            {verdicts.map((verdict) => (
              <li key={verdict.name} className={styles.row}>
                <div className={styles.head}>
                  <Text className={verdict.passed ? styles.pass : styles.fail}>
                    {verdict.passed ? "✓" : "✗"}
                  </Text>
                  <Text weight="semibold">{verdict.name}</Text>
                  <Text className={styles.muted}>{verdict.ms} мс</Text>
                  {verdict.passed ? null : (
                    <Text className={styles.fail}>{text.failed}</Text>
                  )}
                </div>
                <Text className={styles.muted}>{verdict.promise}</Text>
                <Text className={styles.muted}>{verdict.detail}</Text>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
