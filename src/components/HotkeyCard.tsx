import { useEffect, useState } from "react";
import { Button, Input, makeStyles, Text, tokens } from "@fluentui/react-components";
import { hotkeyAssign, hotkeyCurrent, isTauri } from "../ipc";
import { current as currentCombo, pretty, suggest } from "../lib/hotkeySaved";
import { format, type Combo } from "../lib/hotkeyFree";

/**
 * «Горячая клавиша» — назначение с проверкой до сохранения (шаг 97).
 *
 * Главная ошибка, которую правило `hotkeySaved` исключает: **сохранили, а оно не
 * работает**. Человек нажимает «назначить», клавиша занята другой программой, и
 * он узнаёт об этом через неделю, когда она не срабатывает.
 *
 * Поэтому здесь нет «сохранить и посмотреть». Два честных исхода:
 *
 *  * **в приложении** занятость проверяет ядро — регистрацией новой клавиши
 *    **до** снятия прежней. Windows не отдала — прежняя остаётся, причина
 *    приходит словами. Никакого «сохранено» по факту нажатия кнопки:
 *    `saved` ставится только по ответу ядра;
 *  * **в браузере** ядра нет, и проверять нечем. Тогда не «свободна», а «не
 *    знаю» — и назначение честно не выполняется, вместо обещания, которого
 *    не будет.
 *
 * Прежняя версия карточки говорила «сохранил» по факту нажатия: клавиша в ядре
 * была константой, и обещание было пустым. Это и был настоящий дефект — тот
 * самый «сохранили, а не работает», против которого написано правило.
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

/** Что человек видит про действующую клавишу. */
type State = {
  /** Что действует — словами. */
  shown: string;
  /** Удалось ли проверить занятость. */
  known: boolean;
  /** Почему не удалось. */
  why: string;
};

const NOTHING_CHECKED: State = { shown: pretty(currentCombo()), known: false, why: "" };

export function HotkeyCard() {
  const styles = useStyles();
  const [state, setState] = useState<State>(NOTHING_CHECKED);
  const [want, setWant] = useState(() => pretty(currentCombo()));
  const [said, setSaid] = useState<string | null>(null);
  const [bad, setBad] = useState(false);
  const [busy, setBusy] = useState(false);
  const tauri = isTauri();

  // Действующая клавиша — из ядра, а не из правила: если человек назначил свою
  // раньше, экран обязан показать именно её.
  useEffect(() => {
    if (!tauri) {
      setState((prev) => ({ ...prev, why: "занятость клавиши проверяется только в приложении: в браузере ядра нет" }));
      return;
    }
    let alive = true;
    void hotkeyCurrent()
      .then((got) => {
        if (!alive) return;
        setState({ shown: got.shown, known: got.known, why: got.why });
        setWant(got.shown);
      })
      .catch(() => {
        if (alive) setSaid("не удалось узнать действующую клавишу — показана та, что в правиле");
      });
    return () => {
      alive = false;
    };
  }, [tauri]);

  const choose = async () => {
    const combo = parse(want);
    if (combo === null) {
      setBad(true);
      setSaid("нужны хотя бы модификатор и клавиша: например, Ctrl+Alt+Space");
      return;
    }
    setBad(false);
    setSaid(null);

    if (!tauri) {
      // Ядра нет — проверять нечем. Говорим это, а не «сохранено».
      setSaid(`в браузере клавишу проверить и назначить нечем. В приложении проверю: ${format(combo)}`);
      return;
    }

    setBusy(true);
    try {
      const got = await hotkeyAssign(format(combo));
      setState({ shown: got.shown, known: got.known, why: got.why });
      setSaid(`${format(combo)} свободна: назначил и проверил регистрацией. Действует: ${got.shown}`);
    } catch (error) {
      // Отказ ядра — это отказ, а не «почти получилось»: прежняя клавиша жива.
      setBad(true);
      const reason = error instanceof Error ? error.message : String(error);
      setSaid(`${reason}`);
      const next = suggest([]);
      if (next.combo !== null) setSaid(`${reason}. Свободна: ${pretty(next.combo)}`);
    } finally {
      setBusy(false);
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
        <Text className={styles.mono}>{state.shown}</Text>
      </div>
      <div className={styles.row}>
        <Input
          aria-label="новое сочетание клавиш"
          value={want}
          onChange={(_, data) => setWant(data.value)}
          placeholder="Ctrl+Alt+Space"
        />
        <Button onClick={() => void choose()} disabled={busy}>
          назначить
        </Button>
      </div>
      {state.known ? null : (
        <Text className={styles.muted}>{state.why === "" ? "занятость не проверена" : state.why}</Text>
      )}
      {said !== null ? (
        <Text className={styles.muted} role={bad ? "alert" : "status"} aria-live="polite">
          {said}
        </Text>
      ) : null}
    </div>
  );
}
