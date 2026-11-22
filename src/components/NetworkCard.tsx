import { useEffect, useState } from "react";
import { Button, makeStyles, Text, tokens } from "@fluentui/react-components";
import { networkAddresses, probeNetwork } from "../ipc";
import type { AddressProbe, NetworkAddress } from "../ipc/types";
import { models } from "../i18n/ru";

/**
 * «Куда приложение ходит в сети» — весь список, а не обещание.
 *
 * Зачем это на экране, а не в документации. «Бесплатно и локально» — обещание,
 * которое проверяется только списком: если человек не видит адресов, он верит на
 * слово. Здесь видно каждый: что качается, сколько весит и нужно ли это для
 * разговора. Четыре строки — это весь сетевой след приложения.
 *
 * Четыре правила:
 *
 *  * **список приходит из ядра**, а не написан в интерфейсе: два списка однажды
 *    разойдутся, и верным окажется тот, который показывают;
 *  * **обязательное отделено от необязательного.** Голос — не обязателен для
 *    первого разговора, и человек должен видеть это до скачивания, а не после;
 *  * **вес назван числом.** «Небольшая модель» ничего не значит, 940 МБ значит;
 *  * **ошибка не прячет список.** Если ядро не ответило, честнее сказать «список
 *    не получен», чем показать пустоту: пустота читается как «никуда не ходит».
 */

const useStyles = makeStyles({
  card: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    padding: "14px 16px",
    borderRadius: tokens.borderRadiusLarge,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2,
    maxWidth: "96ch",
  },
  lead: { color: tokens.colorNeutralForeground3 },
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "10px" },
  row: { display: "flex", flexDirection: "column", gap: "2px" },
  head: { display: "flex", gap: "8px", alignItems: "baseline", flexWrap: "wrap" },
  optional: { color: tokens.colorNeutralForeground3 },
  url: {
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    // Адрес длинный и без пробелов: без переноса он растягивает экран вбок.
    overflowWrap: "anywhere",
  },
  needed: { color: tokens.colorBrandForeground1 },
  price: {
    fontSize: tokens.fontSizeBase500,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorBrandForeground1,
  },
  probe: { display: "flex", flexDirection: "column", gap: "6px", alignItems: "flex-start" },
  probeList: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "4px" },
});

/** Вес в человеческих единицах: 986048768 → «940 МБ». */
export function weight(bytes: number): string {
  if (bytes <= 0) return models.networkUnknownSize;
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return models.networkSmall;
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} ГБ`;
  return `${Math.round(mb)} МБ`;
}

export function NetworkCard() {
  const styles = useStyles();
  const [addresses, setAddresses] = useState<NetworkAddress[] | null>(null);
  const [failed, setFailed] = useState(false);
  // Проверка: «не делали», «идёт», «вот что ответили», «не вышло».
  const [probes, setProbes] = useState<AddressProbe[] | null>(null);
  const [probing, setProbing] = useState(false);
  const [probeError, setProbeError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void networkAddresses()
      .then((list) => {
        if (alive) setAddresses(list);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const check = async () => {
    setProbing(true);
    setProbeError(null);
    try {
      const list = await probeNetwork();
      setProbes(list);
    } catch (error) {
      setProbeError(String(error));
    } finally {
      setProbing(false);
    }
  };

  // Пустой список — это не «все живы»: так выглядит браузерная сборка, где
  // ядра нет. Успехом считается только ответ по каждому адресу.
  const answered = probes?.filter((probe) => probe.problem === null).length ?? 0;

  return (
    <section className={styles.card} aria-label={models.networkTitle}>
      <Text weight="semibold">{models.networkTitle}</Text>
      {/*
        Цена — числом, а не словом «бесплатно». «Бесплатно» ничего не стоит на
        фоне «бесплатно на 7 дней»; 0 ₽ — конкретно. И рядом причина, иначе это
        лозунг: платить некому, потому что нет сервиса.
      */}
      <Text className={styles.price}>{models.networkPrice}</Text>
      <Text className={styles.lead}>{models.networkWhyFree}</Text>
      <Text className={styles.lead}>{models.networkLead}</Text>

      {failed ? (
        <Text role="alert" aria-live="polite">
          {models.networkFailed}
        </Text>
      ) : addresses === null ? (
        <Text className={styles.optional} role="status" aria-live="polite">
          {models.networkLoading}
        </Text>
      ) : (
        <ul className={styles.list}>
          {addresses.map((address) => (
            <li key={address.url} className={styles.row}>
              <div className={styles.head}>
                <Text weight="semibold">{address.purpose}</Text>
                <Text className={address.needed ? styles.needed : styles.optional}>
                  {address.needed ? models.networkNeeded : models.networkOptional}
                </Text>
                <Text className={styles.optional}>{weight(address.bytes)}</Text>
              </div>
              <Text className={styles.url}>{address.url}</Text>
              <Text className={styles.optional}>{address.reason}</Text>
            </li>
          ))}
        </ul>
      )}

      {/*
        Проверка кнопкой, а не при открытии экрана: каждый адрес — настоящий
        запрос. При открытии это было бы «тихое скачивание» в миниатюре, а по
        кнопке — проверка, о которой человек знает.
      */}
      <div className={styles.probe}>
        <Button appearance="secondary" onClick={check} disabled={probing}>
          {probing ? models.probeBusy : models.probeAsk}
        </Button>
        {probeError ? (
          <Text role="alert" aria-live="polite">
            {models.probeFailed(probeError)}
          </Text>
        ) : probes === null ? null : (
          <>
            <Text role="status" aria-live="polite">
              {models.probeDone(answered, probes.length)}
            </Text>
            <ul className={styles.probeList}>
              {probes.map((probe) => {
                const address = addresses?.find((item) => item.url === probe.url);
                return probe.problem === null ? (
                  <li key={probe.url}>
                    <Text className={styles.optional}>
                      {address ? `${address.purpose}: ответил` : `${probe.url}: ответил`}
                      {` · ${weight(probe.bytes ?? 0)}`}
                    </Text>
                  </li>
                ) : (
                  <li key={probe.url}>
                    <Text className={styles.optional}>
                      {models.probeProblemFor(address?.purpose ?? probe.url, probe.problem)}
                    </Text>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
