import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * D-018 (шаг 87): прогон тестов не смеет трогать настоящий диск человека.
 *
 * Что случилось. `cargo test` шёл зелёным локально и падал в CI примерно в
 * одном прогоне из пяти — на `people::tests::the_first_person_becomes_the_
 * current_one` с «в файле оказалось не то, что записали: список людей не
 * сохранён». Причина оказалась хуже флейка: тесты `add`/`remove`/`switch` зовут
 * `save` по-настоящему, а `people::file()` ведёт в **настоящий**
 * `%LOCALAPPDATA%\ZShelper\people.json`. Отсюда две беды сразу:
 *
 *  1. прогон тестов **затирал список людей** у того, кто его запустил: профили
 *     исчезали «сами», и связать это с тестами было нечем;
 *  2. тесты идут параллельно и писали в один файл — между записью и чтением
 *     обратно другой тест успевал переписать файл, отсюда «не сохранён».
 *
 * `cargo` в этой среде нет, поэтому расхождение держится чтением `.rs` — так же,
 * как `hotkeyRust.test.ts` держит горячие клавиши трея (`trayRust.test.ts`).
 *
 * Правило: у каждого модуля, который пишет файл в `LOCALAPPDATA`, в тестовой
 * сборке путь должен уходить в свою временную папку. Проверяются **все** такие
 * модули сразу, а не один: сегодня это `people`, завтра кто-то добавит
 * `schedule`-тест на запись — и повторит ту же ошибку молча.
 */

const DIR = new URL("../../src-tauri/src/", import.meta.url);

describe("D-018: тесты не трогают настоящий диск человека", () => {
  it("люди: в тестовой сборке путь уходит в свою временную папку", () => {
    const people = readFileSync(join(DIR.pathname, "people.rs"), "utf8");
    expect(people).toContain("fn base_dir()");
    // Обе ветки названы явно: «в тестах своя папка» должно быть видно в коде,
    // а не подразумеваться.
    expect(people).toContain("#[cfg(test)]");
    expect(people).toContain("#[cfg(not(test))]");
    expect(people).toContain("zshelper-people-test-");
    // И своя папка — на поток, а не на процесс: иначе гонка остаётся, только тише.
    expect(people).toContain("std::thread::current().id()");
  });

  it("незавершённое дело: своя папка в тестах, а не настоящая", () => {
    // Тот же дефект, что у людей: `session::save_now` пишет настоящий
    // `unfinished.json`, а тесты зовут `save` — прогон подменял бы
    // незавершённое дело у того, кто его запустил.
    const session = readFileSync(join(DIR.pathname, "session.rs"), "utf8");
    expect(session).toContain("zshelper-session-test-");
    expect(session).toContain("#[cfg(not(test))]");
    expect(session).toContain("std::thread::current().id()");
  });

  it("cfg-блок с путём — последнее выражение функции, без return", () => {
    // clippy: `unneeded return statement` — и он прав. Ошибка была настоящей:
    // с `return` внутри `#[cfg(test)]` блоков компилятор ругался на мёртвый
    // код в ветке `not(test)`, а CI останавливался на clippy, не дойдя до
    // тестов. Правило и Rust держатся вместе.
    for (const name of ["people.rs", "session.rs"]) {
      const text = readFileSync(join(DIR.pathname, name), "utf8");
      const start = text.indexOf("fn base_dir()");
      expect(start).toBeGreaterThan(-1);
      const body = text.slice(start, text.indexOf("\n}", start));
      expect(body).not.toContain("return ");
    }
  });

  it("прогон, который пишет в настоящий список, назван тестом по имени", () => {
    const people = readFileSync(join(DIR.pathname, "people.rs"), "utf8");
    expect(people).toContain("fn tests_do_not_touch_the_real_list_of_people");
    expect(people).toContain("fn ten_people_in_a_row_are_all_kept");
  });
});
