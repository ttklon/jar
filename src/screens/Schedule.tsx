import { useCallback, useEffect, useState } from "react";
import { Button, Input, makeStyles, Spinner, Text, tokens } from "@fluentui/react-components";
import { isTauri, scheduleAdd, schedulePause, schedulePolicy, scheduleRemove, schedules } from "../ipc";
import type { ScheduleRow } from "../ipc";
import { clockText, confirm, nightNotice, parse } from "../lib/plainSchedule";
import { row as scheduleRow } from "../lib/scheduleScreen";
import { line as missedLine, type Policy } from "../lib/catchUp";

/**
 * «Расписание» — всё в одном списке (шаг 327, фраза — шаг 321).
 *
 * Расписание, которое нельзя увидеть списком, перестаёт существовать для
 * человека: он помнит, что «что-то настроил», но не помнит что, и создаёт второе
 * поверх первого — потом приходит два отчёта и непонятно почему.
 *
 * Три решения, которые здесь важны:
 *
 *  * **человек говорит фразу**, а не заполняет три поля: «каждый день в 9 —
 *    отчёт о диске». Разбор — правило `plainSchedule`, а не эта карточка;
 *  * **чего не поняли — спрашиваем**, а не создаём правило, которое молча не
 *    сработает: неверное расписание хуже отсутствующего;
 *  * **пауза и отмена — на строке**, а не в глубине настроек, и после действия
 *    список приходит из ядра заново — экран показывает факт, а не догадку.
 */

const useStyles = makeStyles({
  card: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    padding: "16px 18px",
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground2,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  list: { display: "flex", flexDirection: "column", gap: "8px", margin: 0, padding: 0, listStyle: "none" },
  row: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" },
  muted: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  mono: { fontFamily: tokens.fontFamilyMonospace },
  wide: { minWidth: "260px", minHeight: "44px" },
});

/** Что человек видит про одну строку — словами правила, а не своими. */
function line(item: ScheduleRow): string {
  return scheduleRow(
    {
      id: item.id,
      when: item.when,
      what: item.what,
      lastAt: 0,
      lastOutcome: "never",
      paused: item.paused,
    },
    Date.now(),
  );
}

export function Schedule() {
  const styles = useStyles();
  const [items, setItems] = useState<ScheduleRow[] | null>(null);
  const [phrase, setPhrase] = useState("");
  const [said, setSaid] = useState<string | null>(null);
  const [bad, setBad] = useState(false);
  const [busy, setBusy] = useState(false);
  const tauri = isTauri();

  const load = useCallback(() => {
    scheduleList();
  }, []);

  function scheduleList() {
    schedules()
      .then((got) => setItems(got))
      .catch((reason: unknown) => {
        setBad(true);
        setSaid(reason instanceof Error ? reason.message : String(reason));
      });
  }

  useEffect(load, [load]);

  const add = () => {
    // Разбор — правило. Непонятная фраза не превращается в «наверное, в 9».
    const parsed = parse(phrase);
    if (!parsed.ok) {
      setBad(true);
      setSaid(parsed.why);
      return;
    }
    const wanted = parsed.wanted;
    const minute = wanted.at === "hourly" ? 0 : wanted.at;
    const cadence = wanted.at === "hourly" ? "hourly" : "daily";
    // Ночью про мир — предупреждение до сохранения, а не после.
    const night = nightNotice(wanted, false);
    setBad(false);
    setBusy(true);
    scheduleAdd(wanted.what, cadence, minute)
      .then((got) => {
        setItems(got);
        setPhrase("");
        const when = wanted.at === "hourly" ? "каждый час" : `каждый день в ${clockText(minute)}`;
        setSaid([`добавлено: ${when} — ${wanted.what}`, night ?? "", confirm(wanted)].filter((part) => part !== "").join("\n"));
      })
      .catch((reason: unknown) => {
        setBad(true);
        setSaid(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => setBusy(false));
  };

  const toggle = (item: ScheduleRow) => {
    schedulePause(item.id, !item.paused)
      .then((got) => {
        setItems(got);
        setSaid(
          item.paused
            ? `«${item.what}» снова включено`
            : `«${item.what}» на паузе: срабатывать не будет, история и доверие сохранятся`,
        );
      })
      .catch((reason: unknown) => {
        setBad(true);
        setSaid(reason instanceof Error ? reason.message : String(reason));
      });
  };

  /**
   * Выбор «что делать с пропуском».
   *
   * Решается **у дела**, а не общей настройкой: иначе человек не поймёт, почему
   * одно правило догоняет, а другое нет (шаг 334). Подсказка зависит от дела:
   * частое — пропускать, опасное — спрашивать.
   */
  const setPolicy = (item: ScheduleRow, policy: Policy) => {
    schedulePolicy(item.id, policy)
      .then((got) => {
        setItems(got);
        // Слова — правила `catchUp`: экран не сочиняет своё объяснение.
        setSaid(missedLine({ what: item.what, policy, dangerous: false, missed: 1 }));
      })
      .catch((reason: unknown) => {
        setBad(true);
        setSaid(reason instanceof Error ? reason.message : String(reason));
      });
  };

  const cancel = (item: ScheduleRow) => {
    scheduleRemove(item.id)
      .then((got) => {
        setItems(got);
        setSaid(`отменено: «${item.what}» (${item.when})`);
      })
      .catch((reason: unknown) => {
        setBad(true);
        setSaid(reason instanceof Error ? reason.message : String(reason));
      });
  };

  return (
    <div className={styles.card}>
      <div>
        {/* Главный заголовок экрана — ровно один и `h1`: иначе «перейти к
            заголовку» приводит на подзаголовок раздела (шаг 181). */}
        <Text as="h1" size={600} weight="semibold" block>
          Расписание
        </Text>
        <Text className={styles.muted} block>
          Скажите фразой: «каждый день в 9 — отчёт о диске». Всё, что настроено, — в одном
          списке; отдельных «автоматизаций» в других окнах нет.
        </Text>
      </div>

      {!tauri ? (
        <Text className={styles.muted}>
          в браузере расписаний нет: список и запуск ведёт приложение, здесь показывать нечего
        </Text>
      ) : null}

      <div className={styles.row}>
        <Input
          aria-label="расписание фразой"
          className={styles.wide}
          placeholder="каждый день в 9 — отчёт о диске"
          value={phrase}
          onChange={(_, data) => setPhrase(data.value)}
        />
        <Button onClick={add} disabled={busy || !tauri}>
          добавить
        </Button>
      </div>

      {items === null ? (
        <div role="status" aria-live="polite">
          <Spinner size="tiny" />
          <Text className={styles.muted}> читаю расписания…</Text>
        </div>
      ) : items.length === 0 ? (
        <Text className={styles.muted}>
          расписаний нет: скажите «каждый день в 9 — отчёт о диске», и оно появится
        </Text>
      ) : (
        <>
          <ul className={styles.list}>
            {items.map((item) => (
              <li key={item.id} className={styles.row}>
                <span>
                  <Text className={styles.mono}>{item.when}</Text>
                  <Text className={styles.muted} block>
                    {/* Строка собирается правилом `scheduleScreen.row`: подпись
                        «когда» и «как прошло» обязаны быть теми же, что в списке
                        правил, иначе экран и правило разойдутся. */}
                    {line(item)}
                  </Text>
                </span>
                <span className={styles.row}>
                  <select
                    aria-label={`если компьютер спал: ${item.what}`}
                    className={styles.muted}
                    value={item.policy === "" ? "ask" : item.policy}
                    onChange={(event) => setPolicy(item, event.target.value as Policy)}
                  >
                    <option value="ask">спрошу, когда включится</option>
                    <option value="catchUp">сделаю один раз, а не все пропущенные</option>
                    <option value="skip">пропущу до следующего раза</option>
                  </select>
                  <Button size="small" appearance="subtle" onClick={() => toggle(item)}>
                    {item.paused ? "продолжить" : "пауза"}
                  </Button>
                  <Button
                    size="small"
                    appearance="subtle"
                    aria-label={`отменить: ${item.what}`}
                    onClick={() => cancel(item)}
                  >
                    отменить
                  </Button>
                </span>
              </li>
            ))}
          </ul>
          <Text className={styles.muted}>
            {`всего ${items.length}, на паузе ${items.filter((item) => item.paused).length}`}
          </Text>
        </>
      )}

      {said !== null ? (
        <Text className={styles.muted} role={bad ? "alert" : "status"} aria-live="polite">
          {said}
        </Text>
      ) : null}
    </div>
  );
}
