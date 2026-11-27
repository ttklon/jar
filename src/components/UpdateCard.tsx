import { makeStyles, Text, tokens } from "@fluentui/react-components";
import { tell, verify, whyBefore } from "../lib/updateVerify";
import { check as artifactCheck, publish as artifactPublish, verify as artifactVerify } from "../lib/signedArtifacts";
import { offer } from "../lib/updateManifest";
import { decide as quietDecide, setting as quietSetting } from "../lib/quietUpdate";
import { afterTask, mayStart } from "../lib/notMidTask";
import { afterInstall, orderCheck, promise as updatePromise } from "../lib/updateOver";
import { APP_VERSION } from "../version";

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
          {artifactCheck({
            name: "zshelper-windows.exe",
            sha256: "0".repeat(64),
            // Подпись хеша — не украшение: хеш говорит «тот файл», подпись —
            // «наш файл».
            signature: "sig",
          }).map((line) => (
            <li key={line}>
              <Text className={styles.muted}>{line}</Text>
            </li>
          ))}
          {artifactPublish({ name: "zshelper-windows.exe", sha256: "0".repeat(64), signature: "sig" }).map((line) => (
            <li key={`pub:${line}`}>
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
        <summary className={styles.muted}>какие каналы и что они обещают</summary>
        <Text className={styles.muted} block>
          {
            offer(
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

      {/* Обещание без кнопки: здесь не запускается установка, и это сказано. */}
      <Text className={styles.muted}>
        {tell("stop", "здесь только проверка: установку запускает отдельная кнопка в окне обновления")}
      </Text>
    </div>
  );
}
