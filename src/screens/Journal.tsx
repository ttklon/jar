import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Input, makeStyles, Spinner, Text, tokens } from "@fluentui/react-components";
import { copied as reportCopied, text as reportText } from "../lib/copyReport";
import { build as buildExport } from "../lib/journalExport";
import { ArrowClockwiseRegular } from "@fluentui/react-icons";
import { auditTail, isTauri, memoryRuns, searchEpisodes } from "../ipc";
import { audit as dangerAudit, dangerous as dangerOnly, line as dangerLine, summary as dangerSummary } from "../lib/dangerAudit";
import { first as firstDanger, order as dangerOrder, tally as dangerTally } from "../lib/dangerFirst";
import { groupReasons } from "../lib/journal";
import { line as replayLine } from "../lib/journalReplay";
import { oneLine } from "../lib/narrowCard";
import { line as timingLine, mismatch as timingMismatch, slowest, sum as timingSum, type Step as TimingStep } from "../lib/stepTimingView";
import { ALL as ALL_FILTER, apply as applyFilter, caption as filterCaption, type Filter } from "../lib/feedFilters";
import { fromJournal, line as refusalLine } from "../lib/refusal";
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
  /**
   * Поле поиска — та же мера, что у главного входа (44 px, шаг 196).
   *
   * Дефект, найденный e2e на 540 px: поле было высотой 30 px. Обещание «цель,
   * в которую попадает палец и дрожащая рука» действовало для поля в шапке и
   * не действовало для поиска в журнале — человек с дрожащей рукой промахивался
   * именно там, где ищет вчерашнее дело.
   */
  searchField: { minHeight: "44px" },
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
  const styles = useStyles();
  const deed = toDeed(run);
  /**
   * «Разобрать заново» (шаг 45): собрать отчёт из того, что помнит память.
   *
   * Это **не** «повторить»: мир не трогается, и кнопка не запускает ничего.
   * Поэтому она стоит рядом с карточкой, а не в ряду действий дела — человек не
   * должен путать разбор вчерашнего провала с повторным удалением файлов.
   */
  const [said, setSaid] = useState<string | null>(null);
  /**
   * Ширина окна: правило `narrowCard` решает по ней, а не по догадке.
   *
   * В `app.tsx` ширина уже отслеживается, но у строки журнала своего доступа
   * к ней нет, а протаскивать её через полэкрана ради одной строки — хуже, чем
   * подписаться здесь. Слушатель снимается при размонтировании: иначе каждая
   * перерисованная строка журнала оставляла бы за собой подписку.
   */
  const [width, setWidth] = useState(() => globalThis.innerWidth || 1200);
  useEffect(() => {
    const onResize = () => setWidth(globalThis.innerWidth || 1200);
    globalThis.addEventListener("resize", onResize);
    return () => globalThis.removeEventListener("resize", onResize);
  }, []);
  /**
   * Время по шагам (шаг 49).
   *
   * Общее время память запусков хранит, а время каждого шага — нет. Правило
   * требует не врать: шаги без времени называются «не мерили», а расхождение
   * с общим — числом. Показывать «40 секунд» без разбивки лучше, чем выдумать
   * разбивку; но и молчать про общее нельзя — именно оно вызывает вопрос
   * «почему так долго».
   */
  const timingSteps: TimingStep[] = run.steps.map((step) => ({ name: step.tool, ms: null }));
  const timingTotal =
    run.finished_ms === null ? null : Math.max(0, run.finished_ms - run.started_ms);
  const timing = timingSum(timingSteps, timingTotal);
  const timingSaid = [
    timingTotal === null ? "время не мерили: дело ещё идёт или его прервали" : `всего ${timingLine({ name: "дело", ms: timingTotal }).split(": ")[1] ?? ""}`,
    slowest(timingSteps),
    timingMismatch(timing),
  ].filter((part): part is string => part !== null);

  /**
   * Узкое окно: время и кнопка — на двух строках, а не в обрез (шаг 378).
   *
   * Правило `narrowCard` жило в библиотеке и ничего не проверяло. Здесь оно
   * спрашивается: при ширине меньше 600 px строка «всего 40 с · разобрать
   * заново» не помещается, и раньше это решалось вёрсткой — то есть время
   * обрезалось до «09:1» или кнопка уезжала за край, и человек не мог нажать.
   *
   * Считаем не «красиво ли», а помещается ли: время и кнопка — непереносимые
   * части, и если вместе они шире окна, строка переносится.
   */
  // Вопрос здесь один: «влезет ли время и кнопка в одну строку». Это не
  // `fit` — тот отвечает про прокрутку, и переносимый текст в нём ни при чём.
  const stackNarrow = !oneLine(
    [
      // Текст: 7 px на символ — та же оценка, что в правиле.
      { what: "время", px: timingSaid.join("; ").length * 7, wrappable: true },
      { what: "разобрать заново", px: 140, wrappable: false },
    ],
    // Настоящая ширина окна, а не 600: подставлять константу значило бы
    // «проверить» правило на числе, которого в этот момент нет.
    width,
  );

  return (
    <div className={styles.runs}>
      <DeedCard
        deed={deed}
        startOpen={alone}
        // Откат — в настройках, и он откатывает **свою** сессию: вести туда
        // честно только у дела, которое шло в текущей сессии (шаг 364).
        onOpenUndo={onOpenUndo}
      />
      <div className={styles.bar} style={stackNarrow ? { flexDirection: "column", alignItems: "flex-start" } : undefined}>
        <Button
          size="small"
          appearance="subtle"
          aria-label={`разобрать заново дело ${run.id}`}
          onClick={() => setSaid(replayLine(run))}
        >
          разобрать заново
        </Button>
        {said !== null ? (
          <Text className={styles.note} role="status" aria-live="polite">
            {said}
          </Text>
        ) : (
          // Без нажатия строка уже говорит, сколько шло дело и что по шагам
          // времени нет: «почему так долго» спрашивают именно тут.
          <Text className={styles.note}>{timingSaid.join("; ")}</Text>
        )}
      </div>
    </div>
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
  /** Что уже скопировано — по ключу строки, чтобы человек видел подтверждение. */
  const [copiedRow, setCopiedRow] = useState<string | null>(null);
  /** Сколько секретов и путей убрано при последней выгрузке — числом. */
  const [exported, setExported] = useState<string | null>(null);
  /**
   * Выбранный фильтр (шаг 372). Фильтры складываются: «вчера + ошибки» — законный
   * вопрос, поэтому это два поля, а не один список кнопок.
   */
  const [filter, setFilter] = useState<Filter>(ALL_FILTER);
  /** Номер последнего поиска: старый ответ не вправе переписать новый. */
  const lastSearch = useRef(0);

  /**
   * Скопировать отчёт по событию (шаг 374).
   *
   * Отчёт копируют **для другого человека**: в поддержку, в чат. Поэтому текст
   * собирает правило `copyReport` — без путей вида `C:\Users\anna\...`, без
   * JSON и без идентификаторов. Здесь только вызов и подтверждение.
   */
  const copyRow = (key: string, event: AuditEvent) => {
    const text = reportText({
      said: event.subject,
      when: time(event.at_ms),
      steps: [{ name: journal.kind[event.kind] ?? event.kind, detail: event.outcome }],
      failed: event.outcome === "denied" || event.outcome === "failed" ? event.decision : undefined,
    });
    void globalThis.navigator?.clipboard?.writeText(text).then(() => {
      setCopiedRow(key);
    });
  };

  /**
   * Подтверждение гаснет не по таймеру, а по действию: новое копирование его
   * сменяет, «Обновить» — убирает. Ошибка по таймеру исчезать не должна (её
   * стережёт `ErrorsAreAnnounced`), и подсказка об исчезнувшем — тоже: человек
   * мог отвернуться, а потом искать, почему кнопка снова «копировать».
   */
  const clearCopy = () => setCopiedRow(null);

  /**
   * Выгрузить журнал для поддержки (шаг 423).
   *
   * Не «сохранить как есть»: правило `journalExport` вычищает секреты повторно
   * (журнал мог быть записан до правила), сокращает пути до имени папки и режет
   * по времени. Человек видит **числа** — сколько вычищено, — а не обещание.
   */
  const exportAll = () => {
    const lines = (events ?? []).map((event) => ({ at: event.at_ms, text: `${event.kind} ${event.subject}: ${event.outcome}` }));
    const got = buildExport(lines, Date.now(), 24);
    void globalThis.navigator?.clipboard?.writeText(got.text).then(() => {
      setExported(got.said);
      setCopiedRow(null);
    });
  };

  /**
   * Строки для фильтра: одно дело — одна строка, чем бы оно ни было (событие
   * политики или запуск). Без этого «только ошибки» показывал бы отказы, но не
   * провалы запусков — то есть половину ответа на вопрос «что сломалось».
   */
  const filterRows = [
    ...(events ?? []).map((event, index) => ({
      id: `e${index}`,
      at: event.at_ms,
      state: (event.outcome.startsWith("fail") ? "failed" : event.outcome.startsWith("denied") ? "cancelled" : "done") as "done" | "failed" | "cancelled" | "running",
      risk: (event.risk === "dangerous" ? "dangerous" : "safe") as "safe" | "dangerous",
    })),
    ...(runs ?? []).map((run) => ({
      id: `r${run.id}`,
      at: run.started_ms,
      state: (run.outcome.startsWith("fail") ? "failed" : run.outcome === "denied" ? "cancelled" : run.outcome === "running" ? "running" : "done") as "done" | "failed" | "cancelled" | "running",
      risk: "safe" as const,
    })),
  ];
  const shownRows = applyFilter(filterRows, filter, Date.now());
  const shownCount = shownRows.length;
  const filterOn = filter.when !== "all" || filter.only !== "none";
  /** Видимые события — по тем же номерам, что в строках фильтра. */
  const shownEvents = new Set(shownRows.filter((row) => row.id.startsWith("e")).map((row) => row.id));

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
        <Text as="h1" size={700} weight="semibold">
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
            className={styles.searchField}
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
          ? runs
              .filter((run) => !filterOn || shownRows.some((row) => row.id === `r${run.id}`))
              .map((run) => (
              <RunCard
                key={run.id}
                run={run}
                alone={runs.length === 1}
                onOpenUndo={onOpenSettings}
              />
              ))
          : null}
      </section>

      {/* Фильтры — вопросы к журналу, а не украшение списка. Выбранный виден
          над списком словами: иначе человек смотрит на суженный журнал и думает,
          что дел было мало. */}
      {events && events.length > 0 ? (
        <div className={styles.bar} role="group" aria-label="фильтр журнала">
          {([
            ["all", "все"],
            ["today", "сегодня"],
            ["yesterday", "вчера"],
          ] as const).map(([when, label]) => (
            <Button
              key={when}
              size="small"
              appearance={filter.when === when ? "primary" : "subtle"}
              aria-pressed={filter.when === when}
              onClick={() => { setFilter({ ...filter, when }); clearCopy(); }}
            >
              {label}
            </Button>
          ))}
          {([
            ["none", "все дела"],
            ["failed", "только ошибки"],
            ["dangerous", "только опасные"],
          ] as const).map(([only, label]) => (
            <Button
              key={only}
              size="small"
              appearance={filter.only === only ? "primary" : "subtle"}
              aria-pressed={filter.only === only}
              onClick={() => { setFilter({ ...filter, only }); clearCopy(); }}
            >
              {label}
            </Button>
          ))}
          <Text className={styles.note} role="status" aria-live="polite">
            {filterCaption(shownCount, filterRows.length, filter)}
          </Text>
        </div>
      ) : null}

      <div className={styles.bar}>
        <Button icon={<ArrowClockwiseRegular />} onClick={() => { clearCopy(); load(); }}>
          {journal.refresh}
        </Button>
        {events && events.length > 0 ? (
          <Button onClick={exportAll}>выгрузить журнал за сутки</Button>
        ) : null}
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
                {/* Шаг 87: причина — по-русски и коротко, с выходом. Технический
                    текст остаётся ниже, но вторым: человеку нужен ответ на «что
                    теперь делать». */}
                <Text className={styles.note}>{refusalLine(fromJournal(group.reason))}</Text>
                <Text className={styles.note}>{group.sample}</Text>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/*
        Шаг 166: что **реально** проверено из опасного, а не что было в журнале.
        «Запросили и отказали» — не проверка: рука не работала, и мы о ней ничего
        не знаем. Это отдельный ответ на отдельный вопрос, поэтому отдельная
        секция до таблицы.
      */}
      {events && events.length > 0 ? (
        (() => {
          // Один свод: дважды читать журнал ради одного ответа — работа без пользы.
          const rows = dangerAudit(events);
          const hands = dangerOnly(rows);
          const got = dangerSummary(rows);
          return (
            <section className={styles.pains} aria-label="Что проверено из опасного">
              <Text weight="semibold">Что проверено из опасного</Text>
              <Text className={styles.note} block>
                запуск — единственное доказательство: отказ политики ничего не проверяет
              </Text>
              <Text className={styles.note} block role="status" aria-live="polite">
                {got.said}
              </Text>
              <ul className={styles.painsList}>
                {hands.slice(0, 12).map((row) => (
                  <li key={row.subject} className={styles.painRow}>
                    <Text className={styles.note}>{dangerLine(row, Date.now())}</Text>
                  </li>
                ))}
              </ul>
            </section>
          );
        })()
      ) : null}

      {/*
        Шаг 176: журнал открывают с вопросом «не случилось ли чего», а получают
        хронологию. Опасное поднимается выше обычного — с числами и первой строкой,
        чтобы ответ был сверху, а не после листания.
      */}
      {events && events.length > 0 ? (
        (() => {
          const got = dangerTally(events);
          return (
            <section className={styles.pains} aria-label="Опасное сверху">
              <Text weight="semibold" role="status" aria-live="polite">
                {got.said}
              </Text>
              <Text className={styles.note} block>
                {firstDanger(events)}
              </Text>
            </section>
          );
        })()
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
              {/* Отчёт — действие, а не колонка: но стоит последним, чтобы
                  читать строку слева направо и уходить с кнопкой. */}
              <th className={styles.head}>отчёт</th>
            </tr>
          </thead>
          <tbody>
            {dangerOrder(events)
              .map((event, index) => ({ event, index }))
              .filter(({ index }) => !filterOn || shownEvents.has(`e${index}`))
              .map(({ event, index }) => (
              <tr key={`${event.at_ms}-${event.kind}-${index}`}>
                <td className={styles.cell}>{time(event.at_ms)}</td>
                <td className={styles.cell}>{journal.kind[event.kind] ?? event.kind}</td>
                <td className={styles.cell}>{event.subject}</td>
                <td className={styles.cell}>{event.risk}</td>
                <td className={styles.cell}>{event.decision}</td>
                <td className={outcomeClass(styles, event.outcome)}>{event.outcome}</td>
                <td className={styles.cell}>{journal.duration(event.duration_ms)}</td>
                <td className={styles.cell}>
                  {(() => {
                    const key = `${event.at_ms}-${event.kind}-${index}`;
                    const done = copiedRow === key;
                    return (
                      <Button
                        size="small"
                        appearance="subtle"
                        aria-label={`скопировать отчёт: ${event.subject}`}
                        onClick={() => copyRow(key, event)}
                      >
                        {done ? "скопировано" : "копировать"}
                      </Button>
                    );
                  })()}
                </td>
              </tr>
              ))}
          </tbody>
        </table>
      ) : null}

      {/* Подтверждение — словами правила, а не своей строкой: текст «отчёт
          скопирован: его можно вставить в чат или письмо как есть» уже написан
          и проверен, второй такой же — лишняя правда. */}
      {copiedRow !== null ? (
        <Text className={styles.note} role="status" aria-live="polite">
          {reportCopied()}
        </Text>
      ) : null}

      {/* Выгрузка говорит числами: сколько секретов вычищено и сколько путей
          сокращено. «Всё безопасно» — это обещание, число — доказательство. */}
      {exported !== null ? (
        <Text className={styles.note} role="status" aria-live="polite">
          {exported}
        </Text>
      ) : null}
    </div>
  );
}
