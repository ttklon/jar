import { useState } from "react";
import { Button, makeStyles, Text, tokens } from "@fluentui/react-components";
import { SCALES, describe, metrics, parse, type Scale } from "../lib/textScale";

/**
 * «Размер текста» — масштаб интерфейса, выбранный человеком (шаг 10).
 *
 * Правило `textScale` было написано и не подключено: масштабы 125/150/200%
 * существовали в виде функций, но человек их не видел. Масштаб, который нельзя
 * выбрать, — это обещание доступности, которого нет.
 *
 * Три вещи, без которых такая настройка бесполезна:
 *
 *  1. **видно, сколько будет.** «150%» ничего не говорит глазу; рядом стоит
 *     «строка 21 px» — число из правила, а не выдуманное;
 *  2. **не отключается.** Масштаб нельзя «вернуть к норме» насильно: список
 *     закрытый (100–200%), но уменьшить человека никто не заставляет;
 *  3. **запоминается.** Выбор переживает перезапуск: иначе человек с плохим
 *     зрением повторяет это каждое утро.
 */

export const TEXT_SCALE_KEY = "jar.textScale";

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
  row: { display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" },
  muted: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
});

/** Что было выбрано в прошлый раз. Необещанный масштаб приводится к обещанному. */
export function readScale(store: Pick<Storage, "getItem"> | undefined): Scale {
  const raw = Number(store?.getItem(TEXT_SCALE_KEY) ?? "");
  return parse(Number.isFinite(raw) ? raw : null);
}

/** Применить масштаб к окну: корневой размер строки, от которого считаются все. */
export function applyScale(scale: Scale, root: HTMLElement | null): void {
  if (!root) return;
  root.style.fontSize = `${metrics(scale).line}px`;
}

export function TextSizeCard({ onChange }: { onChange?: (scale: Scale) => void } = {}) {
  const styles = useStyles();
  const [scale, setScale] = useState<Scale>(() => readScale(globalThis.localStorage));
  const [said, setSaid] = useState<string | null>(null);

  const choose = (next: Scale) => {
    setScale(next);
    globalThis.localStorage?.setItem(TEXT_SCALE_KEY, String(next));
    applyScale(next, globalThis.document?.documentElement ?? null);
    // Словами правила: масштаб и что стало со строкой. «Готово» не говорит глазу ничего.
    setSaid(describe(next));
    onChange?.(next);
  };

  return (
    <div className={styles.card}>
      <div>
        <Text weight="semibold" block>
          Размер текста
        </Text>
        <Text className={styles.muted} block>
          Крупнее текст — крупнее кнопки и шире строка. Меньше 100% не бывает: уменьшать нечего.
        </Text>
      </div>
      <div className={styles.row} role="radiogroup" aria-label="размер текста">
        {SCALES.map((option) => (
          <Button
            key={option}
            size="small"
            appearance={scale === option ? "primary" : "subtle"}
            aria-pressed={scale === option}
            aria-label={`размер текста ${Math.round(option * 100)} процентов`}
            onClick={() => choose(option)}
          >
            {`${Math.round(option * 100)}%`}
          </Button>
        ))}
      </div>
      {/* Подтверждение — число из правила: «строка 21 px». */}
      <Text className={styles.muted} role="status" aria-live="polite">
        {said ?? describe(scale)}
      </Text>
    </div>
  );
}
