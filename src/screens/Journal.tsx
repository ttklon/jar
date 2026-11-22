import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Input, makeStyles, Spinner, Text, tokens } from "@fluentui/react-components";
import { ArrowClockwiseRegular } from "@fluentui/react-icons";
import { auditTail, isTauri, memoryRuns, searchEpisodes } from "../ipc";
import { groupReasons } from "../lib/journal";
import { DeedCard } from "../components/DeedCard";
import type { AuditEvent, Episode, RunRecord } from "../ipc";
import type { Deed } from "../lib/deed";
import { journal } from "../i18n/ru";

const LIMIT = 100;

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", gap: "16px" },
  lead: { color: tokens.colorNeutralForeground2, maxWidth: "78ch" },
  note: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
    maxWidth: "78ch",
  },
  bar: { display: "flex", gap: "12px", alignItems: "center" },
  center: { display: "flex", gap: "10px", alignItems: "center", color: tokens.colorNeutralForeground2 },
  error: { color: tokens.colorPaletteRedForeground2 },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: tokens.fontSizeBase200,
    fontFamily: tokens.fontFamilyMonospace,
  },
  head: {
    textAlign: "left",
    color: tokens.colorNeutralForeground3,
    fontWeight: tokens.fontWeightSemibold,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    padding: "6px 8px 6px 0",
  },
  cell: {
    padding: "6px 8px 6px 0",
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    verticalAlign: "top",
  },
  denied: { color: tokens.colorPaletteRedForeground2 },
  pains: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    padding: "12px 14px",
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground2,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  painsList: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "8px" },
  painRow: { display: "flex", flexDirection: "column", gap: "2px" },
  ok: { color: tokens.colorPaletteGreenForeground2 },
  runs: { display: "flex", flexDirection: "column", gap: "10px", maxWidth: "110ch" },
  run: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    padding: "12px 14px",
    borderRadius: tokens.borderRadiusLarge,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  runHead: { display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" },
  runKind: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
    padding: "1px 8px",
    borderRadius: "999px",
    backgroundColor: tokens.colorNeutralBackground4,
  },
  mono: {
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForeground3,
  },
  empty: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    alignItems: "flex-start",
    padding: "14px 16px",
    borderRadius: tokens.borderRadiusLarge,
    border: `1px dashed ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  emptyInput: { maxWidth: "360px", width: "100%" },
  steps: {
    margin: 0,
    paddingLeft: "18px",
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForeground2,
  },
});

function time(ms: number): string {
  const at = new Date(ms);
  return at.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function outcomeClass(styles: ReturnType<typeof useStyles>, outcome: string): string {
  if (outcome.startsWith("ok")) return `${styles.cell} ${styles.ok}`;
  if (outcome.startsWith("denied") || outcome.startsWith("error")) {
    return `${styles.cell} ${styles.denied}`;
  }
  return styles.cell;
}

/** Запуск из памяти в форму дела: одна карточка на всё, что знает приложение. */
function toDeed(run: RunRecord): Deed {
  return {
    id: run.id,
    subject: run.subject,
    kind: run.kind,
    startedMs: run.started_ms,
    finishedMs: run.finished_ms,
    outcome: run.outcome,
    steps: run.steps.map((step) => ({
      position: step.position,
      tool: step.tool,
      ok: step.ok,
      reason: step.reason,
      evidence: step.evidence,
    })),
  };
}

/**
 * Карточка одного запуска — та же, что в остальных местах (шаги 361–362).
 *
 * Свёрнута в одну строку, а подробности — по нажатию. Это не экономия места
 * ради места: в ленте из двадцати дел развёрнутые карточки дают простыню, в
 * которой «что было вчера про диск» не найти, а именно за этим сюда приходят.
 * Исключение — единственный запуск в ленте: там сворачивать нечего, и
 * раскрывать тоже незачем — он и так один.
 */
function RunCard({
  run,
  alone,
  onOpenUndo,
}: {
  run: RunRecord;
  alone: boolean;
  onOpenUndo?: () => void;
}) {
  const deed = toDeed(run);
  return (
    <DeedCard
      deed={deed}
      startOpen={alone}
      // Откат — в настройках, и он откатывает **свою** сессию: вести туда
      // честно только у дела, которое шло в текущей сессии (шаг 364).
      onOpenUndo={onOpenUndo}
    />
  );
}

export function Journal({
  onOpenSettings,
  onOpenAsk,
}: {
  onOpenSettings?: () => void;
  /** Перейти туда, где дело можно сказать словами (шаг 366). */
  onOpenAsk?: () => void;
} = {}) {
  const styles = useStyles();
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  // «Что болит» — по причинам, а не по времени: журнал уже есть, но человеку
  // с повторяющейся ошибкой нужно число, а не двадцать одинаковых строк.
  const groups = groupReasons(events ?? []);
  const [runs, setRuns] = useState<RunRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [episodes, setEpisodes] = useState<Episode[] | null>(null);
  const [searchBusy, setSearchBusy] = useState(false);
  /** Номер последнего поиска: старый ответ не вправе переписать новый. */
  const lastSearch = useRef(0);

  const load = useCallback(() => {
    setError(null);
    auditTail(LIMIT)
      .then(setEvents)
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : String(reason)),
      );
    // Память читается отдельно: сломанная память не должна скрывать журнал, и наоборот.
    memoryRuns(20)
      .then(setRuns)
      .catch(() => setRuns([]));
  }, []);

  useEffect(load, [load]);

  const find = useCallback(() => {
    const text = query.trim();
    if (!text) {
      setEpisodes(null);
      return;
    }

    // Ответ на старый запрос не должен затирать новый. Поиск идёт в побочном
    // потоке (шаг 394), ответы приходят с разной задержкой, и «загрузки хэшу»,
    // отправленный раньше «загрузок», мог прийти позже — тогда человек видел бы
    // выдачу не по тому, что напечатал. Номер запроса решает это без гонки.
    const request = ++lastSearch.current;
    setSearchBusy(true);
    searchEpisodes(text)
      .then((found) => {
        if (request === lastSearch.current) setEpisodes(found);
      })
      // Сломанный поиск — это не «ничего не нашлось», но экран не должен падать.
      .catch(() => {
        if (request === lastSearch.current) setEpisodes([]);
      })
      .finally(() => {
        if (request === lastSearch.current) setSearchBusy(false);
      });
  }, [query]);

  return (
    <div className={styles.root}>
      <div>
        <Text as="h2" size={700} weight="semibold">
          {journal.title}
        </Text>
        <Text className={styles.lead} block>
          {journal.lead}
        </Text>
      </div>

      {!isTauri() ? (
        <Text className={styles.note} block>
          {journal.browserNote}
        </Text>
      ) : null}

      {error ? <Text className={styles.error} role="alert" aria-live="polite">{`${journal.loadError}: ${error}`}</Text> : null}

      <section className={styles.runs}>
        <Text as="h3" size={500} weight="semibold">
          {journal.searchTitle}
        </Text>
        <Text className={styles.note}>{journal.searchLead}</Text>
        {!isTauri() ? <Text className={styles.note}>{journal.searchBrowserNote}</Text> : null}

        <form
          className={styles.bar}
          onSubmit={(event) => {
            event.preventDefault();
            find();
          }}
        >
          <Input
            value={query}
            placeholder={journal.searchPlaceholder}
            aria-label={journal.searchTitle}
            onChange={(_, data) => setQuery(data.value)}
          />
          {/* Кнопка не гаснет на время поиска: поиск идёт в побочном потоке (шаг
              394), и запрещать человеку уточнить запрос, пока считается старый, —
              значит заставлять его ждать чужую работу. Номер запроса сам отбросит
              устаревший ответ, а «ищу…» рядом говорит, что работа идёт. */}
          <Button type="submit">{journal.searchButton}</Button>
          {searchBusy ? <Text className={styles.note}>{journal.searchBusy}</Text> : null}
          {episodes !== null ? (
            <Text className={styles.note}>{journal.searchFound(episodes.length)}</Text>
          ) : null}
        </form>

        {episodes !== null && episodes.length === 0 ? (
          <Text className={styles.note}>{journal.searchNothing}</Text>
        ) : null}

        {episodes !== null && episodes.length > 0
          ? episodes.map((episode) => (
              <div key={episode.run.id} className={styles.run}>
                <Text className={styles.note}>{journal.searchMatched(episode.matched)}</Text>
                <RunCard
                  run={episode.run}
                  alone={episodes.length === 1}
                  onOpenUndo={onOpenSettings}
                />
              </div>
            ))
          : null}
      </section>

      <section className={styles.runs}>
        <Text as="h3" size={500} weight="semibold">
          {journal.runsTitle}
        </Text>
        <Text className={styles.note}>{journal.runsLead}</Text>
        {!isTauri() ? <Text className={styles.note}>{journal.runsBrowserNote}</Text> : null}
        {runs !== null && runs.length === 0 ? (
          <div className={styles.empty}>
            <Text weight="semibold">{journal.runsEmpty}</Text>
            <Text className={styles.note}>{journal.emptyLead}</Text>
            <Text className={styles.note}>{journal.emptyPrompt}</Text>
            {/* Поле ввода здесь — пример того, как звучит дело, а не форма:
                нажатие переносит в «Спросить», где фраза действительно
                разбирается. Мёртвое поле, которое «вроде бы» должно
                работать, хуже подсказки. */}
            <Input
              className={styles.emptyInput}
              placeholder={journal.emptyPlaceholder}
              aria-label={journal.emptyPlaceholder}
              readOnly
              onClick={() => onOpenAsk?.()}
              disabled={!isTauri()}
            />
            <Button onClick={() => onOpenAsk?.()} disabled={!onOpenAsk}>
              {journal.emptyGo}
            </Button>
            {!isTauri() ? <Text className={styles.note}>{journal.emptyBrowser}</Text> : null}
          </div>
        ) : null}
        {runs !== null && runs.length > 0
          ? runs.map((run) => (
              <RunCard
                key={run.id}
                run={run}
                alone={runs.length === 1}
                onOpenUndo={onOpenSettings}
              />
            ))
          : null}
      </section>

      <div className={styles.bar}>
        <Button icon={<ArrowClockwiseRegular />} onClick={load}>
          {journal.refresh}
        </Button>
        {events && events.length > 0 ? (
          <Text className={styles.note}>{journal.count(events.length)}</Text>
        ) : null}
      </div>

      {events === null && !error ? (
        <div className={styles.center} role="status" aria-live="polite">
          <Spinner size="tiny" />
          <Text>{journal.count(0)}</Text>
        </div>
      ) : null}

      {events && events.length === 0 ? (
        <Text className={styles.note} block>
          {journal.empty}
        </Text>
      ) : null}

      {groups.length > 0 ? (
        <section className={styles.pains} aria-label={journal.painsTitle}>
          <Text weight="semibold">{journal.painsTitle}</Text>
          <Text className={styles.note} block>
            {journal.painsLead}
          </Text>
          <ul className={styles.painsList}>
            {groups.map((group) => (
              <li key={group.reason} className={styles.painRow}>
                <Text weight="semibold">{group.reason}</Text>
                {/* Число раз и время — не украшение: одна и та же ошибка
                    двадцать раз подряд читается как двадцать разных. */}
                <Text className={styles.note}>
                  {`${journal.painsTimes(group.times)} · ${journal.painsLast(time(group.lastMs))}`}
                </Text>
                <Text className={styles.note}>{group.sample}</Text>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {events && events.length > 0 ? (
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.head}>{journal.columns.time}</th>
              <th className={styles.head}>{journal.columns.kind}</th>
              <th className={styles.head}>{journal.columns.subject}</th>
              <th className={styles.head}>{journal.columns.risk}</th>
              <th className={styles.head}>{journal.columns.decision}</th>
              <th className={styles.head}>{journal.columns.outcome}</th>
              <th className={styles.head}>{journal.columns.duration}</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event, index) => (
              <tr key={`${event.at_ms}-${event.kind}-${index}`}>
                <td className={styles.cell}>{time(event.at_ms)}</td>
                <td className={styles.cell}>{journal.kind[event.kind] ?? event.kind}</td>
                <td className={styles.cell}>{event.subject}</td>
                <td className={styles.cell}>{event.risk}</td>
                <td className={styles.cell}>{event.decision}</td>
                <td className={outcomeClass(styles, event.outcome)}>{event.outcome}</td>
                <td className={styles.cell}>{journal.duration(event.duration_ms)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}
