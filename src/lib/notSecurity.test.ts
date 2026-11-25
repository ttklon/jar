import { describe, expect, it } from "vitest";
import {
  ENOUGH,
  NEVER_FACTS,
  afterImport,
  decides,
  hint,
  mayOffer,
  mayStore,
  refuse,
  type Refusal,
} from "./notSecurity";
import { EMPTY, give, revoke, type Book } from "./grants";

/**
 * Шаг 277: память не влияет на безопасность — запреты не «запоминаются» как
 * разрешения.
 *
 * Память учится на повторениях, и рядом с безопасностью это опасно, потому что
 * вопросы похожи: «часто даёт доступ» — наблюдение, «согласен на доступ» —
 * решение. Первое не выводится из второго никогда.
 */

const NOW = 1_800_000_000_000;
const folder = { kind: "folder", value: "D:\\Отчёты", times: 5 };

const open: Book = give(give(give(EMPTY, "files", NOW), "mic", NOW), "net", NOW);
const closed: Book = revoke(open, "files", NOW);

const refusal = (over: Partial<Refusal> = {}): Refusal => ({
  channel: "files",
  subject: "D:\\Личное",
  at: NOW,
  times: 1,
  ...over,
});

describe("память не выдаёт разрешений — никогда", () => {
  it("даже на факте, повторённом сто раз", () => {
    // Это и есть шаг: повтор согласия не становится постоянным согласием.
    const got = decides({ kind: "folder", value: "D:\\Отчёты" });
    expect(got.allowed).toBe(false);
    expect(got.why).toContain("здесь и сейчас");
  });

  it("подсказка не снимает вопрос, а меняет его текст", () => {
    const got = hint(folder, open);
    expect(got.kind).toBe("ask");
    if (got.kind === "ask") {
      expect(got.because).toContain("разрешение даётся заново");
    }
  });

  it("закрытый канал — память молчит, а не предлагает", () => {
    // Предлагать то, чего нельзя, значит обещать действие, которое не начнётся.
    const got = hint(folder, closed);
    expect(got.kind).toBe("silent");
    if (got.kind === "silent") expect(got.because).toContain("сначала спросим об этом");
  });

  it("одного случая мало для подсказки", () => {
    expect(hint({ ...folder, times: 1 }, open).kind).toBe("none");
  });

  it("вид без канала не подсказывает ничего", () => {
    expect(hint({ kind: "volume", value: "30", times: 9 }, open).kind).toBe("none");
  });
});

describe("отказ — отдельная запись, а не «предпочтение с минусом»", () => {
  it("отказ повторяется и считается", () => {
    let list = refuse([], "files", "D:\\Личное", NOW);
    list = refuse(list, "files", "D:\\Личное", NOW + 1000);
    expect(list.length).toBe(1);
    expect(list[0]!.times).toBe(2);
  });

  it("отказ не закрывает канал целиком", () => {
    // Смешать их значит закрыть человеку канал за один отказ.
    const list = refuse([], "files", "D:\\Личное", NOW);
    expect(list[0]!.channel).toBe("files");
    expect(open.files.revokedAt).toBeNull();
  });

  it("отказ не отменяет согласие канала", () => {
    // И наоборот тоже неверно: согласие канала не отменяет отказ от предмета.
    expect(mayOffer([refusal({ times: 3 })], "files", "D:\\Личное").ok).toBe(false);
  });

  it("один отказ — ещё спросим, три — перестанем", () => {
    expect(ENOUGH).toBe(3);
    expect(mayOffer([refusal()], "files", "D:\\Личное").ok).toBe(true);
    expect(mayOffer([refusal()], "files", "D:\\Личное").said).toContain("не буду настаивать");
    expect(mayOffer([refusal({ times: 3 })], "files", "D:\\Личное").ok).toBe(false);
  });

  it("после трёх отказов сказано, как передумать", () => {
    expect(mayOffer([refusal({ times: 3 })], "files", "D:\\Личное").said).toContain("скажите «можно»");
  });

  it("отказ по одной папке не запрещает другую", () => {
    expect(mayOffer([refusal({ times: 3 })], "files", "D:\\Фото").ok).toBe(true);
  });
});

describe("запрет не превращается в факт памяти", () => {
  it("виды про доступ не записываются вовсе", () => {
    // Иначе приложение само себе выдаёт разрешение на основании запрета.
    for (const word of ["grant", "permission", "access", "доступ", "разрешение"]) {
      expect(NEVER_FACTS).toContain(word);
      expect(mayStore(word).ok).toBe(false);
    }
  });

  it("«запомни, что я разрешаю» — не повод хранить разрешение", () => {
    const got = mayStore("доступ-к-папкам");
    expect(got.ok).toBe(false);
    expect(got.said).toContain("отозвать их можно только там");
  });

  it("обычный факт записывается", () => {
    expect(mayStore("folder").ok).toBe(true);
  });
});

describe("перенос памяти не переносит согласия", () => {
  it("согласия остаются только те, что даны здесь", () => {
    // Иначе чужой файл выдавал бы доступ на этом компьютере.
    const got = afterImport(open, { preferences: [{ kind: "folder" }] });
    expect(got.said).toContain("действуют только те 3");
    expect(got.book).toBe(open);
  });

  it("на новом компьютере ничего не разрешено — так и сказано", () => {
    expect(afterImport(EMPTY, {}).said).toContain("пока ничего не разрешено");
  });

  it("записи о доступе в файле называются, а не применяются", () => {
    const got = afterImport(open, { preferences: [{ kind: "grant" }, { kind: "доступ" }] });
    expect(got.book).toBe(open);
    expect(got.said).toContain("2 записей о доступе");
    expect(got.said).toContain("не применены");
  });
});
