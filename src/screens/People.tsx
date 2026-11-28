import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Input, makeStyles, Spinner, Text, tokens } from "@fluentui/react-components";
import { engineStatus, isTauri, memoryRuns, people, personAdd, personRemove, personSwitch } from "../ipc";
import type { PeopleBook, RunRecord } from "../ipc";
import { ask as askWho, need as needWho, after as afterWho } from "../lib/whoNow";
import { absent as localAbsent, contents as localContents, worksOffline } from "../lib/localProfile";
import { entry as journalEntry } from "../lib/whoAsked";
import { may as personMay } from "../lib/personRights";
import { confirm as forgetConfirm, stays as forgetStays, willGo } from "../lib/forgetProfile";
import { guard, sweep } from "../lib/memoryGuard";
import { hear, wantsNoMemory } from "../lib/dontStore";
import { allowed as guestAllowed, askOwner, wholePlan } from "../lib/guestHands";
import { decide as guestDecide, howWord as attemptWord } from "../lib/guestCannotDanger";
import { after as transferAfter, pack, type Bundle } from "../lib/profileTransfer";
import { build as exportBuild, fileName as exportName, summary as exportSummary } from "../lib/profileExport";
import { conflict, notDo, read as readProfile } from "../lib/importChecks";
import { ANON, FULL, hide } from "../lib/anonTransfer";
import { cost as switchCost } from "../lib/switchNoRestart";
import { keptAndLost, snap, summaryOf, type Snapshot } from "../lib/switchCheck";

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
  const [carried, setCarried] = useState("");
  const [brought, setBrought] = useState<string | null>(null);
  const [bad, setBad] = useState(false);
  // Что переключение сохранило и что потеряло — по двум снимкам, а не по обещанию.
  const [kept, setKept] = useState<{ kept: string[]; lost: string[] } | null>(null);
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

  // Что живо: последние запуски и движок. Держим в ссылках, чтобы снимок
  // читался синхронно в момент нажатия, а не ждал ответа ядра.
  const lastRuns = useRef<readonly RunRecord[]>([]);
  const lastEngine = useRef<{ running: boolean } | null>(null);
  useEffect(() => {
    if (!isTauri()) return;
    let alive = true;
    const tick = () => {
      if (document.visibilityState === "hidden") return;
      void memoryRuns(10)
        .then((runs) => {
          if (alive) lastRuns.current = runs;
        })
        .catch(() => {
          // Журнал недоступен — снимок будет пустым, и отчёт скажет «нечего
          // было терять», а не соврёт про сохранённое.
        });
      void engineStatus()
        .then((status) => {
          if (alive) lastEngine.current = { running: status.running };
        })
        .catch(() => {
          if (alive) lastEngine.current = null;
        });
    };
    tick();
    const timer = setInterval(tick, 5000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  /**
   * Прочитать «что живо» прямо сейчас: черновик, шаги идущего дела, движок.
   *
   * `memoryRuns` и `engineStatus` — те же команды, что у плашки и экрана
   * «Модели»: своего источника правды для «идёт ли дело» быть не должно.
   * Не сумели прочитать — считаем пустым и говорим об этом в отчёте.
   */
  const liveSnapshot = (): Snapshot =>
    snap(
      lastRuns.current,
      lastEngine.current,
      globalThis.localStorage ?? null,
    );

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
    // Снимок «что живо» — **до** переключения, иначе сравнивать не с чем и
    // «ничего не потерялось» будет обещанием, а не наблюдением (шаг 78).
    const before = liveSnapshot();
    personSwitch(id)
      .then((got) => {
        setBook(got);
        setBad(false);
        const picked = got.people.find((person) => person.id === id);
        if (picked !== undefined && current !== null) {
          const after = liveSnapshot();
          const report = keptAndLost(before, after, picked.name);
          // Две вещи разными словами: что меняется (правило `whoNow`) и что
          // доказано снимком. Одно «теперь он» без второго — обещание.
          setSaid(`${afterWho(picked, current).said}. ${summaryOf(before, after, picked.name)}`);
          setKept(report);
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

          {/* Переключение без перезапуска (шаг 78): не обещание, а отчёт по двум
              снимкам. Пока не переключали — сказано, что именно проверится. */}
          {book.people.length > 1 ? (
            <div className={styles.card}>
              <Text weight="semibold" block>
                Переключение без перезапуска
              </Text>
              <Text className={styles.muted} block>
                {switchCost().said}
              </Text>
              {kept === null ? (
                <Text className={styles.muted} block>
                  при первом переключении проверю по факту: фраза в поле ввода, шаги идущего
                  дела, загруженная модель, открытое окно
                </Text>
              ) : (
                // Подробности — здесь, одной строкой для диктора — в
                // объявлении выше. Дважды одно и то же читать вслух нельзя:
                // второе повторение превращает отчёт в шум.
                <div>
                  {kept.kept.length > 0 ? (
                    <Text className={styles.muted} block>
                      осталось на месте: {kept.kept.join(", ")}
                    </Text>
                  ) : null}
                  {kept.lost.length > 0 ? (
                    <Text className={styles.muted} block role="alert">
                      пропало: {kept.lost.join(", ")}
                    </Text>
                  ) : (
                    <Text className={styles.muted} block>
                      потерь не найдено — сравнение до и после, а не обещание
                    </Text>
                  )}
                </div>
              )}
              <Text className={styles.muted} block>
                почему не перезапуск: идущее дело потерялось бы, набранная фраза исчезла бы, а
                модель на слабой машине грузилась бы заново десятки секунд
              </Text>
            </div>
          ) : null}

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

          {/* Перенос профиля файлом: один файл, который человек несёт с собой. */}
          <div className={styles.card}>
            <Text weight="semibold" block>
              Перенести профиль на другой компьютер
            </Text>
            <Text className={styles.muted} block>
              Один файл: память, имя и разрешения. Без сервера, без входа, без «подтвердите
              перенос на почте».
            </Text>
            <div className={styles.row}>
              <Button
                onClick={() => {
                  const person = current;
                  if (person === null) {
                    setBad(true);
                    setSaid("переносить нечего: сначала заведите человека");
                    return;
                  }
                  // Разрешения — текстом, который человек поймёт.
                  const out = {
                    name: person.name,
                    facts: [] as string[],
                    grants: [] as string[],
                    at: new Date().toISOString().slice(0, 19),
                  };
                  const file = exportBuild(out);
                  const parsed = readProfile(file);
                  setCarried(file);
                  setBad(!parsed.ok);
                  setSaid(
                    parsed.ok
                      ? `${exportSummary(out)} — имя файла: ${exportName(person.name, new Date())}`
                      : parsed.said,
                  );
                }}
              >
                собрать файл
              </Button>
              <Button
                onClick={() => {
                  const person = current;
                  if (person === null) return;
                  const bundle: Bundle = {
                    version: 1,
                    person: { id: person.id, name: person.name },
                    facts: [],
                    grants: [],
                    from: "этот компьютер",
                  };
                  const packed = pack(bundle);
                  const plan = transferAfter(bundle, ["Загрузки"]);
                  setCarried(packed.text);
                  setBad(!packed.ok);
                  setSaid(`${packed.said}. ${plan.said}`);
                }}
              >
                что будет на новой машине
              </Button>
            </div>
            {carried !== "" ? (
              <Text className={styles.mono} aria-label="файл профиля">
                {carried.length > 400 ? `${carried.slice(0, 400)}…` : carried}
              </Text>
            ) : null}
            <div className={styles.row}>
              <Input
                aria-label="вставить файл профиля"
                className={styles.wide}
                placeholder="вставьте сюда файл профиля"
                value={brought ?? ""}
                onChange={(_, data) => setBrought(data.value)}
              />
              <Button
                onClick={() => {
                  // Импорт проверяет формат и НЕ перезаписывает молча.
                  const read = readProfile(brought ?? "");
                  if (!read.ok) {
                    setBad(true);
                    setSaid(read.said);
                    return;
                  }
                  const clash = conflict(read.got.name);
                  setBad(false);
                  setSaid(`${read.said} ${clash.said}`);
                }}
              >
                проверить файл
              </Button>
            </div>
            <ul className={styles.list}>
              {notDo().slice(0, 3).map((line) => (
                <li key={line}>
                  <Text className={styles.muted}>{line}</Text>
                </li>
              ))}
              <li>
                <Text className={styles.muted}>
                  {`перед отправкой наружу: файл памяти можно обезличить — ${hide(
                    { version: 1, exportedAt: Date.now(), preferences: [], methods: [], exceptions: [] },
                    ANON,
                  ).said}`}
                </Text>
              </li>
              <li>
                <Text className={styles.muted}>
                  {`без обезличивания — ${hide(
                    { version: 1, exportedAt: Date.now(), preferences: [], methods: [], exceptions: [] },
                    FULL,
                  ).said}`}
                </Text>
              </li>
            </ul>
          </div>

          {/* Память: чего в ней не бывает и как её забыть. */}
          <div className={styles.card}>
            <Text weight="semibold" block>
              Память: что в неё не попадает
            </Text>
            <Text className={styles.muted} block>
              {guard({ kind: "ключ", value: "api key sk-live-4f9a2b7c1d3e5f60" }).said}
            </Text>
            <Text className={styles.muted} block>
              {`проверка идёт ДО записи: у памяти нет «отменить», и вычищать записанное значит переписывать историю. ${sweep([{ kind: "пароль", value: "hunter2" }]).said}`}
            </Text>
            <Text className={styles.muted} block>
              {`«не запоминай это» — отдельная фраза: ${
                wantsNoMemory("не запоминай это")
                  ? hear("не запоминай это", { kind: "папка", value: "Загрузки" }, Date.now()).ask
                  : "фраза не распознана"
              }`}
            </Text>
            <div className={styles.row}>
              <Button
                appearance="subtle"
                disabled={current === null}
                onClick={() => {
                  const person = current;
                  if (person === null) return;
                  // Подтверждение называет и то, что исчезнет, и то, что останется:
                  // иначе кнопка «забыть» выглядит как «потерять всё».
                  setBad(false);
                  setSaid(
                    forgetConfirm(
                      {
                        person: { id: person.id, name: person.name },
                        facts: [],
                        allowed: [],
                        guest: person.guest,
                      },
                      7,
                    ),
                  );
                }}
              >
                {`что будет, если забыть профиль${current === null ? "" : ` «${current.name}»`}`}
              </Button>
            </div>
            {current !== null ? (
              <details>
                <summary className={styles.muted}>исчезнет и останется</summary>
                <ul className={styles.list}>
                  {willGo({ person: { id: current.id, name: current.name }, facts: [], allowed: [], guest: current.guest }).map(
                    (line) => (
                      <li key={line}>
                        <Text className={styles.muted}>{`исчезнет: ${line}`}</Text>
                      </li>
                    ),
                  )}
                  {forgetStays().map((line) => (
                    <li key={line}>
                      <Text className={styles.muted}>{`останется: ${line}`}</Text>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </div>

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
