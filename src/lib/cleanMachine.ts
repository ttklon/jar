/**
 * Шаг 307: проверка целостности после установки на чистой машине.
 *
 * CI не заменяет чистую машину, и причина не в лени: CI ставит программу в
 * **контейнер**, где уже есть всё, что нужно разработчику. На настоящей новой
 * Windows (или на виртуалке, снятой с установочного образа) вылезает то, чего в
 * контейнере не бывает:
 *
 *  * нет WebView2 — он ставится отдельно, и без него окно не открывается;
 *  * другая разрядность и другая версия Windows;
 *  * нет шрифтов и раскладок, на которых держится русский интерфейс;
 *  * папка `%LOCALAPPDATA%` с другим именем пользователя — кириллица или пробел
 *    в пути ломает пути, собранные «на глазок»;
 *  * политики: антивирус, «запрет запуска из папки загрузок», ограниченный
 *    аккаунт.
 *
 * Проверка — это **список фактов про машину**, которые надо снять до и после
 * установки, а не «прогнали тесты — значит, работает».
 */

/** Что снимаем с машины до установки. */
export interface Baseline {
  /** Версия Windows, как её видит человек: «Windows 10 22H2». */
  readonly windows: string;
  /** Есть ли WebView2. */
  readonly webView2: boolean;
  /** Разрядность. */
  readonly bits: 32 | 64;
  readonly user: string;
  /** Свободно на диске, МБ. */
  readonly freeMb: number;
}

/** Что проверили после установки. */
export interface After {
  readonly launched: boolean;
  readonly windowShown: boolean;
  readonly russianRenders: boolean;
  /** Путь к папке данных — проверяется на кириллицу и пробел. */
  readonly dataPath: string;
  readonly freeMb: number;
}

/** Одно нарушение — с шагом, который человеку делать. */
export interface Issue {
  readonly problem: string;
  readonly step: string;
}

/**
 * Проверить до установки.
 *
 * Без WebView2 установка пройдёт и окно не откроется — самый частый «не
 * запускается» на новых машинах.
 */
export function preflight(base: Baseline, needsMb: number): Issue[] {
  const issues: Issue[] = [];

  if (!base.webView2) {
    issues.push({ problem: "нет WebView2", step: "установить WebView2 с сайта Microsoft (одна кнопка, без перезагрузки)" });
  }
  if (base.freeMb < needsMb) {
    issues.push({
      problem: `свободно ${base.freeMb} МБ, нужно ${needsMb} МБ`,
      step: "освободить место или поставить модели на другой диск при первом запуске",
    });
  }
  if (base.bits === 32) {
    issues.push({ problem: "32-разрядная Windows", step: "нужна 64-разрядная версия: на 32-разрядной помощник не запустится" });
  }
  if (/[а-яё ]/i.test(base.user)) {
    // Это не запрет: путь с кириллицей должен работать, и проверяем именно это.
    issues.push({
      problem: `имя пользователя «${base.user}» с кириллицей или пробелом`,
      step: "ничего делать не надо: это проверка, что пути с кириллицей работают (самая частая поломка «на глазок»)",
    });
  }
  return issues;
}

/**
 * Проверить после установки.
 *
 * Ноль проблем — ответ, а не молчание: иначе «нет проблем» и «не проверяли»
 * выглядят одинаково.
 */
export function postflight(after: After, base: Baseline): Issue[] {
  const issues: Issue[] = [];

  if (!after.launched) issues.push({ problem: "не запустилось", step: "открыть журнал первого запуска, там последняя проверка" });
  if (after.launched && !after.windowShown) {
    issues.push({ problem: "запустилось, но окна нет", step: "проверить WebView2 и видеодрайвер: окно не открывается без них" });
  }
  if (after.launched && !after.russianRenders) {
    issues.push({ problem: "русский текст не отображается", step: "не хватает шрифта; назвать, какого, а не «поставьте шрифты»" });
  }
  if (/[а-яё ]/i.test(base.user) && !/[а-яё ]/i.test(after.dataPath)) {
    issues.push({ problem: "папка данных легла не в профиль человека", step: "проверить подстановку пути: кириллица в имени пользователя сломала её" });
  }
  return issues;
}

/**
 * Манифест целостности: что должно быть на диске после установки.
 *
 * Не «файлы на месте», а с хешами: иначе подменённый файл проходит проверку.
 */
export function manifest(files: readonly { path: string; sha256: string }[]): { text: string; count: number } {
  const lines = files.map((file) => `${file.sha256}  ${file.path}`).sort();
  return { text: lines.join("\n"), count: lines.length };
}

/**
 * Отчёт для «не запускается» (шаг 308 рядом) — три факта, которые нужны
 * разработчику, и ни одного лишнего.
 */
export function report(base: Baseline, after: After): string {
  return [
    `Windows: ${base.windows}, ${base.bits} бит, WebView2: ${base.webView2 ? "есть" : "нет"}`,
    `пользователь: ${base.user}; свободно ${base.freeMb} МБ`,
    `запуск: ${after.launched ? "да" : "нет"}, окно: ${after.windowShown ? "да" : "нет"}, текст: ${after.russianRenders ? "виден" : "не виден"}`,
  ].join("\n");
}
