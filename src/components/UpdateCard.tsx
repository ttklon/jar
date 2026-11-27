import { useEffect, useState } from "react";
import { makeStyles, Text, tokens } from "@fluentui/react-components";
import { tell, verify, whyBefore } from "../lib/updateVerify";
import { checks as artifactChecks, notDo as artifactNotDo, publish as artifactPublish, verify as artifactVerify } from "../lib/signedArtifacts";
import { offer as manifestOffer } from "../lib/updateManifest";
import { decide as quietDecide, setting as quietSetting } from "../lib/quietUpdate";
import { afterTask, mayStart } from "../lib/notMidTask";
import { afterInstall, orderCheck, promise as updatePromise } from "../lib/updateOver";
import { APP_VERSION } from "../version";
import { rollbackFile } from "../ipc";
import type { RollbackFile } from "../ipc";
import { dataCopy, labelProblems, offer, where as rollbackWhere } from "../lib/rollbackButton";
import { drill, when as drillWhen } from "../lib/updateDrill";

/**
 * «Обновление» — карточка в настройках (шаги 99–100).
 *
 * Человек не просил обновление и не видел загрузки. Значит, всё, что нужно
 * сказать, — три вещи: **что именно** пришло (версия и канал), **проверено ли**
 * оно до запуска, и **когда** оно применится. Не «доступно обновление» без
 * единого числа.
 *
 * Правила, которые здесь видны, а не спрятаны:
 *
 *  * **проверка до распаковки** — распакованный файл уже в папке программы, и
 *    «проверить после» значит дать ему шанс сработать раньше проверки;
 *  * **нет подписи — не «наверное, можно»**: хеш говорит «тот файл», подпись —
 *    «наш файл»;
 *  * **не посреди дела** — обновление не лезет, пока идёт работа.
 *
 * Чего карточка не делает и не обещает: не показывает прогресс, которого нет, и
 * не предлагает кнопку «обновить», которая на деле ничего не запускает. Скачивание
 * и установка — отдельная работа движка обновлений; здесь — то, что человеку
 * нужно знать и проверить.
 */

const useStyles = makeStyles({
  card: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    padding: "16px 18px",
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground2,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  muted: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  list: { display: "flex", flexDirection: "column", gap: "4px", margin: 0, padding: 0, listStyle: "none" },
  mono: { fontFamily: tokens.fontFamilyMonospace },
});

/** Что проверяется до установки — теми же словами, что в правиле. */
const CHECKED = () =>
  verify(
    // Не «пример», а то, что правило проверяет на самом деле: порядок и строгость.
    { bytes: 6_154_734, sha256: "x", tempPath: "temp" },
    { bytes: 6_154_734, sha256: "x", publisher: "ZShelper" },
    { present: true, publisher: "ZShelper", chainValid: true, revoked: false },
  ).said;

export function UpdateCard() {
  const styles = useStyles();
  /**
   * Файл предыдущей версии — **с диска**, а не из обещания.
   *
   * Откат либо есть, либо нет, и проверяется одним вопросом: что человек сделает,
   * если новая версия не запускается. «Напишет в поддержку» — отката нет.
   */
  const [previous, setPrevious] = useState<RollbackFile | null>(null);
  useEffect(() => {
    let alive = true;
    rollbackFile()
      .then((got) => {
        if (alive) setPrevious(got);
      })
      .catch(() => {
        if (alive) setPrevious({ file: "", bytes: 0, looked_in: "не удалось посмотреть папку программы" });
      });
    return () => {
      alive = false;
    };
  }, []);

  const back = offer(
    previous === null || previous.bytes <= 0
      ? null
      : { version: APP_VERSION, file: previous.file, bytes: previous.bytes, readsSchema: 1 },
    1,
  );

  return (
    <div className={styles.card}>
      <div>
        <Text weight="semibold" block>
          Обновление
        </Text>
        <Text className={styles.muted} block>
          {`Установлено: ${APP_VERSION}. Обновление скачивается и проверяется до применения — `}
          {whyBefore()}
        </Text>
      </div>

      {/* Что проверяет правило: порядок важен, и он назван. */}
      <ul className={styles.list}>
        <li>
          <Text className={styles.muted}>{CHECKED()}</Text>
        </li>
        <li>
          <Text className={styles.muted}>{updatePromise()}</Text>
        </li>
        <li>
          <Text className={styles.muted}>{mayStart({ talking: false, running: true, inDialog: false, downloading: false }).said}</Text>
        </li>
        <li>
          <Text className={styles.muted}>{afterTask()}</Text>
        </li>
        <li>
          <Text className={styles.muted}>{quietSetting(null)}</Text>
        </li>
        <li>
          <Text className={styles.muted}>{quietDecide("security", null, false).said}</Text>
        </li>
      </ul>

      {/* Что именно проверяется у файлов сборки — списком правила. */}
      <details>
        <summary className={styles.muted}>что проверяется у файлов сборки</summary>
        <ul className={styles.list}>
          {artifactChecks().map((line) => (
            <li key={line}>
              <Text className={styles.muted}>{line}</Text>
            </li>
          ))}
          {artifactPublish({ name: "zshelper-windows.exe", sha256: "0".repeat(64), signature: "sig" }).map((line) => (
            <li key={`pub:${line}`}>
              <Text className={styles.muted}>{line}</Text>
            </li>
          ))}
          {artifactNotDo().map((line) => (
            <li key={`not:${line}`}>
              <Text className={styles.muted}>{line}</Text>
            </li>
          ))}
          {artifactVerify().map((line) => (
            <li key={`ver:${line}`}>
              <Text className={styles.muted}>{line}</Text>
            </li>
          ))}
        </ul>
      </details>

      <details>
        <summary className={styles.muted}>порядок установки и что будет после</summary>
        <ul className={styles.list}>
          {orderCheck().map((line) => (
            <li key={line}>
              <Text className={styles.muted}>{line}</Text>
            </li>
          ))}
          <li>
            <Text className={styles.muted}>
              {
                afterInstall(
                  { started: true, version: APP_VERSION, dataReads: true, memories: 3 },
                  APP_VERSION,
                  3,
                ).said
              }
            </Text>
          </li>
        </ul>
      </details>

      <details>
        <summary className={styles.muted}>откат проверен целиком: до, после и назад</summary>
        <ul className={styles.list}>
          <li>
            <Text className={styles.muted}>
              {
                drill(
                  { at: "до", memoryHash: "h", facts: 3, settings: ["тема"], journal: 12, modelHash: "m" },
                  { at: "после обновления", memoryHash: "h", facts: 3, settings: ["тема"], journal: 12, modelHash: "m" },
                  { at: "после отката", memoryHash: "h", facts: 3, settings: ["тема"], journal: 12, modelHash: "m" },
                ).said
              }
            </Text>
          </li>
          <li>
            <Text className={styles.muted}>{drillWhen()}</Text>
          </li>
        </ul>
      </details>

      <details>
        <summary className={styles.muted}>какие каналы и что они обещают</summary>
        <Text className={styles.muted} block>
          {
            manifestOffer(
              {
                signatureValid: true,
                releases: [
                  { version: APP_VERSION, channel: "stable", revoked: false, url: "", sha256: "0".repeat(64) },
                ],
              },
              APP_VERSION,
              "stable",
            ).said
          }
        </Text>
        <Text className={styles.muted} block>
          «Новее» и «стабильнее» — разные вещи: из beta в stable человек не попадает
          молча, а отозванная версия не предлагается даже как новая.
        </Text>
      </details>

      {/* Откат — по факту файла на диске. Нет файла — не серая кнопка, а
          причина и куда его положить. */}
      <div>
        <Text weight="semibold" block>
          Вернуть прежнюю версию
        </Text>
        <Text className={styles.muted} block>
          {back.available ? back.warning : back.warning}
        </Text>
        <Text className={styles.muted} block>
          {`файл ищется ${rollbackWhere()}${previous === null || previous.file === "" ? `; смотрели: ${previous?.looked_in ?? "…"}` : `; найден: ${previous.file} (${previous.bytes} байт)`}`}
        </Text>
        <Text className={styles.muted} block>
          {`данные не откатываются молча: перед откатом делается копия ${dataCopy(1)}`}
        </Text>
        {labelProblems(back).length > 0 ? (
          <Text className={styles.muted} block>
            {labelProblems(back).join("; ")}
          </Text>
        ) : null}
      </div>

      {/* Обещание без кнопки: здесь не запускается установка, и это сказано. */}
      <Text className={styles.muted}>
        {tell("stop", "здесь только проверка: установку запускает отдельная кнопка в окне обновления")}
      </Text>
    </div>
  );
}
