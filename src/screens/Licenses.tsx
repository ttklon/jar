import { Badge, Text } from "@fluentui/react-components";
import { makeStyles, tokens } from "@fluentui/react-components";
import dataJson from "../../data/licenses.json";
import {
  UNKNOWN,
  agrees,
  copyleft,
  elsewhere,
  rows,
  source,
  unknownNote,
  type LicenseData,
} from "../lib/licenses";

/**
 * Экран «Лицензии» (шаг 217).
 *
 * Зачем отдельный экран, а не абзац в настройках. «Бесплатно» — обещание, а
 * обещание проверяют списком. До этого лицензии лежали в трёх местах, и ни одно
 * не было полным; человек верил слову, потому что проверить было нечем.
 *
 * Что сделано нарочно:
 *
 *  * **одна таблица**, отсортированная по числу пакетов: сначала большое;
 *  * **число словами и цифрами**, а не полосками: полоска на 487 и на 285
 *    выглядит почти одинаково, а разница в двести пакетов — нет;
 *  * **«не объявлено» — отдельная строка, а не пустое место.** Пропуск читается
 *    как «всё хорошо», хотя это «мы не знаем», и разница здесь важнее удобства;
 *  * **копилефт — отдельным блоком сверху**. Если он появится, человек узнает
 *    это первым, а не последним;
 *  * **источник под таблицей**: без него это цифры, с ним — проверяемые цифры.
 */
const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", gap: "16px" },
  lead: { color: tokens.colorNeutralForeground2, maxWidth: "70ch" },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    "& th": { textAlign: "left", padding: "8px 12px", fontWeight: tokens.fontWeightSemibold },
    "& td": { padding: "8px 12px" },
    "& tr": { borderBottom: `1px solid ${tokens.colorNeutralStroke2}` },
  },
  count: { textAlign: "right", fontVariantNumeric: "tabular-nums" },
  total: { fontWeight: tokens.fontWeightSemibold },
  note: { color: tokens.colorNeutralForeground2, maxWidth: "70ch" },
  alarm: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    padding: "12px 16px",
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorPaletteRedBorder2}`,
    backgroundColor: tokens.colorPaletteRedBackground1,
  },
});

export interface LicensesProps {
  /** Данные приходят явно: экран не читает файлы, чтобы его можно было проверить. */
  data?: LicenseData;
}

export function Licenses({ data = dataJson as unknown as LicenseData }: LicensesProps) {
  const styles = useStyles();
  const table = rows(data);
  const health = agrees(data);
  const risky = copyleft(data);

  return (
    <div className={styles.root}>
      {/* Правило репозитория: у каждого экрана главный заголовок первого уровня.
          Без него диктор не знает, куда попал, а «Лицензии» — экран, а не абзац. */}
      <Text as="h1" size={600} weight="semibold">
        Лицензии всего встроенного
      </Text>
      <Text className={styles.lead}>
        Всё встроенное — одной таблицей. Числа взяты из блокировок проекта, а не из памяти:
        лицензию можно сверить, открыв `package-lock.json` или `Cargo.lock`.
      </Text>

      {/* Расхождение в счёте — не мелочь: таблица, которая не сходится, врёт
          молча. Показываем громко и первым. */}
      {!health.ok ? (
        <div className={styles.alarm} role="alert">
          <Text weight="semibold">Таблица не сходится: {health.why}</Text>
          <Text>Пока это так, числам ниже верить нельзя — и это честнее, чем показать их без пометки.</Text>
        </div>
      ) : null}

      {risky.length > 0 ? (
        <div className={styles.alarm} role="alert">
          <Text weight="semibold">Копилефт среди встроенного: {risky.length}</Text>
          <ul>
            {risky.map((pack) => (
              <li key={`${pack.kind}-${pack.name}`}>
                {pack.name} — {pack.license}
              </li>
            ))}
          </ul>
          <Text>Это меняет ответ на «можно ли это распространять», поэтому названо до таблицы.</Text>
        </div>
      ) : null}

      <table className={styles.table}>
        <caption className={styles.note}>
          Всего {data.total} пакетов: {Object.entries(data.kinds)
            .map(([kind, count]) => `${kind} ${count}`)
            .join(", ")}.
        </caption>
        <thead>
          <tr>
            <th scope="col">Лицензия</th>
            <th scope="col" className={styles.count}>
              Пакетов
            </th>
          </tr>
        </thead>
        <tbody>
          {table.map((row) => (
            <tr key={row.license}>
              <td>
                {row.license}
                {row.license === UNKNOWN ? (
                  <>
                    {" "}
                    <Badge appearance="tint" color="warning">
                      не значит «нет лицензии»
                    </Badge>
                  </>
                ) : null}
              </td>
              <td className={styles.count}>{row.count}</td>
            </tr>
          ))}
          <tr className={styles.total}>
            <td>Всего</td>
            <td className={styles.count}>{data.total}</td>
          </tr>
        </tbody>
      </table>

      {data.unknown > 0 ? <Text className={styles.note}>{unknownNote(data)}</Text> : null}
      <Text className={styles.note}>{elsewhere()}</Text>
      <Text className={styles.note}>{source(data)}</Text>
    </div>
  );
}
