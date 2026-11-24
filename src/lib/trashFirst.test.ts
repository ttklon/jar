import { describe, expect, it } from "vitest";
import { journalNote, restoreCount, returnable, say, where } from "./trashFirst";

/**
 * Шаг 163: корзина вместо удаления по умолчанию.
 *
 * Ошибка должна быть поправима: «удали» без уточнения — это «убери с глаз, но
 * оставь путь назад».
 */

describe("по умолчанию — корзина", () => {
  it("«удали папку» уходит в корзину и говорит, что это умолчание", () => {
    const got = where("удали папку Фото");
    expect(got.where).toBe("trash");
    expect(got.explicit).toBe(false);
    expect(got.why).toContain("ошибка должна быть поправима");
  });

  it("«в корзину» — явная просьба, и это сказано", () => {
    const got = where("убери это в корзину");
    expect(got.where).toBe("trash");
    expect(got.explicit).toBe(true);
    expect(got.why).toContain("вернуть можно");
  });
});

describe("мимо корзины — только словом", () => {
  it("«навсегда» — это просьба человека, а не наше умолчание", () => {
    const got = where("удали навсегда");
    expect(got.where).toBe("gone");
    expect(got.explicit).toBe(true);
    expect(got.why).toContain("вернуть будет нельзя");
  });

  it("«не в корзину» и «мимо корзины» — просьба мимо", () => {
    expect(where("удали не в корзину").where).toBe("gone");
    expect(where("сотри мимо корзины").where).toBe("gone");
  });

  it("«безвозвратно» тоже мимо", () => {
    expect(where("удалить безвозвратно файл").where).toBe("gone");
  });
});

describe("«не удаляй» — не то же, что «не в корзину»", () => {
  it("«не удаляй» — просьба не трогать: мимо корзины не начинается", () => {
    const got = where("не удаляй эту папку");
    expect(got.where).toBe("trash");
    expect(got.why).toContain("сказано не трогать");
  });

  it("«не удаляй» сильнее любых слов про корзину", () => {
    expect(where("не удаляй, не в корзину").why).toContain("не трогать");
  });

  it("«оставь» тоже просьба не трогать", () => {
    expect(where("оставь как есть").why).toContain("не трогать");
  });
});

describe("журнал — путь назад, и он называется до нажатия", () => {
  it("записано — возврат обещан, и сказано откуда", () => {
    expect(journalNote(true, "trash")).toContain("из корзины или из журнала");
    expect(journalNote(true, "gone")).toContain("только из журнала");
  });

  it("не записалось, а мимо корзины — это «не вернуть», и это видно", () => {
    expect(journalNote(false, "gone")).toContain("значит «не вернуть»");
  });

  it("не записалось, но корзина — возврат остаётся, честно", () => {
    expect(journalNote(false, "trash")).toContain("только через корзину");
  });
});

describe("обещание возврата не выдаётся без основания", () => {
  it("без журнала и без корзины возврат не обещан", () => {
    const got = returnable("gone", false);
    expect(got.can).toBe(false);
    expect(got.said).toContain("ни корзины, ни записи");
  });

  it("корзина без журнала — возврат есть", () => {
    expect(returnable("trash", false).can).toBe(true);
  });
});

describe("сколько вернётся из журнала", () => {
  const exists = (path: string) => path.includes("жив");

  it("число, а не «вернуть можно»", () => {
    const got = restoreCount(
      [
        { from: "C:\\жив\\a.txt", kind: "removal" },
        { from: "C:\\жив\\b.txt", kind: "removal" },
        { from: "C:\\нет\\c.txt", kind: "removal" },
      ],
      exists,
    );
    expect(got.can).toBe(2);
    expect(got.total).toBe(3);
    expect(got.said).toContain("вернётся 2 из 3");
  });

  it("всё на месте — так и сказано", () => {
    expect(restoreCount([{ from: "C:\\жив\\a", kind: "removal" }], exists).said).toContain("всё на месте");
  });

  it("пусто — сказать прямо, а не показать кнопку в пустоте", () => {
    expect(restoreCount([], exists).said).toBe("в журнале пусто: возвращать нечего");
  });
});

describe("одна строка для экрана", () => {
  it("куда уйдёт и что с возвратом", () => {
    expect(say(where("удали"), true)).toBe("удаление в корзину · вернуть можно: запись в журнале есть");
  });
});
