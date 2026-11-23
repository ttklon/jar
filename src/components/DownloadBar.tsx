import { useCallback, useEffect, useRef, useState } from "react";
import { Button, makeStyles, Text, tokens } from "@fluentui/react-components";
import { cancelDownload, downloadProgress, readinessStatus } from "../ipc";
import { resources } from "../i18n/ru";

/**
 * Скачивание видно с любого экрана (шаг 33).
 *
 * Зачем отдельно от `ReadinessCard`. Карточка стоит на экране знакомства, и
 * прогресс был виден **только там**: человек нажал «скачать», ушёл в «Историю»
 * — и больше не знает, идёт ли загрузка, сколько осталось и можно ли её
 * остановить. При гигабайте это не мелочь: полчаса неизвестности человек
 * проводит не в приложении.
 *
 * Три решения:
 *
 *  * **читает само, а не через карточку.** Общий стейт между экранами пришлось
 *    бы тянуть через всё дерево; опрос статуса — одна команда раз в секунду и
 *    только пока загрузка идёт. Когда её нет, таймера нет вовсе (шаг 384:
 *    idle не должен стоить);
 *  * **молчит, когда качать нечего.** Пустая полоска на каждом экране — шум;
 *  * **отмена одна.** Кнопка стоит здесь, потому что это единственное место,
 *    видное всегда; в карточке такая же подпись и то же действие, и это не
 *    дубль, а два места одного пути.
 */
const useStyles = makeStyles({
  bar: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: "10px",
    padding: "8px 12px",
    marginBottom: "8px",
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground3,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  text: { color: tokens.colorNeutralForeground2, fontSize: tokens.fontSizeBase200 },
});

/** Идёт ли загрузка и сколько уже есть. `name === null` — не идёт. */
export interface Progress {
  name: string | null;
  bytes: number | null;
}

/**
 * «Загрузки нет» — одна и та же ссылка на всё приложение.
 *
 * Не константа ради красоты: новое `{ name: null, bytes: null }` на каждый опрос
 * — это новое значение для `useState`, то есть перерисовка раз в секунду и
 * пересоздание поля ввода (со потерей фокуса) даже когда ничего не качается.
 */
const IDLE: Progress = { name: null, bytes: null };

/**
 * Те же показания байтов — тот же факт.
 *
 * `null` (прогресс не прочитался) и `null` — одно и то же; а вот `{ 100 }` и
 * `{ 100 }` — два разных объекта, и без сравнения по полям каждый опрос выглядел
 * бы новостью.
 */
function sameBytes(a: Progress["bytes"], b: Progress["bytes"]): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

export function useDownloadProgress(): Progress {
  const [progress, setProgress] = useState<Progress>(IDLE);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    let polling = false;

    const tick = () => {
      if (polling) return;
      polling = true;
      readinessStatus()
        .then(async (status) => {
          if (!alive.current) return;
          const name = status.download_name;
          if (!name) {
            // Тот же объект, а не новый: `{ name: null, bytes: null }` — это
            // новое значение при каждом опросе, и React считает состояние
            // изменившимся. Экран перерисовывался бы каждую секунду без
            // причины, а поле ввода — пересоздавалось бы, теряя фокус
            // (поймано e2e входа: «element was detached from the DOM»).
            setProgress(IDLE);
            // Загрузки нет — опрос больше не нужен: таймер живёт только пока
            // идёт скачивание (шаг 384: простой не должен стоить ничего).
            if (timer !== null) {
              clearInterval(timer);
              timer = null;
            }
            return;
          }
          const bytes = await downloadProgress(name).catch(() => null);
          if (!alive.current) return;
          // Опрос раз в секунду при неизменившихся показаниях — это не новое
          // состояние, а тот же факт. Сравниваем и не трогаем экран: иначе
          // каждая секунда перерисовки пересоздаёт поля ввода, и человек,
          // печатающий фразу, теряет каретку (шаг 383: ввод не блокируется,
          // но и не должен теряться).
          setProgress((was) =>
            was.name === name && sameBytes(was.bytes, bytes) ? was : { name, bytes },
          );
        })
        .catch(() => undefined)
        .finally(() => {
          polling = false;
        });
    };

    tick();
    timer = setInterval(tick, 1000);
    return () => {
      if (timer !== null) clearInterval(timer);
    };
  }, []);

  return progress;
}

export function DownloadBar({ progress }: { progress: Progress }) {
  const styles = useStyles();
  const cancel = useCallback(() => {
    void cancelDownload().catch(() => undefined);
  }, []);

  // Не идёт — не рисуем ничего. Пустая строка на каждом экране читается как
  // «что-то сломалось, но молчит».
  if (progress.name === null) return null;

  return (
    <div className={styles.bar} role="status" aria-live="polite">
      <Text className={styles.text}>
        {progress.bytes === null
          ? resources.downloadingGlobal(progress.name)
          : resources.downloadingGlobalSize(progress.name, progress.bytes)}
      </Text>
      <Button size="small" appearance="subtle" onClick={cancel}>
        {resources.cancel}
      </Button>
    </div>
  );
}
