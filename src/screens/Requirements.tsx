import { useMemo, useState } from "react";
import { Button, makeStyles, Text, tokens } from "@fluentui/react-components";
import { describe as economyDescribe, look, parse as parseMode, work } from "../lib/economy";
import { report as batteryReport, hours } from "../lib/battery";
import { delay, payload, waiting } from "../lib/harshEnv";
import { checkMachines, whyThree, type Machine } from "../lib/threeMachines";

/**
 * «Требования и слабая машина» (шаги 232, 236, 253, 492).
 *
 * Четыре обещания, каждое из которых проверяемо только числом:
 *
 *  * **экономный режим** — реже замеры, короче анимации, и **та же работа**:
 *    режим не имеет права менять ни список дел, ни порог подтверждения;
 *  * **батарея** — «экономно» проверить нельзя, а «0,4 %/час» можно;
 *  * **медленная и пустая машина** — ожидание названо с числом секунд, а
 *    пустые данные это данные, а не ошибка;
 *  * **три машины** — набор из трёх средних слабую не заменяет.
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
});

/**
 * Замеры батареи: десять минут простоя и десять — разговора.
 *
 * Покрытие больше минимума (5 минут) намеренно: замер на двух минутах правило
 * честно назвало бы «не измерено», и экран показывал бы причину вместо числа.
 */
const SAMPLES = [
  { at: 0, percent: 92.0, busy: false },
  { at: 5 * 60_000, percent: 91.96, busy: false },
  { at: 10 * 60_000, percent: 91.93, busy: false },
  { at: 0, percent: 92.0, busy: true },
  { at: 5 * 60_000, percent: 91.65, busy: true },
  { at: 10 * 60_000, percent: 91.3, busy: true },
];

/** Три машины приёмки: слабая — обязательна, не «если найдётся». */
const MACHINES: readonly Machine[] = [
  { name: "ноутбук 2015, 4 ГБ", class: "слабая", ram: 4, disk: 12 },
  { name: "рабочая, 8 ГБ", class: "средняя", ram: 8, disk: 60 },
  { name: "новая, 16 ГБ", class: "сильная", ram: 16, disk: 200 },
];

/** Та же работа в обоих режимах — то, что режим не имеет права изменить. */
const SAME_WORK = { actions: 835, confirmFrom: "опасное", refusal: "не выполняю без подтверждения" };

export function Requirements() {
  const styles = useStyles();
  const [mode, setMode] = useState(parseMode(null));
  const [slow, setSlow] = useState(false);
  const [empty, setEmpty] = useState(false);

  // Слабая машина: замеры раз в 10 секунд по железу. Режим её не подменяет.
  const hardware = { poll: 10_000, progress: 2_000, clock: 1_000 };
  const normal = look("auto", hardware);
  const economy = look("economy", hardware);
  const chosen = mode === "economy" ? economy : normal;

  const idleWork = work(SAME_WORK, "auto");
  const economyWork = work(SAME_WORK, "economy");
  const sameWork = idleWork.actions === economyWork.actions && idleWork.confirmFrom === economyWork.confirmFrom;

  const battery = useMemo(() => batteryReport(SAMPLES), []);

  // Пустая машина — отдельный случай, а не «медленная без данных»:
  // иначе проверяется одна крайность из двух.
  const env = empty ? "empty" : slow ? "slow" : "normal";
  const shown = payload(env, { facts: 3 }, { facts: 0 });

  const machineProblems = checkMachines(MACHINES);

  return (
    <div className={styles.root}>
      <div>
        <Text as="h1" size={600} weight="semibold" block>
          Требования и слабая машина
        </Text>
        <Text className={styles.lead} block>
          Здесь всё проверяемое: числа, а не «экономно» и «быстро». Если что-то не измерено — так и
          сказано.
        </Text>
      </div>

      <div className={styles.card}>
        <Text weight="semibold" block>
          {economyDescribe(mode)}
        </Text>
        <div className={styles.row}>
          <Button appearance={mode === "auto" ? "primary" : "secondary"} aria-pressed={mode === "auto"} onClick={() => setMode("auto")}>
            обычный
          </Button>
          <Button appearance={mode === "economy" ? "primary" : "secondary"} aria-pressed={mode === "economy"} onClick={() => setMode("economy")}>
            экономный
          </Button>
        </div>
        <Text className={styles.muted} block>
          {`замеры раз в ${chosen.cadence.poll} мс, анимации ${chosen.animationMs} мс`}
        </Text>
        <Text className={styles.muted} block>
          {sameWork
            ? `работа та же: ${economyWork.actions} дел, подтверждение от «${economyWork.confirmFrom}», отказ «${economyWork.refusal}»`
            : "работа изменилась — это дефект: режим не имеет права менять дела"}
        </Text>
        <Text className={styles.muted} block>
          слабая машина получает редкие замеры по железу, а не по режиму — иначе «экономно» значит «хуже»
        </Text>
      </div>

      <div className={styles.card}>
        <Text weight="semibold" block>
          Батарея: число, а не обещание
        </Text>
        <Text className={styles.muted} block>
          {battery.said}
        </Text>
        <Text className={styles.muted} block>
          {`от 50% заряда: ${hours(50, battery.busy.perHour) ?? "не измерено"} ч в разговоре`}
        </Text>
        <Text className={styles.muted} block>
          {battery.idle.perHour === null
            ? "простой не измерен — и это сказано, а не заменено оценкой"
            : "простой измерен: точки простоя в замерах есть"}
        </Text>
      </div>

      <div className={styles.card}>
        <Text weight="semibold" block>
          Медленная и пустая машина
        </Text>
        <div className={styles.row}>
          <Button appearance={slow ? "primary" : "secondary"} aria-pressed={slow} onClick={() => setSlow(!slow)}>
            {slow ? "медленная машина" : "обычная машина"}
          </Button>
          <Button appearance={empty ? "primary" : "secondary"} aria-pressed={empty} onClick={() => setEmpty(!empty)}>
            {empty ? "пустая машина" : "с данными"}
          </Button>
        </div>
        <Text className={styles.muted} block role="status" aria-live="polite">
          {waiting(env, slow ? delay(env) : 0) ?? "ожидание короткое: объяснять нечего"}
        </Text>
        <Text className={styles.muted} block>
          {`пустые данные — это данные: ${shown.facts} фактов, и это не ошибка`}
        </Text>
      </div>

      <div className={styles.card}>
        <Text weight="semibold" block>
          {machineProblems.length === 0 ? `Приёмка на ${MACHINES.length} машинах разной силы` : `В наборе машин ${machineProblems.length} проблем`}
        </Text>
        <ul className={styles.list}>
          {MACHINES.map((machine) => (
            <li key={machine.name}>
              <Text className={styles.mono}>{`${machine.name} · ${machine.ram} ГБ · ${machine.disk} ГБ свободно`}</Text>
              <Text className={styles.muted} block>
                {`класс «${machine.class}»`}
              </Text>
            </li>
          ))}
        </ul>
        {machineProblems.map((problem) => (
          <Text key={problem} className={styles.muted} role="alert">
            {problem}
          </Text>
        ))}
        <details>
          <summary className={styles.muted}>почему три машины, а не одна</summary>
          <ul className={styles.list}>
            {whyThree().map((item) => (
              <li key={item.class}>
                <Text className={styles.muted}>{`«${item.class}» ловит: ${item.catches}`}</Text>
              </li>
            ))}
          </ul>
        </details>
      </div>
    </div>
  );
}
