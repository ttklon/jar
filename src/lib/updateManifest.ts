/**
 * Шаг 303: подписанный манифест обновлений, каналы stable/beta, отзыв версии.
 *
 * Манифест — это файл, который говорит «есть версия 2.1, вот её хеш и адрес».
 * Он же — самая опасная часть обновления: **если его подменят, человек поставит
 * что угодно**, и подпись установщика не спасёт, потому что подменят и её адрес.
 *
 * Правила:
 *
 *  1. **манифест подписан отдельным ключом**, не тем, которым подписан установщик:
 *     ключ установщика лежит на машине сборки, ключ манифеста — нет;
 *  2. **стабильнее и новее — разные вещи.** Из beta в stable человек не попадает
 *     молча: канал меняется только по его решению;
 *  3. **отзыв версии важнее обновления.** Если версия отозвана, обновляться на
 *     неё нельзя, даже если она «новее»;
 *  4. **версия сравнивается по числам**, а не строками: иначе `2.10` окажется
 *     старше `2.9`.
 */

/** Выпуск в манифесте. */
export interface Release {
  readonly version: string;
  readonly channel: "stable" | "beta";
  readonly url: string;
  readonly sha256: string;
  /** Отозвана: ставить нельзя никому, у кого ещё нет. */
  readonly revoked?: boolean;
  /** Почему отозвана — человек увидит это, а не «ошибка». */
  readonly revokedBecause?: string;
}

/** Манифест. */
export interface Manifest {
  /** Подпись манифеста ключом обновлений. */
  readonly signatureValid: boolean;
  readonly releases: readonly Release[];
}

/** Разобрать версию: «2.10.1» → [2, 10, 1]. */
export function parseVersion(version: string): number[] {
  return version.split(".").map((part) => Number.parseInt(part, 10) || 0);
}

/** Сравнить версии по числам: -1 / 0 / 1. */
export function compare(a: string, b: string): -1 | 0 | 1 {
  const left = parseVersion(a);
  const right = parseVersion(b);
  const len = Math.max(left.length, right.length);
  for (let i = 0; i < len; i += 1) {
    const x = left[i] ?? 0;
    const y = right[i] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

/**
 * Что предлагать.
 *
 * Возвращает не «лучшую версию», а ответ для конкретного человека: его канал,
 * его версия.
 */
export function offer(
  manifest: Manifest,
  current: string,
  channel: "stable" | "beta",
): { version: string | null; said: string } {
  if (!manifest.signatureValid) {
    return { version: null, said: "манифест не подписан нашим ключом — обновление отложено целиком, даже если в нём есть версия" };
  }

  const newer = manifest.releases
    .filter((release) => release.channel === channel)
    .filter((release) => compare(release.version, current) > 0);

  const revoked = newer.filter((release) => release.revoked === true);
  const usable = newer.filter((release) => release.revoked !== true);

  if (revoked.length > 0 && usable.length === 0) {
    const why = revoked[0]?.revokedBecause ?? "без объяснения";
    return { version: null, said: `версия ${revoked[0]?.version} отозвана: ${why} — остаёмся на ${current}` };
  }

  if (usable.length === 0) {
    return { version: null, said: `обновлений нет: ${current} — последняя в канале ${channel}` };
  }

  const latest = usable.reduce((best, release) => (compare(release.version, best.version) > 0 ? release : best));
  return { version: latest.version, said: `есть ${latest.version} в канале ${channel}` };
}

/**
 * Переход между каналами.
 *
 * Из beta в stable — это **понижение** версии или другой номер; делаем только по
 * явной просьбе, и говорим, что произойдёт.
 */
export function switchChannel(
  manifest: Manifest,
  current: string,
  to: "stable" | "beta",
): { ok: boolean; said: string } {
  if (!manifest.signatureValid) return { ok: false, said: "манифест не подписан — канал не меняем" };

  const best = manifest.releases
    .filter((release) => release.channel === to && release.revoked !== true)
    .reduce<Release | null>((acc, release) => (acc === null || compare(release.version, acc.version) > 0 ? release : acc), null);

  if (best === null) return { ok: true, said: `в канале ${to} сейчас нет версий — останетесь на ${current}` };
  if (compare(best.version, current) < 0) {
    return { ok: true, said: `переход на ${to} откатит вас с ${current} на ${best.version}: это понижение версии` };
  }
  if (compare(best.version, current) === 0) {
    return { ok: true, said: `в канале ${to} та же версия ${current}` };
  }
  return { ok: true, said: `в канале ${to} версия ${best.version} — обновление, а не откат` };
}

/** Все текущие отзывы — их надо показывать, а не прятать в лог. */
export function revocations(manifest: Manifest): string[] {
  return manifest.releases
    .filter((release) => release.revoked === true)
    .map((release) => `${release.version}: ${release.revokedBecause ?? "причина не указана"}`);
}
