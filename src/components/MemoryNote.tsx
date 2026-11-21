import { useEffect, useState } from "react";
import { makeStyles, Text, tokens } from "@fluentui/react-components";
import { isTauri } from "../ipc";
import { t } from "../i18n/ru";

/**
 * «Память не открылась» — предупреждение в настройках.
 *
 * Зачем отдельная карточка, а не строка в логе: повреждённая база раньше
 * выглядела как «память просто пустая». Приложение тихо переезжало на временную
 * и молчало, а человек терял прошлые параметры без единого объяснения. Молчание
 * здесь — худший вариант из трёх, потому что потерю нельзя ни заметить, ни
 * исправить.
 *
 * Три правила:
 *
 *  * **карточки нет, когда всё хорошо.** Постоянное «память в порядке» — шум,
 *    который приучает не читать предупреждения;
 *  * **файл не трогаем.** В тексте прямо сказано, что база цела: её можно
 *    сохранить и разобрать, и приложение её не перезаписывает;
 *  * **в браузере карточки нет.** Там ядра нет, и «база не открылась» было бы
 *    выдумкой.
 */

const useStyles = makeStyles({
  card: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    padding: "14px 16px",
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorPaletteYellowBackground2,
    border: `1px solid ${tokens.colorPaletteYellowBorder2}`,
  },
  lead: { color: tokens.colorNeutralForeground1 },
  detail: { color: tokens.colorNeutralForeground2 },
});

export function MemoryNote() {
  const styles = useStyles();
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!isTauri()) return;
    let alive = true;
    void import("../ipc/tauri")
      .then((ipc) => ipc.appStatus())
      .then((status) => {
        if (alive) setNote(status.memory_note ?? null);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  if (note === null) return null;

  return (
    <div className={styles.card} role="status" aria-live="polite">
      <Text weight="semibold">{t.settingsMemoryNote}</Text>
      <Text className={styles.detail}>{note}</Text>
    </div>
  );
}
