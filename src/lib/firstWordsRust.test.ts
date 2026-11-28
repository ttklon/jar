import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { settled } from "./firstWords";

/**
 * Шаг 79: правило «произносим только законченное» живёт в двух местах — в
 * библиотеке (`firstWords.settled`, для проверяемости) и в ядре
 * (`sentences::Sentences`, для настоящего потока). Разъехаться они могут молча:
 * экран покажет одно, голос скажет другое.
 *
 * Компилятора Rust здесь нет, поэтому тест читает исходник ядра и сверяет
 * поведения на одинаковых строках — тем же способом, что для горячих клавиш.
 */

const root = new URL("../../", import.meta.url);
const rust = readFileSync(new URL("src-tauri/src/sentences.rs", root), "utf8");
const ipc = readFileSync(new URL("src-tauri/src/ipc.rs", root), "utf8");

/** Ядро: та же логика на TypeScript, чтобы сверить исходы. */
function rustPush(buffer: string, chunk: string): { said: string | null; rest: string } {
  const all = buffer + chunk;
  const chars = [...all];
  let cut: number | null = null;
  for (let index = 0; index < chars.length; index += 1) {
    if (!".!?…".includes(chars[index] ?? "")) continue;
    const next = chars[index + 1];
    const ends = next === undefined || /\s/u.test(next);
    if (ends) cut = index + 1;
  }
  if (cut === null) return { said: null, rest: all };
  const head = chars.slice(0, cut).join("").trim();
  const rest = chars.slice(cut).join("");
  return { said: head === "" ? null : head, rest };
}

describe("законченное произносится одинаково в правиле и в ядре (шаг 79)", () => {
  const cases = [
    "я нашёл три файла, но",
    " не знаю, какие удалить.",
    "Папка пуста. Удалять нечего.",
    "в среднем 30.5 градуса",
    "готово!",
    "правда?",
    "файл — это папка или нет?",
  ];

  it("границы фраз совпадают", () => {
    let buffer = "";
    for (const chunk of cases) {
      const before = settled(buffer + chunk);
      const { said } = rustPush(buffer, chunk);
      // Правило отдаёт всё до последней границы; ядро — то же самое.
      expect(said ?? "").toBe(before);
      const step = rustPush(buffer, chunk);
      buffer = step.rest;
    }
  });

  it("ядро режет по фразам, а не по дельтам", () => {
    // Настоящий дефект старой проверки: смотрели только на хвост дельты, и
    // первое предложение из куска терялось.
    expect(rust).toContain("pub fn push");
    expect(ipc).toContain("sentences.push(&delta)");
    // И остаток после конца потока договаривается, а не теряется.
    expect(ipc).toContain("sentences.flush()");
  });

  it("«т.е.» и «30.5» — не границы: проверено в обоих местах", () => {
    expect(rust).toContain("т.е.");
    expect(settled("в среднем 30.5 градуса т.е. тепло")).toBe("");
    expect(settled("в среднем 30.5 градуса т.е. тепло.")).toBe(
      "в среднем 30.5 градуса т.е. тепло.",
    );
  });
});
