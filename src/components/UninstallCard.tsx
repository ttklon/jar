import { useState } from "react";
import { Button, makeStyles, Text, tokens } from "@fluentui/react-components";
import { defaultChoice, preview } from "../lib/uninstallChoice";
import { confirm as wipeConfirm, listing as wipeRows, type Row } from "../lib/wipeListing";
import { install, leftovers, neverLeft, uninstall } from "../lib/cleanUninstall";

/**
 * «Удаление» (шаги 305, 319, 448): что уйдёт, что останется и почему.
 *
 * Ошибка, которую делают в обе стороны:
 *
 *  * **удаляем всё молча** — человек теряет память, которую собирал год, и узнаёт
 *    об этом после;
 *  * **оставляем всё молча** — через месяц он ставит программу снова и получает
 *    старые настройки, которых не ждал.
 *
 * Поэтому здесь нет одной кнопки «удалить». Есть **список с путями и размерами**
 * («данные» и «настройки» человеку ничего не значат, а `%LOCALAPPDATA%\…` —
 * значит), два ответа и подтверждение, где названо безвозвратное.
 *
 * Ответ по умолчанию — «оставить данные», и причина не «так безопаснее», а
 * асимметрия: удалить забытое можно в любой момент, вернуть собранную память —
 * нельзя.
 */

const useStyles = makeStyles({
  card: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    padding: "16px 18px",
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground2,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  row: { display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" },
  list: { display: "flex", flexDirection: "column", gap: "6px", margin: 0, padding: 0, listStyle: "none" },
  muted: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  mono: { fontFamily: tokens.fontFamilyMonospace, fontSize: tokens.fontSizeBase200 },
});

const rub = (mb: number): string => (mb >= 1024 ? `${(mb / 1024).toFixed(1)} ГБ` : `${mb} МБ`);

export function UninstallCard() {
  const styles = useStyles();
  const fallback = defaultChoice();
  const [choice, setChoice] = useState<"keep" | "wipe">(fallback.choice);
  const [asked, setAsked] = useState(false);

  const rows: readonly Row[] = wipeRows(choice);
  const plan = preview(choice);
  const run = uninstall(true, choice === "keep");

  return (
    <div className={styles.card}>
      <div>
        <Text weight="semibold" block>
          Удаление программы
        </Text>
        <Text className={styles.muted} block>
          {fallback.why}
        </Text>
      </div>

      <div className={styles.row} role="radiogroup" aria-label="что делать с данными">
        <Button
          appearance={choice === "keep" ? "primary" : "secondary"}
          aria-pressed={choice === "keep"}
          onClick={() => {
            setChoice("keep");
            setAsked(false);
          }}
        >
          оставить данные
        </Button>
        <Button
          appearance={choice === "wipe" ? "primary" : "secondary"}
          aria-pressed={choice === "wipe"}
          onClick={() => {
            setChoice("wipe");
            setAsked(false);
          }}
        >
          удалить всё
        </Button>
      </div>

      {/* Список того, что будет тронуто: путь и размер, а не слово «данные». */}
      <ul className={styles.list} aria-label="что будет удалено">
        {rows.map((row) => (
          <li key={row.path} className={styles.row}>
            <Text className={styles.mono}>{row.path}</Text>
            <Text className={styles.muted}>
              {`${row.what} · ${rub(row.mb)}${row.precious ? " · восстановить нельзя" : ""}`}
            </Text>
          </li>
        ))}
      </ul>

      <Text className={styles.muted} block>
        {wipeConfirm(choice)}
      </Text>
      <Text className={styles.muted} block>
        {plan.said}
      </Text>

      {/* Что остаётся сознательно: иначе «чистое удаление» звучит как обещание
          стереть и то, что принадлежит системе. */}
      <Text className={styles.muted} block>
        {`убирается всегда: ${neverLeft(true).join("; ")}`}
      </Text>

      {asked ? (
        <div role="alert" aria-live="polite">
          <Text className={styles.muted} block>
            {run.said}
          </Text>
          <Text className={styles.muted} block>
            {`после удаления не остаётся: ${leftovers(choice === "keep").join("; ")}`}
          </Text>
        </div>
      ) : (
        <div className={styles.row}>
          <Button
            onClick={() => {
              setAsked(true);
            }}
          >
            {choice === "wipe" ? "показать, что исчезнет навсегда" : "что произойдёт при удалении"}
          </Button>
        </div>
      )}

      <details>
        <summary className={styles.muted}>что установка кладёт на компьютер</summary>
        <ul className={styles.list}>
          {install(true).map((placed) => (
            <li key={placed.where}>
              <Text className={styles.mono}>{`${placed.what}: ${placed.where}`}</Text>
            </li>
          ))}

        </ul>
      </details>
    </div>
  );
}
