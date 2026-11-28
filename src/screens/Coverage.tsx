import { useMemo, useState } from "react";
import { Button, makeStyles, Text, tokens } from "@fluentui/react-components";
import {
  check,
  checks,
  notDo,
  summary,
  verdict,
  whereItWorks,
  FLOOR,
  type Cover,
} from "../lib/coverageHonest";

/**
 * «Покрытие» (шаг 487).
 *
 * Процент покрытия — самый обманчивый показатель в проекте. «Покрытие 94%»
 * звучит как ответ, а на деле скрывает файл, которого не проверяли ни разу.
 *
 * Поэтому здесь три вещи, и ни одна не «процент на проект»:
 *
 *  * **рядом со средним всегда худший модуль** — по имени;
 *  * **исполнен ≠ проверен**: строки, которые вызывали без единого `expect`, —
 *    худший случай, потому что выглядят хорошо;
 *  * **порог по модулю**, а не по проекту: ниже половины — назван по имени.
 */

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", gap: "16px" },
  card: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    padding: "16px 18px",
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground2,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  row: { display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" },
  list: { display: "flex", flexDirection: "column", gap: "6px", margin: 0, padding: 0, listStyle: "none" },
  muted: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  mono: { fontFamily: tokens.fontFamilyMonospace, fontSize: tokens.fontSizeBase200 },
  lead: { color: tokens.colorNeutralForeground2, maxWidth: "78ch" },
  bad: { color: tokens.colorPaletteRedForeground2 },
});

/** Модули: здоровый, исполненный без утверждений и почти непокрытый. */
const HONEST: readonly Cover[] = [
  { path: "src/lib/planCheck.ts", lines: 300, hit: 270, asserted: 268, importedByTest: true },
  { path: "src/lib/dangerPolicy.ts", lines: 200, hit: 190, asserted: 190, importedByTest: true },
  { path: "src/lib/scheduleStore.ts", lines: 240, hit: 231, asserted: 229, importedByTest: true },
];

const WITH_PROBLEMS: readonly Cover[] = [
  ...HONEST,
  // Исполнен, но ни одного утверждения: выглядит покрытым, а это не проверка.
  { path: "src/lib/logReader.ts", lines: 160, hit: 158, asserted: 0, importedByTest: true },
  // Ниже половины: общий процент его прикрывает, а теста нет.
  { path: "src-tauri/src/people.rs", lines: 200, hit: 40, asserted: 12, importedByTest: false },
];

export function Coverage() {
  const styles = useStyles();
  const [honest, setHonest] = useState(false);
  const covers = honest ? HONEST : WITH_PROBLEMS;
  const got = useMemo(() => summary(covers), [covers]);
  const problems = useMemo(() => check(covers), [covers]);

  return (
    <div className={styles.root}>
      <div>
        <Text as="h1" size={600} weight="semibold" block>
          Покрытие
        </Text>
        <Text className={styles.lead} block>
          Здесь процент не врёт: рядом с средним стоит худший модуль, а «исполняли» и «проверяли» —
          разные слова.
        </Text>
      </div>

      <div className={styles.card}>
        <Text weight="semibold" block>
          {problems.length === 0 ? "Модули выше порога, и у каждого есть утверждения" : `Проблем: ${problems.length}`}
        </Text>
        <Text className={styles.muted} block role="status" aria-live="polite">
          {got.said}
        </Text>
        <ul className={styles.list}>
          {covers.map((cover) => {
            const share = cover.lines === 0 ? 0 : Math.round((cover.hit / cover.lines) * 100);
            const view = verdict(cover);
            return (
              <li key={cover.path}>
                <Text className={styles.mono}>{`${cover.path} — ${share}% · ${view}`}</Text>
                <Text className={styles.muted} block>
                  {view === "исполнен"
                    ? "строки исполнялись, но ни одного утверждения — это не проверка"
                    : view === "не покрыт"
                      ? `ниже порога ${Math.round(FLOOR * 100)}%: общий процент его не прикрывает`
                      : "есть утверждения в тесте, который его импортирует"}
                </Text>
              </li>
            );
          })}
        </ul>
        {problems.length > 0
          ? problems.map((problem) => (
              <Text key={problem} className={styles.bad} role="alert">
                {problem}
              </Text>
            ))
          : null}
        <div className={styles.row}>
          <Button appearance={honest ? "primary" : "secondary"} aria-pressed={honest} onClick={() => setHonest(!honest)}>
            {honest ? "только здоровые модули" : "с проблемными модулями"}
          </Button>
        </div>
      </div>

      <div className={styles.card}>
        <Text weight="semibold" block>
          Где процент значит
        </Text>
        <ul className={styles.list}>
          {whereItWorks().map((line) => (
            <li key={line}>
              <Text className={styles.muted}>{line}</Text>
            </li>
          ))}
          {notDo().map((line) => (
            <li key={line}>
              <Text className={styles.muted}>{`не делает: ${line}`}</Text>
            </li>
          ))}
          {checks().map((line) => (
            <li key={line}>
              <Text className={styles.muted}>{`проверено: ${line}`}</Text>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
