import { useState } from "react";
import { Button, makeStyles, Text, tokens } from "@fluentui/react-components";
import { deed as text, journal } from "../i18n/ru";
import { deedText, evidenceText, judge, links, oneLine } from "../lib/deed";
import type { Deed } from "../lib/deed";

/**
 * Карточка дела: одна форма отчёта вместо трёх.
 *
 * Три решения:
 *
 *  * **свёрнута в одну строку, а раскрывается в детали.** Лента из развёрнутых
 *    карточек превращается в простыню, и «что было вчера» в ней не найти. В
 *    строке — что, когда, чем кончилось; всё остальное по нажатию;
 *  * **доказательство видно у каждого шага.** «Шаг выполнен» без доказательства
 *    — это вера, а не отчёт: человек должен видеть, что именно проверено;
 *  * **кнопки только те, что что-то делают.** «Отменить» у законченного дела и
 *    «Повторить» у скачивания не показываются: ложная кнопка хуже отсутствия —
 *    на неё жмут и ждут.
 */

const useStyles = makeStyles({
  card: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    padding: "10px 12px",
    borderRadius: tokens.borderRadiusLarge,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  head: { display: "flex", gap: "8px", alignItems: "baseline", flexWrap: "wrap" },
  summary: {
    display: "flex",
    gap: "8px",
    alignItems: "baseline",
    flexWrap: "wrap",
    padding: 0,
    border: "none",
    background: "none",
    textAlign: "left",
    cursor: "pointer",
    color: tokens.colorNeutralForeground1,
    font: "inherit",
  },
  ok: { color: tokens.colorPaletteGreenForeground1 },
  bad: { color: tokens.colorPaletteRedForeground1 },
  muted: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  details: { display: "flex", flexDirection: "column", gap: "6px" },
  steps: {
    margin: 0,
    paddingLeft: "18px",
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    fontSize: tokens.fontSizeBase200,
  },
  proof: {
    fontFamily: tokens.fontFamilyMonospace,
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase100,
  },
  skipped: { color: tokens.colorNeutralForeground3, fontStyle: "italic" },
  actions: { display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" },
  why: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  copied: { color: tokens.colorPaletteGreenForeground1, fontSize: tokens.fontSizeBase200 },
});

export interface DeedCardProps {
  deed: Deed;
  /** Отменить идущее дело. Нет обработчика — кнопки нет: обещать нечего. */
  onCancel?: () => void | Promise<void>;
  /** Повторить дело тем же планом. */
  onRepeat?: (deed: Deed) => void | Promise<void>;
  /** Открыта ли карточка сразу. По умолчанию — свёрнута. */
  startOpen?: boolean;
  /** Перейти к журналу этого дела. Нет обработчика — ссылки нет. */
  onOpenJournal?: (deed: Deed) => void;
  /** Перейти к откату той сессии, в которой шло дело. */
  onOpenUndo?: (deed: Deed) => void;
}

export function DeedCard({
  deed,
  onCancel,
  onRepeat,
  startOpen = false,
  onOpenJournal,
  onOpenUndo,
}: DeedCardProps) {
  const styles = useStyles();
  const [open, setOpen] = useState(startOpen);
  const [copied, setCopied] = useState<string | null>(null);
  const verdict = judge(deed);
  const reach = links(deed);

  const copy = () => {
    const payload = deedText(deed);
    const clipboard = globalThis.navigator?.clipboard;
    if (!clipboard) {
      // Без буфера обмена не делаем вид, что скопировали: текст можно выделить.
      setCopied(text.copyUnavailable);
      return;
    }
    void clipboard
      .writeText(payload)
      .then(() => setCopied(text.copied))
      .catch((problem: unknown) =>
        setCopied(text.copyFailed(problem instanceof Error ? problem.message : String(problem))),
      );
  };

  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <button
          type="button"
          className={styles.summary}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <Text weight="semibold">{oneLine(deed)}</Text>
          <Text className={styles.muted}>
            {open ? text.collapse : text.expand}
          </Text>
        </button>
      </div>

      {open ? (
        <div className={styles.details}>
          {/* Тема — отдельной строкой: в свёрнутой строке она внутри, и
              взять её оттуда целиком нельзя. Второй раз «Дело: …» не нужно. */}
          <Text weight="semibold">{deed.subject}</Text>
          {/* Вид дела: «инструмент», «план», «скачивание» — по нему человек
              понимает, откуда взялся такой набор шагов. */}
          <Text className={styles.muted}>
            {text.kindLabel(journal.runKind[deed.kind] ?? deed.kind)}
          </Text>
          {deed.steps.length === 0 ? (
            <Text className={styles.muted}>{text.noSteps}</Text>
          ) : (
            <ol className={styles.steps}>
              {deed.steps.map((step) => {
                const proof = evidenceText(step);
                const skipped = step.status === "skipped";
                return (
                  <li key={step.position} className={skipped ? styles.skipped : undefined}>
                    <span className={skipped ? undefined : step.ok ? styles.ok : styles.bad}>
                      {skipped ? "−" : step.ok ? "✓" : "✗"}
                    </span>{" "}
                    {/* Имя шага и причина — отдельными узлами: иначе «files|…»
                        склеивается с доказательством в одну строку, и ни
                        человек, ни диктор не могут взять одно без другого. */}
                    <span>{step.tool}</span>
                    {step.reason ? <span> — {step.reason}</span> : null}
                    {/* Доказательства нет — так и написано. Пустота читалась бы
                        как «проверка прошла молча». */}
                    <span className={styles.proof}>
                      {proof ? ` · ${text.proof(proof)}` : ` · ${text.noProof}`}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}

          <div className={styles.actions}>
            {onCancel && verdict.canCancel ? (
              <Button size="small" appearance="secondary" onClick={() => void onCancel()}>
                {text.cancel}
              </Button>
            ) : null}
            {onRepeat && verdict.canRepeat ? (
              <Button size="small" appearance="secondary" onClick={() => void onRepeat(deed)}>
                {text.repeat}
              </Button>
            ) : null}
            {!verdict.canRepeat && verdict.repeatWhy ? (
              <Text className={styles.why}>{text.cannotRepeat(verdict.repeatWhy)}</Text>
            ) : null}
            {/* Ссылки на журнал и откат — только когда вести есть куда. */}
            {onOpenJournal && reach.journal ? (
              <Button size="small" appearance="subtle" onClick={() => onOpenJournal(deed)}>
                {text.openJournal}
              </Button>
            ) : null}
            {onOpenUndo && reach.undo ? (
              <Button size="small" appearance="subtle" onClick={() => onOpenUndo(deed)}>
                {text.openUndo}
              </Button>
            ) : null}
            <Button size="small" appearance="subtle" onClick={copy}>
              {text.copy}
            </Button>
            {copied ? (
              <Text role="status" aria-live="polite" className={styles.copied}>
                {copied}
              </Text>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
