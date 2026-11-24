import { Badge, Button, Text } from "@fluentui/react-components";
import { makeStyles, tokens } from "@fluentui/react-components";
import type { StateItem } from "../lib/state";
import { CONDITION_HINT, CONDITION_LABEL, headline, nextStep, summarize } from "../lib/state";
import { emptyLine } from "../lib/empty";
import { promise as reinstallPromise } from "../lib/reinstall";

/**
 * Экран «Состояние» (шаг 1).
 *
 * Один взгляд — вся правда о «можно/нельзя». Раньше её приходилось собирать из
 * десяти экранов и README, и человек верил первому экрану, на который смотрел.
 *
 * Что здесь сделано нарочно:
 *
 *  * **состояние словом, а не цветом**. Цвет — подсказка, слово — ответ. Дальтоник
 *    и диктор видят то же, что зрячий: «провал» и «проверено на этой машине»
 *    отличаются буквами, а не оттенком;
 *  * **чем подтверждено** рядом с каждым пунктом. Пункт без подтверждения
 *    показан как «не проверено» и не спрятан;
 *  * **что делать первым** — одна кнопка, а не список дел. Порядок по цене
 *    бездействия, а не по расположению;
 *  * **переход к месту** с каждого пункта: состояние без пути к исправлению —
 *    это диагноз без лечения, человек уходит искать сам.
 */

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", gap: "16px" },
  lead: { color: tokens.colorNeutralForeground2, maxWidth: "70ch" },
  band: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: "12px",
    padding: "12px 16px",
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  number: { fontSize: tokens.fontSizeBase500, fontWeight: tokens.fontWeightSemibold },
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "8px" },
  row: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "12px",
    padding: "12px 16px",
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  main: { display: "flex", flexDirection: "column", gap: "2px", minWidth: "240px", flex: "1 1 320px" },
  muted: { color: tokens.colorNeutralForeground3 },
  evidence: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  // Цвет — только подсказка к слову, никогда вместо него.
  proven: { backgroundColor: tokens.colorPaletteGreenBackground2 },
  failed: { backgroundColor: tokens.colorPaletteRedBackground2 },
  notChecked: { backgroundColor: tokens.colorPaletteYellowBackground2 },
  action: { display: "flex", alignItems: "center", gap: "8px", flex: "0 0 auto" },
});

/** Значок состояния. Слово в нём — главное, цвет — вспомогательное. */
function ConditionBadge({ condition, styles }: { condition: StateItem["condition"]; styles: ReturnType<typeof useStyles> }) {
  const className =
    condition === "proven-here"
      ? styles.proven
      : condition === "failed"
        ? styles.failed
        : condition === "not-checked"
          ? styles.notChecked
          : undefined;
  return (
    <Badge appearance="tint" className={className} shape="rounded">
      {CONDITION_LABEL[condition]}
    </Badge>
  );
}

export interface StateScreenProps {
  items: StateItem[];
  /** Переход на экран из ленты. Не выдуманный адрес: экраны настоящие. */
  onGo: (screen: string) => void;
}

export function StateScreen({ items, onGo }: StateScreenProps) {
  const styles = useStyles();
  const summary = summarize(items);
  const first = nextStep(items);

  return (
    <div className={styles.root}>
      <div>
        <Text as="h1" size={700} weight="semibold" block>
          Состояние
        </Text>
        <Text className={styles.lead} block>
          Что работает на этой машине, что не проверено и что сломалось. У каждого
          пункта сказано, где и чем это проверено, — чтобы «работает» не значило
          «кажется, работает».
        </Text>
        {/* Шаг 219: вопрос «а если переустановить — опять всё качать?» задаётся
            раньше, чем человек нажмёт «удалить». Ответ — списками: «данные
            в безопасности» каждый понимает по-своему. */}
        <Text className={styles.lead} block>
          {reinstallPromise()}
        </Text>
      </div>

      {/* Сводка называет числа. Из неё видно, чего мы не знаем, — а это и есть
          честность, к которой весь шаг. */}
      <div className={styles.band}>
        <Text className={styles.number}>{headline(summary)}</Text>
        {first ? (
          <div className={styles.action}>
            <Text className={styles.muted}>начать с «{first.title}»</Text>
            <Button appearance="primary" onClick={() => onGo(first.screen)}>
              Открыть
            </Button>
          </div>
        ) : (
          <Text className={styles.muted}>делать нечего — всё проверено здесь</Text>
        )}
      </div>

      {/* Пустой список не молчит (шаг 9): молчание читается как «всё хорошо», а
          здесь это значило бы «ничего не проверяли» — разные вещи. */}
      {emptyLine(items, "nothing-yet") ? (
        <Text className={styles.muted}>{emptyLine(items, "nothing-yet")}</Text>
      ) : null}

      <ul className={styles.list}>
        {items.map((item) => {
          // Показываем нормализованное: «проверено» без доказательства — это не
          // проверено, и в списке должно быть так же, как в сводке.
          const shown = item.condition === "proven-here" && !item.evidence ? { ...item, condition: "not-checked" as const } : item;
          return (
            <li key={item.id} className={styles.row}>
              <div className={styles.main}>
                <Text weight="semibold">{item.title}</Text>
                <Text className={styles.muted} block>
                  {item.hint}
                </Text>
                <Text className={styles.evidence} block>
                  {CONDITION_HINT[shown.condition]}
                  {shown.evidence ? ` · ${shown.evidence}` : ""}
                </Text>
              </div>
              <div className={styles.action}>
                <ConditionBadge condition={shown.condition} styles={styles} />
                <Button appearance="subtle" onClick={() => onGo(item.screen)}>
                  Открыть
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
