import { useCallback, useEffect, useState } from "react";
import { Button, makeStyles, Text, tokens } from "@fluentui/react-components";
import { isTauri } from "../ipc";
import { t } from "../i18n/ru";
import { ErrorLine } from "./ErrorLine";

/**
 * «Резервные копии памяти» — в настройках, рядом с предупреждением о базе.
 *
 * Зачем это вообще нужно. Память — единственное, что приложение знает о человеке:
 * его привычки, названия программ, прошлые поручения. Когда файл повреждается,
 * `MemoryNote` честно говорит об этом, но дальше человеку нечего сделать — и
 * честное предупреждение без выхода равно потере. Здесь выход.
 *
 * Четыре правила:
 *
 *  * **видно до нажатия.** Каждая копия показана с годностью и размером: список
 *    без пометок заставлял бы гадать, какая из них спасёт;
 *  * **битая копия видна, но не предлагается.** Она в списке с причиной, а кнопка
 *    у неё недоступна: прятать её — значит врать, что её нет;
 *  * **восстановление спрашивает.** Оно заменяет файл, и одно нажатие без вопроса
 *    было бы слишком дешёвым для необратимого действия;
 *  * **в браузере карточки нет.** Там нет ядра и нет файлов — показывать
 *    «копий нет» значило бы выдумывать.
 */

type BackupRow = {
  file: string;
  bytes: number;
  usable: boolean;
  problem: string;
};

type Restored = { file: string; previous: string | null; bytes: number };

const useStyles = makeStyles({
  card: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    padding: "14px 16px",
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground2,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    flexWrap: "wrap",
  },
  grow: { flexGrow: 1 },
  muted: { color: tokens.colorNeutralForeground2 },
  size: { color: tokens.colorNeutralForeground3, fontVariantNumeric: "tabular-nums" },
  problem: { color: tokens.colorPaletteRedForeground1 },
  ask: { color: tokens.colorNeutralForeground2 },
});

/** Размер по-человечески: байты никому ничего не говорят. */
export function humanBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} КБ`;
  return `${(kb / 1024).toFixed(1)} МБ`;
}

export function MemoryBackups() {
  const styles = useStyles();
  const [rows, setRows] = useState<BackupRow[] | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  const [done, setDone] = useState<Restored | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const ipc = await import("../ipc/tauri");
    setRows(await ipc.memoryBackups());
  }, []);

  useEffect(() => {
    if (!isTauri()) return;
    void load().catch(() => setRows([]));
  }, [load]);

  if (!isTauri() || rows === null) return null;

  const restore = async (file: string) => {
    setBusy(true);
    setError(null);
    try {
      const ipc = await import("../ipc/tauri");
      const restored = await ipc.memoryRestore(file, true);
      setDone(restored);
      setAsking(null);
      await load();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : String(problem));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.card} aria-label={t.settingsBackups}>
      <Text weight="semibold">{t.settingsBackups}</Text>
      <Text className={styles.muted}>{t.settingsBackupsHint}</Text>

      {rows.length === 0 ? (
        <Text className={styles.muted}>{t.settingsBackupsEmpty}</Text>
      ) : (
        rows.map((row) => (
          <div key={row.file} className={styles.row}>
            <Text className={styles.grow}>{row.file}</Text>
            <Text className={styles.size}>{humanBytes(row.bytes)}</Text>
            {row.usable ? (
              asking === row.file ? (
                <>
                  <Text className={styles.ask}>{t.settingsBackupsConfirm}</Text>
                  <Button
                    size="small"
                    appearance="primary"
                    disabled={busy}
                    onClick={() => void restore(row.file)}
                  >
                    {t.settingsBackupsYes}
                  </Button>
                  <Button size="small" disabled={busy} onClick={() => setAsking(null)}>
                    {t.settingsBackupsNo}
                  </Button>
                </>
              ) : (
                <Button size="small" onClick={() => setAsking(row.file)}>
                  {t.settingsBackupsRestore}
                </Button>
              )
            ) : (
              // Битая копия: видна, названа причиной, кнопки нет.
              <ErrorLine className={styles.problem} text={row.problem || t.settingsBackupsBroken} />
            )}
          </div>
        ))
      )}

      {done ? (
        <Text role="status" aria-live="polite">
          {t.settingsBackupsDone.replace("{file}", done.file)}
        </Text>
      ) : null}
      {error ? (
        <Text className={styles.problem} role="alert">
          {error}
        </Text>
      ) : null}
    </div>
  );
}
