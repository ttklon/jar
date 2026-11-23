import { describe, expect, it } from "vitest";
import { empty, failures, finish, KEEP, leaves, push, text, worst, type Row } from "./parseLog";

/**
 * Шаг 88: каждая фраза оставляет строку — что услышано, что понято, что сделано
 * или почему отказано.
 *
 * Нельзя улучшать то, о чём нет данных.
 */
const row = (at: number, heard: string, over: Partial<Row> = {}): Row => ({
  at,
  heard,
  understood: null,
  outcome: { kind: "in-progress" },
  ...over,
});

describe("три поля, и каждое обязательно", () => {
  it("видно услышанное, понятое и итог", () => {
    // Одного «понято» мало: не видно, что было на входе.
    const log = push(empty(), row(1, "открой загрузки", {
      understood: "открой загрузки",
      outcome: { kind: "done", did: "files-001" },
    }));
    const said = text(log.rows[0] as Row);
    expect(said).toContain("открой загрузки");
    expect(said).toContain("files-001");
  });

  it("искажение распознавания видно в журнале", () => {
    const log = push(empty(), row(1, "от крой за грузки", { understood: "не понято" }));
    expect(text(log.rows[0] as Row)).toContain("от крой");
  });
});

describe("строка пишется сразу, а не после успеха", () => {
  it("разбор в процессе уже записан", () => {
    // Именно неудачи и нужны.
    const log = push(empty(), row(1, "найди файлы"));
    expect(log.rows).toHaveLength(1);
    expect(text(log.rows[0] as Row)).toContain("разбираю");
  });

  it("итог дописывается в ту же строку", () => {
    const log = finish(push(empty(), row(1, "найди")), 1, "найди файлы", { kind: "done", did: "files-010" });
    expect(text(log.rows[0] as Row)).toContain("сделано");
  });

  it("потерянный итог виден, а не выглядит успехом", () => {
    const log = push(empty(), row(1, "найди"));
    expect(text(log.rows[0] as Row)).toContain("разбираю");
  });
});

describe("отказ — такая же строка, как успех", () => {
  it("отказ считается", () => {
    const log = finish(push(empty(), row(1, "открой холодильник")), 1, "открой", {
      kind: "refused",
      cause: "не умею: нет руки",
    });
    expect(text(log.rows[0] as Row)).toContain("отказ");
    expect(text(log.rows[0] as Row)).toContain("нет руки");
  });

  it("не понято — отдельный вид, а не отказ", () => {
    const log = push(empty(), row(1, "ыыы", { outcome: { kind: "not-understood" } }));
    expect(text(log.rows[0] as Row)).toContain("не понято");
  });
});

describe("доля неудач — с знаменателем", () => {
  it("три из трёх и три из трёхсот — разные вещи", () => {
    let log = empty();
    for (let index = 0; index < 3; index += 1) log = push(log, row(index, `фраза ${index}`, { outcome: { kind: "not-understood" } }));
    expect(failures(log).share).toBe(1);
    for (let index = 0; index < 297; index += 1) {
      log = push(log, row(100 + index, `ок ${index}`, { outcome: { kind: "done", did: "x" } }));
    }
    // Журнал хранит 100 строк: знаменатель — то, что сохранилось, и это честно.
    expect(failures(log).total).toBe(KEEP);
  });

  it("«разбираю…» не считается результатом", () => {
    const log = push(empty(), row(1, "найди"));
    expect(failures(log).total).toBe(0);
  });
});

describe("что чинить в первую очередь", () => {
  it("группировка по причине, а не «не понимает вообще»", () => {
    let log = empty();
    log = push(log, row(1, "а", { outcome: { kind: "not-understood" } }));
    log = push(log, row(2, "б", { outcome: { kind: "not-understood" } }));
    log = push(log, row(3, "в", { understood: "открой", outcome: { kind: "refused", cause: "не хватает прав" } }));
    const top = worst(log);
    expect(top[0]?.reason).toBe("не понято вовсе");
    expect(top[0]?.times).toBe(2);
    expect(top[1]?.reason).toContain("не хватает прав");
  });

  it("отказ несёт понятое рядом с причиной, а не прячет", () => {
    // Иначе «поняли неверно» прячется за «не хватает прав» — разные дефекты.
    const log = push(empty(), row(1, "найди", { understood: "удали", outcome: { kind: "refused", cause: "x" } }));
    expect(worst(log)[0]?.reason).toContain("отказ: x");
    expect(worst(log)[0]?.reason).toContain("понято как «удали»");
  });
});

describe("журнал не растёт без предела и не уходит наружу", () => {
  it("хранится сто строк, вытесненные посчитаны", () => {
    let log = empty();
    for (let index = 0; index < KEEP + 5; index += 1) log = push(log, row(index, `фраза ${index}`));
    expect(log.rows).toHaveLength(KEEP);
    expect(log.dropped).toBe(5);
  });

  it("фразы человека никуда не отправляются", () => {
    expect(leaves(empty())).toBe(false);
  });
});
