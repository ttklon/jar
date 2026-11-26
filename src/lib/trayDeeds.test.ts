import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { badgeAll } from "./runningGlobally";
import { badge as waitingBadge } from "./waitingGlobally";

/**
 * Шаг 98: идущее и ждущее дело видно из любой программы — через трей.
 *
 * Проверка без компилятора: `cargo` нет, поэтому состояния трея сверяются
 * чтением `tray.rs`, как это уже сделано для подсказки и меню.
 *
 * Правило `runningGlobally.badgeAll` говорит, что писать в плашке; здесь
 * проверяется, что трей умеет те два состояния, которые нужны делу.
 */

const rust = readFileSync(new URL("../../src-tauri/src/tray.rs", import.meta.url), "utf8");

describe("трей: дело видно снаружи", () => {
  it("у трея есть состояние «дело идёт», и Rust его знает", () => {
    expect(rust).toContain('"deed-running"');
    expect(rust).toContain('"дело идёт"');
  });

  it("ждущее дело настойчивее: у трея есть своё состояние", () => {
    expect(rust).toContain('"deed-waiting"');
    expect(rust).toContain('"дело ждёт вашего ответа"');
    // И это разные строки, а не одно состояние на оба случая.
    expect(rust).not.toContain('"deed-running" => Ok("дело ждёт вашего ответа")');
  });

  it("плашка правила говорит то же, что трей, а не другое", () => {
    // Ждущее важнее идущего: без ответа дело не сдвинется.
    expect(badgeAll([{ what: "чищу диск", done: 1, total: 3, waiting: true, cancellable: true }])).toBe(
      "чищу диск: ждёт вашего ответа",
    );
    expect(waitingBadge([{ what: "удалить 42 файла", ask: "подтверждение", since: 1, canDefer: true }])).toContain(
      "ждёт ответа",
    );
  });

  it("неизвестное состояние по-прежнему отвергается", () => {
    expect(rust).toContain('_ => Err("неизвестное состояние голоса".to_string())');
  });
});
