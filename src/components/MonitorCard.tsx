import { useMemo, useState } from "react";
import { Button, makeStyles, Text, tokens } from "@fluentui/react-components";
import { hintBox, placeWindow, VISIBLE_PART, type Monitor } from "../lib/monitors";

/**
 * «Окно и экраны» (шаг 228 / шаг 66).
 *
 * Частый настоящий дефект: человек отключил внешний монитор или поменял масштаб
 * с 150% на 100% — и приложение открывается **за пределами** рабочего стола. Окна
 * не видно, а в панели задач оно есть; человек думает, что программа не
 * запустилась.
 *
 * Здесь две вещи, которые видно глазом:
 *
 *  * **где окажется окно**, если экраны поменялись, — с причиной, а не молча;
 *  * **сколько окна должно быть видно**, чтобы это считалось «на месте»:
 *    четверть, а не «хоть пиксель».
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
  muted: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  mono: { fontFamily: tokens.fontFamilyMonospace, fontSize: tokens.fontSizeBase200 },
});

/** Два экрана: ноутбук 150% и монитор 100% — тот самый случай. */
const TWO: readonly Monitor[] = [
  { x: 0, y: 0, width: 1280, height: 800, scale: 1.5, primary: true },
  { x: 1280, y: 0, width: 2560, height: 1440, scale: 1 },
];

const ONE: readonly Monitor[] = [{ x: 0, y: 0, width: 1280, height: 800, scale: 1.5, primary: true }];

export function MonitorCard() {
  const styles = useStyles();
  const [onlyOne, setOnlyOne] = useState(true);
  const monitors = onlyOne ? ONE : TWO;

  // Окно, сохранённое на внешнем мониторе: после его отключения видно ноль.
  const saved = useMemo(() => ({ x: 2600, y: 200, width: 1000, height: 700 }), []);
  const placed = placeWindow(saved, monitors);
  const hint = hintBox(
    { x: 1200, y: 300, width: 200, height: 60 },
    { width: 320, height: 120 },
    monitors,
  );

  return (
    <div className={styles.card}>
      <div>
        <Text weight="semibold" block>
          Окно и экраны
        </Text>
        <Text className={styles.muted} block>
          {`Окно считается «на месте», если видно хотя бы ${Math.round(VISIBLE_PART * 100)}%: человек вправе сдвинуть его за край, но меньше четверти — это уже не найти`}
        </Text>
      </div>

      <div className={styles.row}>
        <Button
          appearance={onlyOne ? "primary" : "secondary"}
          aria-pressed={onlyOne}
          onClick={() => setOnlyOne(true)}
        >
          один экран
        </Button>
        <Button
          appearance={!onlyOne ? "primary" : "secondary"}
          aria-pressed={!onlyOne}
          onClick={() => setOnlyOne(false)}
        >
          ноутбук и монитор
        </Button>
      </div>

      <Text className={styles.muted} block role="status" aria-live="polite">
        {placed.moved
          ? placed.why
          : "окно там, где его оставили: оно видно, и двигать его незачем"}
      </Text>
      <Text className={styles.mono}>
        {`окно: ${placed.box.x}, ${placed.box.y} · ${placed.box.width}×${placed.box.height}`}
      </Text>

      <Text className={styles.muted} block>
        {`подсказка не уезжает на соседний экран: ${hint.x}, ${hint.y}, ${hint.width}×${hint.height}`}
      </Text>

      <details>
        <summary className={styles.muted}>почему это ломается и чего мы не делаем</summary>
        <ul className={styles.row}>
          <li>
            <Text className={styles.muted}>
              приложение живёт в логических координатах, Windows отдаёт физические, а масштаб на
              каждом мониторе свой
            </Text>
          </li>
          <li>
            <Text className={styles.muted}>
              если мониторов не знаем — не двигаем: догадка о чужих экранах хуже, чем сохранённое
              место
            </Text>
          </li>
          <li>
            <Text className={styles.muted}>
              место сохраняется при закрытии окна: иначе возвращать нечего
            </Text>
          </li>
        </ul>
      </details>
    </div>
  );
}
