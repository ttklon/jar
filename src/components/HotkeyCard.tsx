import { useState } from "react";
import { Button, Input, makeStyles, Text, tokens } from "@fluentui/react-components";
import { assign, current as currentCombo, pretty, suggest } from "../lib/hotkeySaved";
import { format, type Combo } from "../lib/hotkeyFree";

/**
 * «Горячая клавиша» — назначение с проверкой до сохранения (шаг 97).
 *
 * Главная ошибка, которую правило `hotkeySaved` исключает: **сохранили, а оно не
 * работает**. Человек нажимает «назначить», клавиша занята другой программой, и
 * он узнаёт об этом через неделю, когда она не срабатывает.
 *
 * Поэтому здесь нет «сохранить и посмотреть»: проверка идёт **до** назначения, а
 * при отказе предлагается **свободная** клавиша из проверенных, а не «попробуйте
 * другую».
 *
 * Занятость определяется по списку системных сочетаний и по тому, что человек уже
 * назначил. Проверить занятость чужими программами без системного вызова нельзя —
 * и это честно называется, а не выдаётся за «свободна».
 */

const useStyles = makeStyles({
  card: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    padding: "16px 18px",
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground2,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  row: { display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" },
  muted: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  mono: { fontFamily: tokens.fontFamilyMonospace },
});

/**
 * Разобрать то, что человек нажал.
 *
 * Принимается форма «Ctrl+Alt+Space» — та же, что показывает подсказка. Непонятное
 * не превращается в «наверное, Ctrl+Alt+Z»: возвращается `null`, и об этом
 * говорится.
 */
export function parse(text: string): Combo | null {
  const parts = text
    .split("+")
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part !== "");
  if (parts.length < 2) return null;
  const mods = parts.filter((part): part is "ctrl" | "alt" | "shift" | "win" => ["ctrl", "alt", "shift", "win"].includes(part));
  const key = parts.find((part) => !["ctrl", "alt", "shift", "win"].includes(part));
  if (key === undefined || key.length === 0) return null;
  return { mods, key };
}

export function HotkeyCard({ taken = [] as readonly string[] } = {}) {
  const styles = useStyles();
  const [active, setActive] = useState<Combo>(() => currentCombo());
  const [want, setWant] = useState(format(currentCombo()));
  const [said, setSaid] = useState<string | null>(null);
  const [bad, setBad] = useState(false);

  const choose = () => {
    const combo = parse(want);
    if (combo === null) {
      setBad(true);
      setSaid("нужны хотя бы модификатор и клавиша: например, Ctrl+Alt+Space");
      return;
    }
    setBad(false);
    // Проверка — до сохранения. Здесь «занято чужими программами» неизвестно,
    // поэтому в список идут системные сочетания и уже назначенные клавиши.
    const known = new Set([...taken, format(active).toLowerCase()]);
    // Занятое **не выкидывается** из списка: иначе проверка занятости проверяла
    // бы пустоту, и занятая клавиша молча сохранялась бы. Именно это и ловил тест.
    const got = assign(combo, active, [...known], true);
    setSaid(got.said);
    if (got.saved) setActive(got.active);
    else {
      // Отказ — и сразу свободная клавиша из проверенных, а не «попробуйте».
      const next = suggest([...known]);
      if (next.combo !== null) setSaid(`${got.said}. Свободна: ${pretty(next.combo)}`);
    }
  };

  return (
    <div className={styles.card}>
      <div>
        <Text weight="semibold" block>
          Горячая клавиша
        </Text>
        <Text className={styles.muted} block>
          Показывает и скрывает окно из любой программы; ничего не выполняет.
        </Text>
      </div>
      <div className={styles.row}>
        <Text className={styles.muted}>сейчас:</Text>
        <Text className={styles.mono}>{pretty(active)}</Text>
      </div>
      <div className={styles.row}>
        <Input
          aria-label="новое сочетание клавиш"
          value={want}
          onChange={(_, data) => setWant(data.value)}
          placeholder="Ctrl+Alt+Space"
        />
        <Button onClick={choose}>назначить</Button>
      </div>
      {said !== null ? (
        <Text className={styles.muted} role={bad ? "alert" : "status"} aria-live="polite">
          {said}
        </Text>
      ) : null}
    </div>
  );
}
