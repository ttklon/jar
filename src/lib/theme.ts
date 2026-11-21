/**
 * Какая тема должна быть сейчас.
 *
 * Раньше тема была зашита тёмной (`useState(true)`), и системная настройка Windows
 * не значила ничего. Это не мелочь: человек, у которого весь компьютер светлый,
 * получал единственное тёмное окно и считал, что приложение «чужое».
 *
 * Правило держим в одном месте, без React и хранилища, чтобы его проверяли тесты,
 * а не глаза. Три состояния — светлая, тёмная, как в системе; «как в системе» —
 * по умолчанию, потому что это и есть ответ на «подходит для всех устройств».
 */

export type ThemeChoice = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

/** Ключ настройки. Один, чтобы не разъехаться с экраном «Настройки». */
export const THEME_KEY = "zshelper.theme";

/**
 * Тёмная тема была умолчанием до этой правки. Кто уже пользовался приложением,
 * не должен увидеть другое окно только потому, что мы поменяли умолчание:
 * его выбор остаётся тёмным, пока он сам не скажет иначе.
 */
export const DEFAULT_CHOICE: ThemeChoice = "dark";

export function parseChoice(value: string | null | undefined): ThemeChoice | null {
  return value === "light" || value === "dark" || value === "system" ? value : null;
}

export function resolveTheme(choice: ThemeChoice, systemDark: boolean): ResolvedTheme {
  if (choice === "system") return systemDark ? "dark" : "light";
  return choice;
}

/** Системная тема, если браузерный движок умеет о ней рассказать. Иначе — тёмная. */
export function prefersDark(query: (q: string) => boolean): boolean {
  try {
    return query("(prefers-color-scheme: dark)");
  } catch {
    return true;
  }
}
