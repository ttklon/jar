import { makeStyles, Text, tokens } from "@fluentui/react-components";
import { budget as handBudget, ifTooBig, steps as handSteps, BUDGET as HAND_BUDGET } from "../lib/handIn30";
import { ifSlow, parts, summary, TOTAL } from "../lib/fiveMinutes";

/**
 * «Сборка и проверки» (шаги 481, 476).
 *
 * Два обещания, которые нельзя проверить обещанием:
 *
 *  * **один прогон всех проверок не дольше пяти минут**. Проверку, которая идёт
 *    двадцать минут, **не запускают**: сначала «сделаю потом», потом никогда;
 *  * **рука добавляется за тридцать минут**. Руководство, по которому это не так,
 *    врёт в самом полезном месте — новому человеку.
 *
 * Здесь видно и то, и другое числом: бюджеты частей, что вышло за свой бюджет, и
 * сумму шагов руководства. И честно сказано, **что бюджет — не замер**: замер
 * даёт CI, а экран показывает, во что прогон должен укладываться.
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
  list: { display: "flex", flexDirection: "column", gap: "6px", margin: 0, padding: 0, listStyle: "none" },
  muted: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  mono: { fontFamily: tokens.fontFamilyMonospace, fontSize: tokens.fontSizeBase200 },
  lead: { color: tokens.colorNeutralForeground2, maxWidth: "78ch" },
});

export function Build() {
  const styles = useStyles();
  const run = summary();
  const hand = handBudget();

  return (
    <div className={styles.root}>
      <div>
        <Text as="h1" size={600} weight="semibold" block>
          Сборка и проверки
        </Text>
        <Text className={styles.lead} block>
          Прогон всех проверок — не дольше пяти минут, иначе его не запускают. Рука добавляется за
          тридцать минут, иначе руководством не пользуются.
        </Text>
      </div>

      <div className={styles.card}>
        <Text weight="semibold" block>
          {run.ok ? "Прогон укладывается в бюджет" : "Прогон вышел за бюджет"}
        </Text>
        <Text className={styles.muted} block role="status" aria-live="polite">
          {run.said}
        </Text>
        <ul className={styles.list}>
          {parts().map((part) => {
            const over = part.took > part.budget;
            return (
              <li key={part.name}>
                <Text className={styles.mono}>
                  {`${part.name}: ${part.took} с из ${part.budget}`}
                </Text>
                <Text className={styles.muted} block>
                  {over ? "вышла за свой бюджет — ускорять её, а не весь прогон" : "в бюджете"}
                </Text>
              </li>
            );
          })}
        </ul>
        <Text className={styles.muted} block>
          {`всего ${TOTAL} секунд на всё: частей ${parts().length}, у каждой свой бюджет`}
        </Text>
        <details>
          <summary className={styles.muted}>что делать, если часть стала медленной</summary>
          <ul className={styles.list}>
            {ifSlow().map((line) => (
              <li key={line}>
                <Text className={styles.muted}>{line}</Text>
              </li>
            ))}
          </ul>
        </details>
      </div>

      <div className={styles.card}>
        <Text weight="semibold" block>
          {`Рука за ${HAND_BUDGET} минут: ${hand.said}`}
        </Text>
        <ul className={styles.list}>
          {handSteps().map((step) => (
            <li key={step.n}>
              <Text className={styles.mono}>{`${step.n}. ${step.do} — ${step.minutes} мин`}</Text>
              {/* Что делать, если не уложился: сократить шаги, а не бюджет. */}
              <Text className={styles.muted} block>
                {step.ifLate}
              </Text>
            </li>
          ))}
        </ul>
        <details>
          <summary className={styles.muted}>рука не влезает — что тогда</summary>
          <ul className={styles.list}>
            {ifTooBig().map((line) => (
              <li key={line}>
                <Text className={styles.muted}>{line}</Text>
              </li>
            ))}
          </ul>
        </details>
      </div>
    </div>
  );
}
