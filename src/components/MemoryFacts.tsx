import { useCallback, useEffect, useState } from "react";
import { Button, makeStyles, Spinner, Text, tokens } from "@fluentui/react-components";
import { facts as readFacts, forgetFact, isTauri } from "../ipc";
import { factsFromStored, summary as memorySummary, willDo, type Fact } from "../lib/memoryView";

/**
 * «Что я о вас помню» — один список, одна кнопка (шаг 263).
 *
 * Память без управления — это хранение чужих привычек без спроса. Человек должен
 * видеть **всё**, что приложение о нём запомнило, узнавать это своими словами и
 * забывать одним нажатием.
 *
 * Экран нарочно скучный: список и кнопки. Ни «очистить всё», ни режима
 * выделения — первое стирает нужное вместе с лишним, второе требует объяснения.
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
  list: { display: "flex", flexDirection: "column", gap: "6px", margin: 0, padding: 0, listStyle: "none" },
  row: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px" },
  muted: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  label: { fontFamily: tokens.fontFamilyMonospace, fontSize: tokens.fontSizeBase300 },
});

export function MemoryFacts() {
  const styles = useStyles();
  const [items, setItems] = useState<Fact[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    readFacts()
      .then((stored) => {
        // Ядро отдаёт пары «ключ — значение». `factsFromStored` оставляет за
        // фактом **настоящий ключ**: раньше мост собирал id вида
        // `folder:<значение>`, а в базе ключ другой (`вопрос:путь`), и кнопка
        // «забыть» удаляла то, чего нет — «удалено», а факт на месте.
        setItems(factsFromStored(stored));
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason)));
  }, []);

  useEffect(load, [load]);

  const forget = (fact: Fact) => {
    // Кнопка сначала говорит, что исчезнет: «удалить факт» — не объяснение.
    setDone(willDo(fact));
    void forgetFact(fact.id)
      .then(() => load())
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason)));
  };

  return (
    <div className={styles.card}>
      <div>
        <Text weight="semibold" block>
          Что я о вас помню
        </Text>
        <Text className={styles.muted} block>
          Каждый факт удаляется одной кнопкой. Удалённое не вернётся.
        </Text>
      </div>

      {/* В браузере памяти нет: честно говорим это, а не показываем пустой список
          как факт «ничего не помню». */}
      {!isTauri() ? <Text className={styles.muted}>в браузере память не читается: приложение её здесь не ведёт</Text> : null}

      {items === null && error === null ? (
        <div role="status" aria-live="polite">
          <Spinner size="tiny" />
          <Text className={styles.muted}> читаю память…</Text>
        </div>
      ) : null}

      {error !== null ? (
        <Text role="alert" className={styles.muted}>
          {`память не ответила: ${error}`}
        </Text>
      ) : null}

      {items !== null ? (
        <>
          <Text className={styles.muted}>{memorySummary(items)}</Text>
          <ul className={styles.list}>
            {items.map((fact) => (
              <li key={fact.id} className={styles.row}>
                <span>
                  <Text className={styles.label}>{fact.label}</Text>
                  <Text className={styles.muted} block>
                    {fact.why === "" ? "запомнено по вашим делам" : fact.why}
                  </Text>
                </span>
                <Button size="small" appearance="subtle" aria-label={`забыть: ${fact.label}`} onClick={() => forget(fact)}>
                  забыть
                </Button>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {/* Что именно исчезло — словами правила, а не «готово». */}
      {done !== null ? (
        <Text className={styles.muted} role="status" aria-live="polite">
          {done}
        </Text>
      ) : null}
    </div>
  );
}
