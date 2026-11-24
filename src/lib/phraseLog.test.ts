import { describe, expect, it } from "vitest";
import { broken, clock, empty, KEEP, push, stage, text, timed, why, type Line } from "./phraseLog";

/**
 * Шаг 60: журнал фраз — что услышано, что понято, что сделано.
 *
 * Человек помнит смысл («я же просил отчёт!»), но не слова — и не может
 * показать, где цепочка сломалась.
 */
const line = (over: Partial<Line> = {}): Line => ({
  at: new Date(2026, 10, 20, 14, 7).getTime(),
  heard: "открой отчёт",
  understood: "открыть файл «отчёт»",
  did: "открыл отчёт.docx",
  stage: "done",
  ...over,
});

describe("три факта, а не один", () => {
  it("строка называет услышанное, понятое и сделанное", () => {
    // Ломаются они в разных местах, и слитый текст этого не показывает.
    const said = text(line());
    expect(said).toContain("услышал: открой отчёт");
    expect(said).toContain("понял: открыть файл «отчёт»");
    expect(said).toContain("сделал: открыл отчёт.docx");
  });

  it("время по часам, а не «давно»", () => {
    // «Давно» не помогает найти вчерашнее.
    expect(clock(new Date(2026, 10, 20, 9, 5).getTime())).toBe("09:05");
    expect(text(line())).toContain("14:07");
  });

  it("пустые места названы, а не оставлены пустыми", () => {
    // Пустое место в строке читается как сбой отображения.
    const said = text(line({ heard: "  ", understood: null }));
    expect(said).toContain("(ничего)");
    expect(said).toContain("(не понял)");
  });
});

describe("где разошлось", () => {
  it("распознавание подвело — видно отдельно от разбора", () => {
    // Это разные поломки и разные лекарства: словарь против правил.
    expect(stage("", null, null)).toBe("understood-wrong");
    expect(why({ ...line(), stage: "heard-wrong" })).toContain("распознавание");
    expect(why({ ...line(), stage: "understood-wrong" })).toContain("разбор");
  });

  it("понято верно, но не сделано — третий случай", () => {
    // Отказ, ошибка, ожидание подтверждения: человеку важно видеть, что это не
    // «не понял», а «не выполнил».
    expect(stage("удали", "удалить файл", null)).toBe("not-done");
    expect(why({ ...line(), stage: "not-done" })).toContain("не выполнено");
  });

  it("успех не выдаётся за поломку", () => {
    expect(stage("открой отчёт", "открыть файл", "открыл")).toBe("done");
  });

  it("находятся именно плохие строки", () => {
    // Человек не читает сто строк подряд, он ищет, где разошлось.
    const lines = [line(), line({ stage: "heard-wrong" }), line({ stage: "not-done" })];
    expect(broken(lines).length).toBe(2);
  });
});

describe("журнал не растёт без предела", () => {
  it("новые сверху: искать начинают с недавнего", () => {
    const first = push([], line({ heard: "первое" }));
    const second = push(first, line({ heard: "второе" }));
    expect(second[0]?.heard).toBe("второе");
  });

  it("старое вытесняется, а не копится", () => {
    // Журнал без предела нельзя пролистать, и он же становится хранилищем
    // чужих приватных фраз.
    let lines: Line[] = [];
    for (let index = 0; index < KEEP + 10; index += 1) lines = push(lines, line({ heard: `ф${index}` }));
    expect(lines.length).toBe(KEEP);
    expect(lines[0]?.heard).toBe(`ф${KEEP + 9}`);
  });

  it("пустой журнал объясняет себя", () => {
    expect(empty()).toContain("появятся");
  });
});

describe("замер дописывается к строке, а не теряется (шаг 122)", () => {
  it("дописывается по времени, а не по индексу", () => {
    // Индекс съезжает, как только приходит следующая фраза.
    const first = { at: 100, heard: "раз", understood: null, did: "разбираю…", stage: "not-done" as const };
    const second = { at: 200, heard: "два", understood: null, did: "разбираю…", stage: "not-done" as const };
    const after = timed([second, first], 100, 1200);
    expect(after.find((line) => line.at === 100)?.ms).toBe(1200);
    expect(after.find((line) => line.at === 200)?.ms).toBeUndefined();
  });

  it("чужая строка не переписывается", () => {
    const line = { at: 5, heard: "x", understood: null, did: "y", stage: "not-done" as const };
    expect(timed([line], 6, 900)[0]?.ms).toBeUndefined();
  });
});
