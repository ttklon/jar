import { useState } from "react";
import { Button, makeStyles, Text, tokens } from "@fluentui/react-components";
import { repair, selfCheck } from "../ipc";
import type { SelfCheckVerdict } from "../ipc";
import { selfCheck as text } from "../i18n/ru";
import { adviceForVerdict } from "../lib/repair";

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

/**
 * Отчёт после ремонта: было — сделали — стало.
 *
 * Почему не строка «Готово: …». Первый вопрос человека после починки — «а
 * помогло?», и ответ на него даёт повторная проверка, а не текст ремонта.
 * Поэтому `after` — это свежие вердикты, и они показываются те же, что и
 * обычные, а не пересказ «теперь всё хорошо».
 */
interface FixReport {
  /** Что было сломано: `detail` провалившейся проверки, до ремонта. */
  was: string;
  /** Что сделал ремонт, его словами. */
  done: string;
  /** Проверки после ремонта — измерение, а не обещание. */
  after: SelfCheckVerdict[];
}

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
  advice: { display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", marginTop: "4px" },
  fixLead: { color: tokens.colorNeutralForeground2, fontSize: tokens.fontSizeBase200 },
  report: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    padding: "10px 12px",
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground3,
  },
});

export function SelfCheckCard() {
  const styles = useStyles();
  const [verdicts, setVerdicts] = useState<SelfCheckVerdict[] | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Ремонт: что делаем сейчас, что вышло и что не вышло. Один за раз —
  // два ремонта сразу спорят за одни и те же файлы.
  const [fixing, setFixing] = useState<string | null>(null);
  const [fixed, setFixed] = useState<string | null>(null);
  const [fixError, setFixError] = useState<string | null>(null);
  // Шаг 357: отчёт после ремонта. «Готово» без «что было» — это половина
  // ответа: человек не помнит, что именно он чинил и стало ли иначе.
  const [report, setReport] = useState<FixReport | null>(null);

  const runChecks = () =>
    selfCheck()
      .then((result) => {
        setVerdicts(result);
        return result;
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : String(reason));
        return null;
      });

  const fix = (what: string, wasBroken: string) => {
    setFixing(what);
    setFixed(null);
    setFixError(null);
    setReport(null);
    repair(what)
      .then((result) => {
        // Пустой ответ — это браузер: ядра нет, чинить нечего. Говорим прямо,
        // а не показываем «Готово» без подробностей.
        setFixed(result === "" ? text.repairNothingHere : result);
        if (result === "") return null;
        // «Стало» — не обещание, а повторная проверка: «теперь всё хорошо»
        // было бы верой, а список вердиктов — измерением.
        return runChecks().then((after) =>
          after === null ? null : { was: wasBroken, done: result, after },
        );
      })
      .then((next) => {
        if (next !== null) setReport(next);
      })
      .catch((reason: unknown) =>
        setFixError(reason instanceof Error ? reason.message : String(reason)),
      )
      .finally(() => setFixing(null));
  };

  const run = () => {
    setRunning(true);
    setError(null);
    setReport(null);
    runChecks().finally(() => setRunning(false));
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

      {/* «Готово: …» показывается, только когда отчёта нет: иначе ремонт
          повторяется дважды — строкой и блоком «что было и что стало». */}
      {fixed && !report ? (
        <Text role="status" aria-live="polite" block>
          {text.repairDone(fixed)}
        </Text>
      ) : null}

      {/* Шаг 357: что было сломано и что стало после ремонта. Строка «стало»
          считается по свежим вердиктам, а не обещается текстом. */}
      {report ? (
        <div className={styles.report} role="status" aria-live="polite">
          <Text weight="semibold">{text.repairReport}</Text>
          <Text className={styles.muted}>{text.repairWas(report.was)}</Text>
          <Text className={styles.muted}>{text.repairDid(report.done)}</Text>
          <Text
            className={
              report.after.every((verdict) => verdict.passed) ? styles.pass : styles.fail
            }
          >
            {text.repairBecame(
              report.after.filter((verdict) => verdict.passed).length,
              report.after.length,
            )}
          </Text>
          {report.after.some((verdict) => !verdict.passed) ? (
            <Text className={styles.muted}>{text.repairStillBroken}</Text>
          ) : null}
        </div>
      ) : null}
      {fixError ? (
        <Text role="alert" aria-live="polite" className={styles.fail} block>
          {text.repairFailed(fixError)}
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
                {/* Риск — только у провала: у зелёной проверки «чем грозит»
                    звучало бы как угроза на ровном месте. */}
                {!verdict.passed && verdict.risk ? (
                  <Text className={styles.muted}>{text.risk(verdict.risk)}</Text>
                ) : null}
                {(() => {
                  const advice = adviceForVerdict(verdict);
                  if (!advice) return null;
                  return (
                    <div className={styles.advice}>
                      <Text className={styles.fixLead}>
                        {`${text.fix}: ${advice.why}`}
                      </Text>
                      {advice.action ? (
                        <Button
                          size="small"
                          appearance="secondary"
                          onClick={() => fix(advice.repair, verdict.detail)}
                          disabled={fixing !== null}
                        >
                          {fixing === advice.repair ? text.repairRunning : advice.action}
                        </Button>
                      ) : null}
                    </div>
                  );
                })()}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
