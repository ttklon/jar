import { describe, expect, it } from "vitest";
import { judge, learn, missing, say, withoutGaps, type Planned } from "./refuseAll";

/**
 * Шаг 115: план, который нельзя собрать из рук, честно отказывает целиком.
 *
 * Половина плана — это изменённый мир без цели, ради которой его меняли.
 */
function step(patch: Partial<Planned> & { what: string }): Planned {
  return { tool: "files|шаг|дело", hand: true, allowed: true, ...patch };
}

const create = step({ what: "создать папку", tool: "files|создать|папку" });
const move = step({ what: "переместить отчёт", tool: "files|переместить|файлы/папки", hand: false });
const remove = step({ what: "удалить исходник", tool: "files|удалить|файл" });

describe("нельзя собрать — не выполняем ничего", () => {
  it("отсутствие руки отменяет весь план, а не один шаг", () => {
    // Иначе создастся папка и удалится исходник — файл потерян.
    const got = judge([create, move, remove]);
    expect(got.run).toBe(false);
    expect(say(got)).toContain("не выполню ничего");
  });

  it("названо, чего именно не хватает", () => {
    expect(say(judge([create, move]))).toContain("нет руки files|переместить|файлы/папки");
  });

  it("все дыры названы, а не первая", () => {
    // Чинить одну и наткнуться на следующую — обидно.
    const got = missing([move, step({ what: "отправить", tool: "net|отправить|письмо", hand: false })]);
    expect(got).toHaveLength(2);
  });

  it("полный план выполняется", () => {
    expect(judge([create, remove]).run).toBe(true);
  });

  it("пустой план — «не успех», а не согласие", () => {
    const got = judge([]);
    expect(got.run).toBe(false);
    expect(say(got)).toContain("не успех");
  });
});

describe("«не умею» и «нельзя» — разные ответы", () => {
  it("запрет политикой отделён от неумения", () => {
    const forbidden = step({ what: "стереть диск", tool: "files|форматировать|диск", allowed: false });
    expect(say(judge([forbidden]))).toContain("не научусь");
    expect(say(judge([move]))).toContain("нет руки");
  });

  it("в обучение уходит только «не умею», а не «нельзя»", () => {
    // Иначе очередь обучения наполняется тем, что делать запрещено.
    const forbidden = step({ what: "стереть диск", tool: "files|форматировать|диск", allowed: false });
    expect(learn([move, forbidden])).toEqual(["переместить отчёт"]);
  });
});

describe("отказ предлагает ближайшее, а не оставляет в тупике", () => {
  it("одна дыра — предложено сделать только это", () => {
    expect(judge([move]).instead).toContain("можно сделать только это");
  });

  it("несколько дыр — предложено доучить", () => {
    const other = step({ what: "отправить письмо", tool: "net|отправить|письмо", hand: false });
    expect(judge([move, other]).instead).toContain("доучить");
  });

  it("запрет — предложено собрать план без запрещённого", () => {
    const forbidden = step({ what: "стереть диск", tool: "files|форматировать|диск", allowed: false });
    expect(judge([forbidden]).instead).toContain("без них");
  });
});

describe("план без дыр не предлагается, если это меняет смысл", () => {
  it("шаг, зависящий от убранного, — план не предлагается", () => {
    // «Переместить» без «создать папку» — другое действие, а не меньшее.
    // Оставшийся шаг (переместить, индекс 1) зависит от убранного (индекс 0).
    const plan = [move, step({ what: "переместить в него отчёт", tool: "files|переместить|файлы/папки" })];
    void create;
    expect(withoutGaps(plan, [[], [0]])).toBeNull();
  });

  it("независимые шаги — можно предложить без дыры", () => {
    const other = step({ what: "посчитать место", tool: "files|проверить|размеры и место" });
    expect(withoutGaps([other, move], [[], []])?.map((item) => item.what)).toEqual(["посчитать место"]);
  });

  it("дыр нет — план как есть", () => {
    expect(withoutGaps([create, remove], [[], []])).toHaveLength(2);
  });
});
