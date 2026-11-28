import { makeStyles, Text, tokens } from "@fluentui/react-components";
import { check as keyboardCheck, escape, steps } from "../lib/keyboardOnly";
import { aria, check as alertCheck, queue } from "../lib/alertA11y";
import { afterFullscreen, decide, notDo as fullNotDo } from "../lib/fullscreenGames";

/**
 * «Доступность» (шаги 193, 198).
 *
 * Два дефекта, которые снаружи не видны, а человеку делают программу
 * непригодной:
 *
 *  * **главный сценарий требует мыши** — человек, который печатает, теряет руки
 *    с клавиатуры на полпути;
 *  * **ошибка видна, но не объявлена** — для человека с экранным диктором её
 *    просто нет: он слышит «всё хорошо», а на экране красное.
 *
 * Поэтому здесь не обещание, а **проверка**: список шагов сценария с клавишами и
 * проверка объявлений у ошибок — с числами, а не «доступно».
 */

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", gap: "16px" },
  card: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    padding: "16px 18px",
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground2,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  list: { display: "flex", flexDirection: "column", gap: "6px", margin: 0, padding: 0, listStyle: "none" },
  muted: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  mono: { fontFamily: tokens.fontFamilyMonospace, fontSize: tokens.fontSizeBase200 },
  lead: { color: tokens.colorNeutralForeground2, maxWidth: "78ch" },
});

/** Ошибки, на которых проверяем объявления: три разных вида. */
const NOTICES = [
  { level: "ошибка" as const, text: "не удалось удалить файл: он открыт в другой программе", todo: "закройте программу" },
  { level: "ошибка" as const, text: "нет прав на запись в папку программы", todo: "запустите от администратора" },
  { level: "предупреждение" as const, text: "микрофон занят другой программой" },
];

export function Accessibility() {
  const styles = useStyles();
  const wrong = keyboardCheck();
  const problems = NOTICES.flatMap((notice) => alertCheck(notice));
  const first = queue(NOTICES);

  return (
    <div className={styles.root}>
      <div>
        <Text as="h1" size={600} weight="semibold" block>
          Доступность
        </Text>
        <Text className={styles.lead} block>
          Главный сценарий проходит без мыши, а ошибки слышны экранному диктору. Здесь —
          проверка, а не обещание.
        </Text>
      </div>

      <div className={styles.card}>
        <Text weight="semibold" block>
          Игры и полноэкранные приложения
        </Text>
        <ul className={styles.list}>
          <li>
            <Text className={styles.muted}>
              {`опасное дело само: ${decide({ fullscreen: true, byPerson: false, dangerous: true }).said}`}
            </Text>
          </li>
          <li>
            <Text className={styles.muted}>
              {`вы нажали сами: ${decide({ fullscreen: true, byPerson: true, dangerous: false }).said}`}
            </Text>
          </li>
          <li>
            <Text className={styles.muted}>
              {`после игры: ${afterFullscreen(2)}`}
            </Text>
          </li>
          {fullNotDo().map((line) => (
            <li key={line}>
              <Text className={styles.muted}>{`не делаем: ${line}`}</Text>
            </li>
          ))}
        </ul>
      </div>

      <div className={styles.card}>
        <Text weight="semibold" block>
          {wrong.length === 0
            ? `Главный сценарий без мыши: ${steps().length} шагов, все с клавишами`
            : `В сценарии ${wrong.length} мест без клавиш`}
        </Text>
        <ul className={styles.list}>
          {steps().map((step, index) => (
            <li key={step.key}>
              <Text className={styles.mono}>{`${index + 1}. ${step.key}`}</Text>
              <Text className={styles.muted} block>
                {`${step.where} — диктор: «${step.heard}»`}
              </Text>
            </li>
          ))}
        </ul>
        {wrong.length > 0 ? (
          <Text className={styles.muted} role="alert">
            {wrong.join("; ")}
          </Text>
        ) : null}
        {/* Esc — не «закрыть окно», а «шаг назад»: человек, который ушёл не туда,
            не должен терять начатое. */}
        <Text className={styles.muted} block>
          {`Esc: ${escape(steps().length - 1).said}`}
        </Text>
      </div>

      <div className={styles.card}>
        <Text weight="semibold" block>
          {problems.length === 0
            ? "Ошибки объявляются экранному диктору: роль, срочность и текст"
            : `У ${problems.length} уведомлений нет объявления`}
        </Text>
        <ul className={styles.list}>
          {NOTICES.map((notice) => {
            const said = aria(notice);
            return (
              <li key={notice.text}>
                <Text className={styles.mono}>{`role="${said.role}" aria-live="${said.live}"`}</Text>
                <Text className={styles.muted} block>
                  {`${notice.text} → «${said.label}»`}
                </Text>
              </li>
            );
          })}
        </ul>
        {/* Очередь: диктор не должен слышать три ошибки разом — это шум. */}
        <Text className={styles.muted} block>
          {`при трёх ошибках подряд диктор скажет сначала: «${first.first ?? ""}», а ещё ${first.rest} — после`}
        </Text>
        {problems.length > 0 ? (
          <Text className={styles.muted} role="alert">
            {problems.join("; ")}
          </Text>
        ) : null}
      </div>
    </div>
  );
}
