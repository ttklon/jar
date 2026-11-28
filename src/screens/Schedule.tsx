import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Input, makeStyles, Spinner, Text, tokens } from "@fluentui/react-components";
import {
  isTauri,
  scheduleAdd,
  schedulePause,
  schedulePolicy,
  scheduleRemove,
  schedules,
  whenThenAdd,
  whenThenRemove,
  whenThenRules,
  whenThenSetOn,
} from "../ipc";
import type { ScheduleRow, WhenThenRow } from "../ipc";
import { clockText, confirm, nightNotice, parse } from "../lib/plainSchedule";
import { row as scheduleRow } from "../lib/scheduleScreen";
import { EveryDayCard } from "../components/EveryDayCard";
import { line as missedLine, type Policy } from "../lib/catchUp";
import { deferred as nightDeferred, isNight, safeList } from "../lib/nightTasks";
import { longSleep, survivesRestart } from "../lib/scheduleSurvives";
import { parse as parseWhenThen, summary as rulesSummary, type Rule as WhenThenRule, type When } from "../lib/whenThen";
import { check as checkTrigger, describe as describeTrigger, limits as triggerLimits, type Trigger } from "../lib/whenTriggers";
// Шаг 87: условие «только если…» словами — разбор и проверка правилом, не экраном.
import {
  classify as classifyCondition,
  describe as describeCondition,
  holds,
  notUnderstood,
  type Facts,
} from "../lib/plainCondition";

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

/**
 * Правило из хранилища — в форму правила `whenThen`.
 *
 * `when` в файле лежит подписью словами, а правилу нужен вид триггера: без него
 * `summary` не смог бы отличить правило по времени от правила по событию. Вид
 * сохранён рядом (`kind`), поэтому обратное превращение — не догадка.
 */
function asRule(row: WhenThenRow): WhenThenRule {
  const when: When =
    row.kind === "time"
      ? { kind: "time", at: row.when.replace(/^в\s*/, "") }
      : row.kind === "app"
        ? { kind: "app", name: row.when.replace(/^откроется\s*/, "") }
        : row.kind === "said"
          ? { kind: "said", phrase: row.when }
          : { kind: "file", path: row.when };
  return { id: row.id, when, then: row.then, risky: row.risky, on: row.on, fired: row.fired };
}

/**
 * Условие правила — в вид триггера `whenTriggers`.
 *
 * Нужно, чтобы показать **границы** до создания правила: человек, который ждёт
 * «наведения курсора», создаст правило, которое молча не сработает. `kind`
 * сохранён рядом с подписью, поэтому это не догадка по тексту.
 */
function asTrigger(row: WhenThenRow): Trigger | null {
  if (row.kind === "time") {
    const match = /(\d{1,2}):(\d{2})/.exec(row.when);
    if (match === null) return null;
    return { kind: "time", at: Number(match[1]) * 60 + Number(match[2]) };
  }
  if (row.kind === "file") {
    const lower = row.when.toLowerCase();
    if (lower.includes("загрузк")) return { kind: "fileAppeared", folder: "downloads" };
    if (lower.includes("рабоч") || lower.includes("стол")) return { kind: "fileAppeared", folder: "desktop" };
    if (lower.includes("документ")) return { kind: "fileAppeared", folder: "documents" };
    return { kind: "fileAppeared", folder: "custom" };
  }
  // Вход в систему — тоже время, но с другой ценой; `time` здесь честнее, чем
  // выдуманный `signIn` без данных от ядра.
  return null;
}

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
  const [rules, setRules] = useState<WhenThenRow[] | null>(null);
  const [phraseWhen, setPhraseWhen] = useState("");
  /**
   * Условие «только если…» (шаг 87).
   *
   * Правило `plainCondition` разбирало фразу и умело проверять условие, но
   * экран его не спрашивал: человек писал «отчёт каждый день в 9, только если
   * места меньше 10 %», и условие молча пропадало — правило срабатывало
   * всегда, хотя человек сказал «только если».
   */
  const [conditionText, setConditionText] = useState("");
  /** Что видно про условие: разобрано ли оно и что было бы сейчас. */
  const [conditionLine, setConditionLine] = useState<string | null>(null);
  const [phrase, setPhrase] = useState("");
  const [said, setSaid] = useState<string | null>(null);
  const [bad, setBad] = useState(false);
  const [busy, setBusy] = useState(false);
  const tauri = isTauri();

  const load = useCallback(() => {
    scheduleList();
  }, []);

  /**
   * Факты для проверки условия.
   *
   * Пока экран их не читает — `holds` вернёт `null` («не знаю»), и это честнее
   * выдуманного «да»: неизвестное условие не запускает дело.
   */
  const facts: Facts = { freePercent: Number.NaN, files: Number.NaN, ranToday: false };
  const factsRef = useRef(facts);
  factsRef.current = facts;

  /**
   * Спросить условие у правила — и показать ответ словами.
   *
   * Не «понял/не понял» галочкой: у неизвестного условия три примера того, что
   * понимаем. И сказано, что будет при непонятном — правило не сработает молча
   * (пропуск с причиной, шаг 326).
   */
  /**
   * Разбор условия одной функцией — и для показа, и для сохранения.
   *
   * Две копии разбора разъехались бы: в поле человек пишет само условие
   * («места меньше 10 %»), а в сохранённой фразе может быть «только если…» —
   * заголовок поля уже сказал слова, поэтому берём `classify`.
   */
  const readCondition = useCallback((text: string): string | null => {
    const trimmed = text.trim();
    if (trimmed === "") return null;
    const condition = classifyCondition(trimmed);
    if (condition.kind === "unknown") return notUnderstood(condition.text);
    const yes = holds(condition, factsRef.current);
    return `${describeCondition(condition)} — ${
      yes === null
        ? "проверить нечем: нужны числа, их даёт ядро"
        : yes
          ? "сейчас сработало бы"
          : "сейчас не сработало бы"
    }`;
  }, []);

  function scheduleList() {
    whenThenRules()
      .then((got) => setRules(got))
      .catch(() => setRules([]));
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
    // Ночью — предупреждение до сохранения. Меняет ли дело мир, из фразы не
    // видно, поэтому говорим не «нельзя», а что будет при отказе.
    const night = nightNotice(wanted, true);
    setBad(false);
    setBusy(true);
    scheduleAdd(wanted.what, cadence, minute)
      .then((got) => {
        setItems(got);
        setPhrase("");
        const when = wanted.at === "hourly" ? "каждый час" : `каждый день в ${clockText(minute)}`;
        // Условие не отправляем молча: если оно не понято, правило не должно
        // срабатывать «всегда» — человек сказал «только если».
        const condition = conditionText.trim();
        const line = readCondition(condition);
        setSaid(
          [
            `добавлено: ${when} — ${wanted.what}`,
            night ?? "",
            confirm(wanted),
            condition === ""
              ? ""
              : `условие: ${line ?? "не понято — правило не сработает, пока условие не названо понятно"}`,
          ]
            .filter((part) => part !== "")
            .join("\n"),
        );
      })
      .catch((reason: unknown) => {
        setBad(true);
        setSaid(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => setBusy(false));
  };

  /**
   * Добавить правило «когда …, тогда …».
   *
   * Разбор — правило `whenThen`: граница между условием и действием ищется явно,
   * а непонятое **называется**, а не превращается в «наверное, вот так».
   * Опасное действие помечается сразу: оно спросит и внутри правила.
   */
  const addRule = () => {
    const parsed = parseWhenThen(phraseWhen, `rule:${Date.now()}`);
    if (parsed.rule === null) {
      setBad(true);
      setSaid(parsed.said);
      return;
    }
    const rule = parsed.rule;
    setBad(false);
    setBusy(true);
    whenThenAdd(rule.when.kind, parsed.said.split(" — ")[0]!.replace(/^правило: /, ""), rule.then, rule.risky)
      .then((got) => {
        setRules(got);
        setPhraseWhen("");
        setSaid(parsed.said);
      })
      .catch((reason: unknown) => {
        setBad(true);
        setSaid(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => setBusy(false));
  };

  const toggleRule = (rule: WhenThenRow) => {
    whenThenSetOn(rule.id, !rule.on)
      .then((got) => {
        setRules(got);
        // Выключение — не потеря: так и говорим.
        setSaid(
          rule.on
            ? `«${rule.then}» выключено: правило осталось, срабатывать не будет`
            : `«${rule.then}» снова включено`,
        );
      })
      .catch((reason: unknown) => {
        setBad(true);
        setSaid(reason instanceof Error ? reason.message : String(reason));
      });
  };

  const dropRule = (rule: WhenThenRow) => {
    whenThenRemove(rule.id)
      .then((got) => {
        setRules(got);
        setSaid(`удалено правило: ${rule.when} — ${rule.then}`);
      })
      .catch((reason: unknown) => {
        setBad(true);
        setSaid(reason instanceof Error ? reason.message : String(reason));
      });
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

      {/* Условие — отдельным полем, а не «допишите в фразе» (шаг 87). Правило
          `plainCondition` разбирает «только если…» словами; пока его не
          спрашивали, человек думал, что сказал «только если», а правило
          срабатывало всегда. */}
      <div className={styles.row}>
        <Input
          aria-label="условие: только если"
          className={styles.wide}
          placeholder="только если места меньше 10 %"
          value={conditionText}
          onChange={(_, data) => {
            setConditionText(data.value);
            setConditionLine(readCondition(data.value));
          }}
        />
      </div>
      {conditionLine !== null ? (
        <Text className={styles.muted} role="status" aria-live="polite">
          {conditionLine}
        </Text>
      ) : null}
      {conditionText.trim() !== "" && conditionLine === null ? (
        <Text className={styles.muted}>
          условие будет записано словами: пока оно не понято, правило не сработает молча
        </Text>
      ) : null}

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
                    {isNight(item.minute)
                      ? ` · ночью мир не меняется: ${nightDeferred()}`
                      : ""}
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
          {/* Ночью — только чтение: говорим это списком с причиной у каждого, а
              не «ночью ничего нельзя». */}
          <details>
            <summary className={styles.muted}>что разрешено ночью (23:00–07:00)</summary>
            <ul className={styles.list}>
              {safeList().map((line) => (
                <li key={line}>
                  <Text className={styles.muted}>{line}</Text>
                </li>
              ))}
            </ul>
          </details>
        </>
      )}

      {/* «Когда …, тогда …» — то же место, потому что это тоже «что происходит
          само». Отдельный список: правило по событию — не расписание по часам. */}
      <div>
        <Text weight="semibold" block>
          Когда …, тогда …
        </Text>
        <Text className={styles.muted} block>
          Правило по событию, а не по часам: «когда я открою Chrome, тогда включи музыку».
          Опасное действие спросит подтверждение, даже внутри правила.
        </Text>
      </div>
      <div className={styles.row}>
        <Input
          aria-label="правило когда тогда"
          className={styles.wide}
          placeholder="когда я открою Chrome, тогда включи музыку"
          value={phraseWhen}
          onChange={(_, data) => setPhraseWhen(data.value)}
        />
        <Button onClick={addRule} disabled={busy || !tauri}>
          добавить правило
        </Button>
      </div>

      {rules === null ? null : rules.length === 0 ? (
        <Text className={styles.muted}>{rulesSummary([])}</Text>
      ) : (
        <>
          <Text className={styles.muted}>{rulesSummary(rules.map(asRule))}</Text>
          <ul className={styles.list}>
            {rules.map((rule) => (
              <li key={rule.id} className={styles.row}>
                <span>
                  <Text className={styles.mono}>{rule.when}</Text>
                  <Text className={styles.muted} block>
                    {rule.on ? "включено" : "выключено"} — {rule.then}
                    {rule.risky ? " (спрошу перед выполнением)" : ""}
                    {rule.fired > 0 ? `; срабатывало ${rule.fired} раз` : "; ещё не срабатывало"}
                    {/* Границы триггера — до срабатывания, а не после «почему не
                        работает»: «файл может появиться недокачанным» и «за
                        папками вне списка не следим» — это не оправдание. */}
                    {(() => {
                      const trigger = asTrigger(rule);
                      if (trigger === null) return "";
                      const bad = checkTrigger(trigger);
                      if (bad.length > 0) return `; не сработает: ${bad.join("; ")}`;
                      const limits = triggerLimits(trigger);
                      return limits.length > 0 ? `; ${limits.join("; ")}` : "";
                    })()}
                  </Text>
                </span>
                <span className={styles.row}>
                  <Button size="small" appearance="subtle" onClick={() => toggleRule(rule)}>
                    {rule.on ? "выключить" : "включить"}
                  </Button>
                  <Button
                    size="small"
                    appearance="subtle"
                    aria-label={`удалить правило: ${rule.then}`}
                    onClick={() => dropRule(rule)}
                  >
                    удалить
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}


      {/* Правило из уже сделанного дела: одна кнопка, без формы (шаги 332/329). */}
      <EveryDayCard />

      {/* Где живёт расписание и что будет после сна. Это не украшение: раньше
          расписание жило в памяти процесса и исчезало вместе с ним — человек
          выключал компьютер и не находил своих правил. */}
      {items !== null && items.length > 0 ? (
        <Text className={styles.muted}>
          {`${survivesRestart("file").said}. ${longSleep(0) ?? "короткий сон: пропущенное спросим один раз, а не очередью"}`}
        </Text>
      ) : null}

      {/* Какие «когда» проверяемы — сказано до того, как человек придумает
          правило, которое не сработает. */}
      <details>
        <summary className={styles.muted}>какие «когда» программа правда видит</summary>
        <ul className={styles.list}>
          {([
            { kind: "time", at: 540 } as Trigger,
            { kind: "fileAppeared", folder: "downloads" } as Trigger,
            { kind: "diskFull", percent: 10 } as Trigger,
            { kind: "signIn" } as Trigger,
          ] as Trigger[]).map((trigger) => (
            <li key={trigger.kind}>
              <Text className={styles.muted}>
                {describeTrigger(trigger)} — {triggerLimits(trigger)[0]}
              </Text>
            </li>
          ))}
        </ul>
      </details>

      {said !== null ? (
        <Text className={styles.muted} role={bad ? "alert" : "status"} aria-live="polite">
          {said}
        </Text>
      ) : null}
    </div>
  );
}
