/**
 * Шаг 415: экспорт профиля — один файл с понятным содержимым.
 *
 * «Один файл» — не самоцель, а обещание человеку: он несёт его на флешке, кладёт в
 * Obsidian, отправляет себе в почту. Поэтому файл должен читаться **человеком** —
 * иначе он не сможет ни понять, что несёт, ни поправить одну строку руками.
 *
 * Понятное содержимое — это:
 *
 *  * **подписи полями по-русски**, а не `{"f1": "..."}`;
 *  * **версия формата** в начале: без неё нельзя понять, как читать файл;
 *  * **ничего лишнего**: ни id устройства, ни времени последнего запуска, ни
 *    путей, которых человек не узнаёт;
 *  * **файл читается и без программы** — блокнотом, глазами.
 *
 * Чем это отличается от `profileTransfer` (шаг 407): там — целый профиль вместе с
 * разрешениями, здесь — **содержимое, которое человек видит и может поправить**.
 * Экспорт — снимок, импорт — по шагу 416.
 */

/** Что выгружаем. */
export interface Out {
  readonly name: string;
  readonly facts: readonly string[];
  /** Разрешения как текст, который человек поймёт: «удаление — Загрузки». */
  readonly grants: readonly string[];
  /** Когда выгружено — ISO без миллисекунд. */
  readonly at: string;
}

/**
 * Собрать файл.
 *
 * Поле `«что это»` — не формальность: файл может попасть к человеку, который
 * забыл, что это, и открыл через месяц.
 */
export function build(out: Out): string {
  const lines: string[] = [];
  lines.push("{");
  lines.push('  "что это": "профиль ZShelper: память и разрешения одного человека",');
  lines.push('  "версия": 1,');
  lines.push(`  "когда": ${JSON.stringify(out.at)},`);
  lines.push(`  "имя": ${JSON.stringify(out.name)},`);
  lines.push('  "факты": [');
  out.facts.forEach((fact, i) => lines.push(`    ${JSON.stringify(fact)}${i === out.facts.length - 1 ? "" : ","}`));
  lines.push("  ],");
  lines.push('  "разрешения": [');
  out.grants.forEach((grant, i) => lines.push(`    ${JSON.stringify(grant)}${i === out.grants.length - 1 ? "" : ","}`));
  lines.push("  ]");
  lines.push("}");
  return lines.join("\n");
}

/**
 * Что в файле, по-русски.
 *
 * Для экрана «вот что будет в файле» — до сохранения, а не после.
 */
export function summary(out: Out): string {
  return [
    `профиль «${out.name}»`,
    `${out.facts.length} ${plural(out.facts.length, "факт", "факта", "фактов")} памяти`,
    `${out.grants.length} ${plural(out.grants.length, "разрешение", "разрешения", "разрешений")}`,
    "файл читается блокнотом: можно поправить одну строку руками",
  ].join("; ");
}

/**
 * Имя файла.
 *
 * По имени и дате, без пробелов и кириллицы, которую не все системы пересылают:
 * файл должен открыться там, куда его отправят.
 */
export function fileName(name: string, at: Date): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-zа-я0-9]+/gi, "-")
    .replace(/[а-я]/gi, (letter) => translit(letter.toLowerCase()))
    .replace(/^-+|-+$/g, "") || "profile";
  const d = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}-${String(at.getDate()).padStart(2, "0")}`;
  return `zshelper-${slug}-${d}.json`;
}

/** Простая транслитерация — чтобы имя файла не зависело от кодировки. */
function translit(letter: string): string {
  const map: Record<string, string> = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y",
    к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f",
    х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  };
  return map[letter] ?? letter;
}

/**
 * Чего в файле не бывает.
 *
 * Список — ответ на «а вдруг там всё равно лишнее».
 */
export function absent(): string[] {
  return ["пароли и ключи: их нет в профиле (шаг 269)", "id устройства: профиль не привязан к машине", "история экранов: журнал дел живёт отдельно"];
}

/** Склонение по числу. */
function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
