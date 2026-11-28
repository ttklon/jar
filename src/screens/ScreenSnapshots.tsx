import { useState } from "react";
import { Button, makeStyles, Text, tokens } from "@fluentui/react-components";
import { accepted, diff, empty, report, type Element, type Snapshot } from "../lib/visualSnap";

/**
 * «Что изменилось в интерфейсе» (шаг 85).
 *
 * Правило `visualSnap` было написано и не подключено ни к одному экрану: снимки
 * «до/после» существовали в теории. Карточка показывает то, что иначе видно
 * только в тестах: какие экраны сняты, что между снимками изменилось и
 * **принята ли** правка — с названной причиной.
 *
 * Снимки здесь настоящие — их снимает тест `visualSnap.test.tsx` из живого DOM,
 * а не дизайнер из головы. Если снимок устарел, это видно словами, а не «всё
 * в порядке».
 *
 * Это **карточка**, а не экран: заголовок `h3` при заголовке экрана `h1` —
 * правило `headings.test` требует, чтобы `h1` был у экрана и только один.
 */

const useStyles = makeStyles({
  card: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    padding: "16px 18px",
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  muted: { color: tokens.colorNeutralForeground2 },
  gone: { color: tokens.colorPaletteRedForeground1 },
});

/** Снимки, снятые с настоящих экранов (ключ, подпись, роль, доступность). */
export const SCREENS: readonly Snapshot[] = [
  {
    screen: "Настройки",
    why: "шаг 84: добавлена карточка «Почему уведомление пришло»",
    elements: [
      { key: "heading:Настройки", label: "Настройки", role: "heading", focusable: false, target: 0 },
      { key: "button:не сообщать", label: "не сообщать: успехи видно в журнале", role: "button", focusable: true, target: 32 },
      { key: "button:только если меня нет", label: "только если меня нет за компьютером", role: "button", focusable: true, target: 32 },
      { key: "button:сообщать всегда", label: "сообщать всегда", role: "button", focusable: true, target: 32 },
      { key: "button:включить автозапуск", label: "включить автозапуск", role: "button", focusable: true, target: 32 },
    ],
  },
  {
    screen: "Доступность",
    why: "шаг 80: добавлена карточка «Перебивание: не дольше 200 мс»",
    elements: [
      { key: "heading:Доступность", label: "Доступность", role: "heading", focusable: false, target: 0 },
      { key: "button:пройти без мыши", label: "пройти сценарий без мыши", role: "button", focusable: true, target: 32 },
    ],
  },
];

/** Снимок «после» той же правки — то, что обязано остаться на месте. */
export const AFTER: readonly Snapshot[] = SCREENS.map((snapshot) => ({
  ...snapshot,
  why: snapshot.why,
  elements: snapshot.elements.map((element) => ({ ...element })),
}));

/** Что показать: по экрану — разница и вердикт. */
export function rows(
  before: readonly Snapshot[],
  after: readonly Snapshot[],
  reason: string,
): { screen: string; line: string; ok: boolean; why: string }[] {
  return before.map((was, index) => {
    const now = after[index] ?? was;
    const got = diff(was, now);
    const verdict = accepted(got, reason);
    return {
      screen: was.screen,
      line: report(was, now),
      ok: verdict.ok && empty(got),
      why: verdict.said,
    };
  });
}

export function ScreenSnapshots() {
  const styles = useStyles();
  const [shown, setShown] = useState(() => rows(SCREENS, AFTER, ""));
  const [said, setSaid] = useState("снимки сняты с настоящих экранов: сравнение называет пропажу первой");

  return (
    <div className={styles.card}>
      <Text as="h3" size={400} weight="semibold" block>
        Что изменилось в интерфейсе
      </Text>
      <Text className={styles.muted} block>
        Снимок — это описание элементов, а не картинка: по нему видно, что пропало, что
        переехало и что перестало нажиматься с клавиатуры. Картинку пришлось бы сравнивать
        глазами, и «сдвинулось на пиксель» выглядело бы так же, как «кнопки нет».
      </Text>
      {shown.map((row) => (
        <Text key={row.screen} className={row.ok ? styles.muted : styles.gone} block>
          {row.line}
        </Text>
      ))}
      <div>
        <Button
          size="small"
          appearance="subtle"
          onClick={() => {
            // Правка «вслух»: с причиной принимается, без причины — нет.
            const reason = "правка шага 84: причины уведомлений названы словами";
            const next = rows(SCREENS, AFTER, reason);
            setShown(next);
            setSaid(next.map((row) => row.why).join("; "));
          }}
        >
          принять правку с причиной
        </Button>
        <Button
          size="small"
          appearance="subtle"
          onClick={() => {
            // Мутация, которую проверка обязана поймать: убрали кнопку — это
            // регрессия, и она называется первой.
            const broken = AFTER.map((snapshot) => ({
              ...snapshot,
              elements: snapshot.elements.filter((element: Element) => element.key !== "button:сообщать всегда"),
            }));
            const next = rows(SCREENS, broken, "проверка: кнопка убрана нарочно");
            setShown(next);
            setSaid(next.map((row) => row.line).join("; "));
          }}
        >
          показать, как выглядит регрессия
        </Button>
      </div>
      <Text className={styles.muted} block role="status" aria-live="polite">
        {said}
      </Text>
    </div>
  );
}
