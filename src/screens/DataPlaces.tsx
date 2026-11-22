import { useEffect, useState } from "react";
import { makeStyles, Text, tokens } from "@fluentui/react-components";
import { dataPlaces, dataTotals } from "../ipc";
import type { DataPlace, DataTotals } from "../ipc";
import { places } from "../i18n/ru";

/**
 * Где данные — карточка в настройках.
 *
 * Правила:
 *
 *  * **путь и размер, а не «где-то в AppData».** Человек должен найти файл сам, без
 *    документации и вопросов;
 *  * **«файла ещё нет» отдельно от «0 КБ».** Это разные утверждения, и путать их значит
 *    врать про состояние;
 *  * **здесь нет кнопки «очистить».** Удаление файлов — отдельное дело с подтверждением;
 *    кнопка рядом с путём слишком легко превращается в «нажал и потерял журнал».
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
  lead: { color: tokens.colorNeutralForeground2 },
  muted: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  list: { display: "flex", flexDirection: "column", gap: "10px", margin: 0, padding: 0 },
  row: { display: "flex", flexDirection: "column", gap: "2px", listStyle: "none" },
  head: { display: "flex", gap: "8px", alignItems: "baseline", flexWrap: "wrap" },
  path: { fontFamily: tokens.fontFamilyMonospace, fontSize: tokens.fontSizeBase200 },
  totals: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    paddingTop: "10px",
    borderTop: `1px solid ${tokens.colorNeutralStroke3}`,
  },
});

export function DataPlaces() {
  const styles = useStyles();
  const [items, setItems] = useState<DataPlace[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [totals, setTotals] = useState<DataTotals | null>(null);
  const [totalsError, setTotalsError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    dataTotals()
      .then((value) => {
        if (alive) setTotals(value);
      })
      .catch((reason: unknown) => {
        if (alive) setTotalsError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    dataPlaces()
      .then((data) => {
        if (alive) setItems(data);
      })
      .catch((reason: unknown) => {
        if (alive) setError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className={styles.card}>
      <div>
        <Text weight="semibold">{places.title}</Text>
        <Text className={styles.lead} block>
          {places.lead}
        </Text>
      </div>

      {error ? (
        <Text className={styles.muted} block>
          {places.error(error)}
        </Text>
      ) : items === null ? (
        <Text className={styles.muted} block>
          {places.loading}
        </Text>
      ) : items.length === 0 ? (
        <Text className={styles.muted} block>
          {places.browser}
        </Text>
      ) : (
        <ul className={styles.list}>
          {items.map((item) => (
            <li key={item.title} className={styles.row}>
              <div className={styles.head}>
                <Text weight="semibold">{item.title}</Text>
                <Text className={styles.muted}>
                  {item.exists ? places.size(formatBytes(item.bytes)) : places.missing}
                </Text>
              </div>
              <Text className={styles.path}>{item.path}</Text>
              <Text className={styles.muted}>{item.note}</Text>
            </li>
          ))}
        </ul>
      )}

      {items && items.length > 0 ? (
        <Text className={styles.muted} block>
          {places.copyHint}
        </Text>
      ) : null}

      {/* Итог отдельно от списка: «12 ГБ» без разбивки ничего не говорит, а почти всё
          это модели — их человек может убрать сам (шаг 395). */}
      <div className={styles.totals}>
        <Text weight="semibold">{places.totalsTitle}</Text>
        {totalsError ? (
          <Text className={styles.muted} block>
            {places.totalsError(totalsError)}
          </Text>
        ) : totals === null ? (
          <Text className={styles.muted} block>
            {places.totalsBrowser}
          </Text>
        ) : (
          <>
            <Text className={styles.muted} block>
              {places.totalsTotal(formatBytes(totals.totalBytes))}
            </Text>
            {(
              [
                ["data", totals.dataBytes],
                ["models", totals.modelsBytes],
                ["runtimes", totals.runtimesBytes],
                ["program", totals.programBytes],
              ] as const
            ).map(([part, bytes]) => (
              <Text key={part} className={styles.muted} block>
                {places.totalsLine(places.parts[part], formatBytes(bytes))}
              </Text>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

/** Размер в человеческом виде — то же правило, что в ядре: не округлять до нуля. */
export function formatBytes(bytes: number): string {
  const kb = 1024;
  if (bytes < kb) return `${bytes} Б`;
  if (bytes < kb * kb) return `${(bytes / kb).toFixed(1)} КБ`;
  // Гигабайты — не украшение: модель весит гигабайты, и «3072.0 МБ» человек читает
  // как «три тысячи каких-то мегабайт», а не как «три гигабайта» (шаг 395).
  if (bytes < kb * kb * kb) return `${(bytes / (kb * kb)).toFixed(1)} МБ`;
  return `${(bytes / (kb * kb * kb)).toFixed(1)} ГБ`;
}
