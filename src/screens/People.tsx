import { useCallback, useEffect, useState } from "react";
import { Button, Input, makeStyles, Spinner, Text, tokens } from "@fluentui/react-components";
import { isTauri, people, personAdd, personRemove, personSwitch } from "../ipc";
import type { PeopleBook } from "../ipc";
import { ask as askWho, need as needWho, after as afterWho } from "../lib/whoNow";
import { absent as localAbsent, contents as localContents, worksOffline } from "../lib/localProfile";
import { entry as journalEntry } from "../lib/whoAsked";
import { may as personMay } from "../lib/personRights";
import { allowed as guestAllowed, askOwner, wholePlan } from "../lib/guestHands";
import { decide as guestDecide, howWord as attemptWord } from "../lib/guestCannotDanger";

/**
 * «Люди» — кто за этим компьютером и кто действует сейчас (шаги 401–406).
 *
 * Главная ошибка, которую этот экран исключает: **чужое согласие считается моим**.
 * Пока память и разрешения одни на всех, «можно удалять файлы», сказанное одним
 * человеком, работает и для гостя — и гость удаляет чужое с молчаливого согласия
 * хозяина.
 *
 * Три решения:
 *
 *  * **один человек — ничего не выбирает**: экран не спрашивает «кто вы», пока
 *    второго профиля нет;
 *  * **память по человеку видна числом**: сколько фактов у него, а не «своя»;
 *  * **гость назван гостем** и опасного не получает — это сказано до дела, а не
 *    после отказа.
 *
 * Профиль живёт в файле: ни аккаунта, ни сети.
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
  list: { display: "flex", flexDirection: "column", gap: "8px", margin: 0, padding: 0, listStyle: "none" },
  row: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" },
  muted: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  mono: { fontFamily: tokens.fontFamilyMonospace },
  wide: { minWidth: "220px", minHeight: "44px" },
  lead: { color: tokens.colorNeutralForeground2, maxWidth: "78ch" },
});

export function People() {
  const styles = useStyles();
  const [book, setBook] = useState<PeopleBook | null>(null);
  const [name, setName] = useState("");
  const [guest, setGuest] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const [bad, setBad] = useState(false);
  const tauri = isTauri();

  const load = useCallback(() => {
    people()
      .then((got) => setBook(got))
      .catch((reason: unknown) => {
        setBad(true);
        setSaid(reason instanceof Error ? reason.message : String(reason));
      });
  }, []);

  useEffect(load, [load]);

  const current = book?.people.find((person) => person.id === book.current) ?? null;

  const add = () => {
    personAdd(name, guest)
      .then((got) => {
        setBook(got);
        setName("");
        setGuest(false);
        setBad(false);
        setSaid(
          got.people.length === 1
            ? `заведён «${got.people[0]?.name}»: пока человек один, ничего выбирать не нужно`
            : `заведён «${got.people[got.people.length - 1]?.name}»: память и разрешения у него свои`,
        );
      })
      .catch((reason: unknown) => {
        setBad(true);
        setSaid(reason instanceof Error ? reason.message : String(reason));
      });
  };

  const switchTo = (id: string) => {
    personSwitch(id)
      .then((got) => {
        setBook(got);
        setBad(false);
        const picked = got.people.find((person) => person.id === id);
        if (picked !== undefined && current !== null) {
          // Слова правила: дело не начинается заново, уже выполненные шаги остаются.
          setSaid(afterWho(picked, current).said);
        }
      })
      .catch((reason: unknown) => {
        setBad(true);
        setSaid(reason instanceof Error ? reason.message : String(reason));
      });
  };

  const drop = (id: string) => {
    personRemove(id)
      .then((got) => {
        setBook(got);
        setBad(false);
        setSaid("профиль удалён: его память и разрешения ушли вместе с ним");
      })
      .catch((reason: unknown) => {
        setBad(true);
        setSaid(reason instanceof Error ? reason.message : String(reason));
      });
  };

  return (
    <div className={styles.root}>
      <div>
        <Text as="h1" size={600} weight="semibold" block>
          Люди
        </Text>
        <Text className={styles.lead} block>
          У каждого человека своя память и свои разрешения. «Можно удалять» — это согласие
          человека, а не свойство компьютера: чужое согласие не считается вашим.
        </Text>
      </div>

      {!tauri ? (
        <Text className={styles.muted}>
          в браузере профилей нет: список людей и память ведёт приложение
        </Text>
      ) : null}

      {book === null ? (
        <div role="status" aria-live="polite">
          <Spinner size="tiny" />
          <Text className={styles.muted}> читаю список людей…</Text>
        </div>
      ) : (
        <>
          <div className={styles.card}>
            <Text weight="semibold" block>
              {book.people.length === 0
                ? "Пока никого: первый человек создаётся молча"
                : `Сейчас действует: ${current?.name ?? "не выбран"}`}
            </Text>
            {book.people.length === 0 ? (
              <Text className={styles.muted}>
                второй профиль нужен, только если за компьютером бывает кто-то ещё — гость или
                член семьи
              </Text>
            ) : (
              <ul className={styles.list}>
                {book.people.map((person) => (
                  <li key={person.id} className={styles.row}>
                    <span>
                      <Text className={styles.mono}>
                        {person.name}
                        {person.id === book.current ? " — сейчас" : ""}
                      </Text>
                      <Text className={styles.muted} block>
                        {person.guest ? "гость: только безопасные дела" : "хозяин: обычные правила"} ·{" "}
                        {`фактов в его памяти: ${person.facts}`}
                      </Text>
                    </span>
                    <span className={styles.row}>
                      <Button
                        size="small"
                        appearance={person.id === book.current ? "primary" : "subtle"}
                        aria-label={`это ${person.name}`}
                        onClick={() => switchTo(person.id)}
                        disabled={person.id === book.current}
                      >
                        это он
                      </Button>
                      <Button
                        size="small"
                        appearance="subtle"
                        aria-label={`удалить человека: ${person.name}`}
                        onClick={() => drop(person.id)}
                      >
                        удалить
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className={styles.card}>
            <Text weight="semibold" block>
              Завести человека
            </Text>
            <div className={styles.row}>
              <Input
                aria-label="имя человека"
                className={styles.wide}
                placeholder="например: Аня"
                value={name}
                onChange={(_, data) => setName(data.value)}
              />
              <label>
                <input
                  type="checkbox"
                  aria-label="это гость"
                  checked={guest}
                  onChange={(event) => setGuest(event.target.checked)}
                />{" "}
                <Text className={styles.muted}>гость</Text>
              </label>
              <Button onClick={add} disabled={!tauri}>
                завести
              </Button>
            </div>
            <Text className={styles.muted}>
              Профиль живёт в файле на диске: ни аккаунта, ни пароля, ни сети.
            </Text>
          </div>

          {/* Что бывает перед опасным делом: вопрос «это вы?» внутри дела, а не
              экран настроек. Показано словами правила. */}
          {current !== null && book.people.length > 1 ? (
            <div className={styles.card}>
              <Text weight="semibold" block>
                Перед опасным делом
              </Text>
              <Text className={styles.muted} block>
                {needWho("delete", book.people.filter((person) => person.id !== book.current)).why}
              </Text>
              <Text className={styles.muted} block>
                {askWho(current, book.people.filter((person) => person.id !== book.current)).said}
              </Text>
              <Text className={styles.muted} block>
                {`гостю опасное недоступно: ${personMay([], "гость", "delete", "уборка", Date.now()).because}`}
              </Text>
            </div>
          ) : null}

          {/* Гость: что можно, чего нельзя и почему. Не «ограниченный режим», а
              четыре пути, по которым опасное могло бы пройти, — и отказ на каждом. */}
          <details>
            <summary className={styles.muted}>что может гость и почему опасное не пройдёт</summary>
            <ul className={styles.list}>
              <li>
                <Text className={styles.muted}>{guestAllowed("read").said}</Text>
              </li>
              <li>
                <Text className={styles.muted}>{guestAllowed("delete").said}</Text>
              </li>
              <li>
                <Text className={styles.muted}>{wholePlan(["read", "delete"]).said}</Text>
              </li>
              <li>
                <Text className={styles.muted}>{askOwner("удалить загрузки").said}</Text>
              </li>
              {(["ask", "schedule", "confirm", "switch"] as const).map((how) => (
                <li key={how}>
                  <Text className={styles.muted}>
                    {`${attemptWord(how)}: ${guestDecide({ how, risk: "delete", owner: "guest" }).said}`}
                  </Text>
                </li>
              ))}
            </ul>
          </details>

          {/* Где живёт профиль и что он не делает. */}
          <details>
            <summary className={styles.muted}>что лежит в профиле и чего в нём нет</summary>
            <ul className={styles.list}>
              {localContents().map((line) => (
                <li key={line}>
                  <Text className={styles.muted}>{line}</Text>
                </li>
              ))}
              {localAbsent().map((line) => (
                <li key={line}>
                  <Text className={styles.muted}>{line}</Text>
                </li>
              ))}
              <li>
                <Text className={styles.muted}>{worksOffline(false).said}</Text>
              </li>
              <li>
                <Text className={styles.muted}>
                  {journalEntry(current?.name ?? "я", "уборка загрузок", "done")?.who === undefined
                    ? "журнал записывает только законченную просьбу: кто, что и чем кончилось"
                    : "в журнале видно, кто попросил и чем кончилось — без того, что человек не просил"}
                </Text>
              </li>
            </ul>
          </details>
        </>
      )}

      {said !== null ? (
        <Text className={styles.muted} role={bad ? "alert" : "status"} aria-live="polite">
          {said}
        </Text>
      ) : null}
    </div>
  );
}
