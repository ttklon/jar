/**
 * Первый запуск: экран знакомства показывается **один раз**.
 *
 * Зачем отдельный модуль: «показать один раз» — это правило, а не украшение экрана.
 * Его проверяют тесты, а не глаза; и оно должно переживать то, что хранилище бывает
 * недоступно (приватный режим, отключённое хранилище, чужая сборка).
 *
 * Три решения, которые легко сделать неправильно:
 *
 *  * **хранилище проверяется делом, а не на слово.** Наличие `localStorage` ещё не
 *    значит, что в него можно писать: в некоторых режимах чтение и запись бросают
 *    исключение. Поэтому проба — запись и удаление ключа, а не `if (localStorage)`;
 *  * **сломанное хранилище значит «не показывать», а не «показывать каждый раз».**
 *    Если запомнить ответ негде, экран возвращался бы при каждом запуске и мешал бы
 *    работать. Вход в него остаётся в настройках, и там сказано, что кнопка есть;
 *  * **ошибка записи — не беда.** Экран уже показан; хуже было бы упасть из-за
 *    хранилища. Функция возвращает, удалось ли запомнить, но не бросает.
 */

/** Ключ, под которым лежит «уже видел». Один, чтобы не разъехаться с настройками. */
export const WELCOME_KEY = "zshelper.welcome.seen";

/** Что нужно от хранилища: ровно три операции, остальное не наше дело. */
export type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

/**
 * Хранилище, если оно работает, иначе `null`.
 *
 * Проверка настоящая: кладём пробный ключ и убираем его. Хранилище, которое врёт о
 * своей готовности, нам не нужно — «есть, но не пишет» хуже, чем «нет».
 */
export function availableStorage(): StorageLike | null {
  try {
    const storage = globalThis.localStorage as StorageLike | undefined;
    if (!storage) return null;
    const probe = "zshelper.probe";
    storage.setItem(probe, "1");
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}

/** Видел ли человек знакомство. Негде запомнить — считаем, что видел (см. выше). */
export function welcomeSeen(storage: StorageLike | null = availableStorage()): boolean {
  if (!storage) return true;
  try {
    return storage.getItem(WELCOME_KEY) === "1";
  } catch {
    return true;
  }
}

/** Показывать ли знакомство сейчас. */
export function shouldShowWelcome(storage: StorageLike | null = availableStorage()): boolean {
  return !welcomeSeen(storage);
}

/**
 * Запомнить, что знакомство показано.
 *
 * `true` — запомнили. `false` — не смогли (нет хранилища или оно отказало); экран
 * при этом уже закрыт, и повторно он появится только по кнопке в настройках.
 */
export function markWelcomeSeen(storage: StorageLike | null = availableStorage()): boolean {
  if (!storage) return false;
  try {
    storage.setItem(WELCOME_KEY, "1");
    return true;
  } catch {
    return false;
  }
}

/**
 * Шаг 24: объяснение про микрофон показывается **до** первого нажатия, а не
 * вместе с системным запросом разрешения.
 *
 * Почему отдельно от `welcome`: знакомство бывает и в браузере, и без микрофона,
 * а это объяснение нужно ровно тогда, когда человек впервые собирается говорить.
 * Почему отдельный ключ, а не флаг в памяти экрана: перезапуск не должен
 * повторять объяснение, а новый день — тем более.
 */
export const MIC_EXPLAINED_KEY = "zshelper.mic.explained";

/** Сказали ли уже, что услышит микрофон. */
export function micExplained(storage: StorageLike | null = availableStorage()): boolean {
  if (!storage) return true;
  try {
    return storage.getItem(MIC_EXPLAINED_KEY) === "1";
  } catch {
    return true;
  }
}

/** Отметить, что объяснили. Возвращает, удалось ли запомнить. */
export function markMicExplained(storage: StorageLike | null = availableStorage()): boolean {
  if (!storage) return false;
  try {
    storage.setItem(MIC_EXPLAINED_KEY, "1");
    return true;
  } catch {
    return false;
  }
}
