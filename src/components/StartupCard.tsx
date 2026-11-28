import { useEffect, useState } from "react";
import { makeStyles, Skeleton, Switch, Text } from "@fluentui/react-components";
import { isTauri, startupSetQuiet, startupStatus } from "../ipc";
import type { StartupStatus } from "../ipc";

const useStyles = makeStyles({
  card: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    padding: "14px 16px",
    borderRadius: "8px",
  },
  row: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px" },
  muted: { opacity: 0.8, fontSize: "12px" },
  list: { display: "flex", flexDirection: "column", gap: "4px", margin: 0, padding: 0, listStyle: "none" },
});

/**
 * «Как запускается» — тихий старт и что будет при каждом способе запуска.
 *
 * Правило `trayStart` — не настройка, а защита от «программа не запускается»:
 * тихо можно только при входе в Windows, ярлык показывает окно всегда. Поэтому
 * здесь один выключатель (тихий старт при входе) и таблица из трёх строк, где
 * видно, что случится при каждом способе. Без таблицы человек читает
 * «начинать в трее» как «всегда в трее» и удивляется, когда ярлык не открывает
 * окно.
 */
export function StartupCard() {
  const styles = useStyles();
  const [status, setStatus] = useState<StartupStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    startupStatus()
      .then((next) => {
        if (alive) setStatus(next);
      })
      .catch((reason: unknown) => {
        if (alive) setError(String(reason));
      });
    return () => {
      alive = false;
    };
  }, []);

  async function toggle(quiet: boolean) {
    setBusy(true);
    try {
      const now = await startupSetQuiet(quiet);
      // Читаем отчёт заново: «сохранил» по факту нажатия — обещание без
      // содержимого. Показываем то, что действует.
      const next = await startupStatus();
      setStatus({ ...next, quiet: now });
      setError(null);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.card}>
      <div className={styles.row}>
        <div>
          <Text weight="semibold" block>
            Тихий старт при входе в Windows
          </Text>
          <Text className={styles.muted} block>
            окно не мешает при входе; ярлык и первый запуск всё равно показывают окно
          </Text>
        </div>
        {status === null ? (
          <Skeleton>
            <Switch />
          </Skeleton>
        ) : (
          <Switch
            checked={status.quiet}
            disabled={!isTauri() || busy}
            onChange={(_, data) => void toggle(data.checked)}
            aria-label="Тихий старт при входе в Windows"
          />
        )}
      </div>

      {status && status.rows.length > 0 ? (
        <ul className={styles.list} aria-label="что будет при каждом способе запуска">
          {status.rows.map((row) => (
            <li key={row.how}>
              <Text className={styles.muted} block>
                {row.window ? "окно" : "тихо, только трей"} — {row.said}
              </Text>
            </li>
          ))}
        </ul>
      ) : (
        <Text className={styles.muted} block>
          {isTauri()
            ? "ядро не ответило: способ запуска здесь не проверить"
            : "в браузере запуска нет — здесь не проверить; в приложении видно, что будет при каждом запуске"}
        </Text>
      )}

      {error ? (
        <Text role="alert" className={styles.muted} block>
          не получилось: {error}
        </Text>
      ) : null}
      {/* Строка про то, чего здесь нет: тихий старт не делает «всё тихо»
          (шаг 77 — та же ошибка, что «выход всегда без вопроса»). */}
      <Text className={styles.muted} block>
        ярлык и первый запуск окно показывают всегда: «нажал и ничего не произошло» — это дефект, а не тишина
      </Text>
    </div>
  );
}
