/**
 * Человеческая формулировка доказательства.
 *
 * Ядро возвращает структуру (`Evidence`), а не строку — так проверку нельзя
 * «подкрутить» текстом. Перевод в слова живёт здесь, чтобы экран «Руки» и экран
 * «Сценарии» говорили об одном и том же одинаково.
 */

import type { Evidence } from "../ipc/types";

export function evidenceText(evidence: Evidence): string {
  switch (evidence.kind) {
    case "exit_code":
      return `код возврата ${evidence.code}`;
    case "path_exists":
      return evidence.exists
        ? `путь существует: ${evidence.path}`
        : `путь отсутствует: ${evidence.path}`;
    case "stdout_marker":
      return evidence.found
        ? `в выводе найден признак «${evidence.marker}»`
        : `признак «${evidence.marker}» не найден`;
    case "file_text":
      return evidence.matches
        ? `в файле ровно то, что записали: ${evidence.path}`
        : `в файле оказалось не то, что записали: ${evidence.path}`;
    case "file_read":
      return `прочитано ${evidence.bytes} байт из файла: ${evidence.path}`;
    case "compared":
      return (
        `совпало: ${evidence.same}, отличается: ${evidence.different}` +
        `, только в первой: ${evidence.only_left}, только во второй: ${evidence.only_right}`
      );
    case "search":
      return `строк с совпадением: ${evidence.hits} в файлах: ${evidence.files}`;
    case "renamed":
      return `переименовано файлов: ${evidence.count} — ${evidence.folder}`;
    case "ui_changed":
      return evidence.changed
        ? `изменение подтверждено: ${evidence.what}`
        : `изменения не видно: ${evidence.what}`;
    case "failed":
      return evidence.reason;
  }
}
