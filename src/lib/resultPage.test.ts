import { describe, expect, it } from "vitest";
import { check, checks, noStepNumbers, notDo, page, type Doesnt, type Works } from "./resultPage";

/**
 * Шаг 499: одна страница «что теперь работает» и честный список «что нет».
 */

const works = (): Works[] => [
  { can: "почистить загрузки голосом", sees: "файлы уходят в корзину после подтверждения" },
  { can: "найти документы по фразе", sees: "список найденного, а не открытая папка" },
];
const doesnt = (): Doesnt[] => [
  { cant: "отправлять письма", why: "нет доступа к почте и не будет: это чужая переписка, а не ваша папка" },
  { cant: "работать без подтверждения на удаление", why: "удаление необратимо, и молча его делать нельзя" },
];

describe("две половины, и обе обязательны", () => {
  it("полная страница проходит", () => {
    expect(check(works(), doesnt())).toEqual([]);
  });

  it("без «что нет» — реклама", () => {
    expect(check(works(), []).join()).toContain("превращается в рекламу");
  });

  it("без «что работает» — страница ничего не показывает", () => {
    expect(check([], doesnt()).join()).toContain("ничего не показывает");
  });

  it("«не поддерживается» — оправдание, а не причина", () => {
    const got = check(works(), [{ cant: "почта", why: "не поддерживается в этой версии" }]);
    expect(got.join()).toContain("оправдание, а не причина");
  });

  it("«скоро» тоже", () => {
    expect(check(works(), [{ cant: "почта", why: "пока нет, но скоро будет обязательно" }]).join()).toContain("оправдание");
  });
});

describe("что видит человек, а не что в коде", () => {
  it("описание реализации — замечание", () => {
    expect(check([{ can: "чистка", sees: "вызов clean()" }], doesnt()).join()).toContain("описание реализации");
  });

  it("«что нет» — такой же раздел, а не сноска", () => {
    const got = page(works(), doesnt());
    expect(got).toContain("Не работает (2) — и почему:");
    expect(got).toContain("**отправлять письма** — нет доступа к почте");
    expect(got).toContain("Работает (2):");
  });

  it("шагов на странице нет", () => {
    expect(page(works(), doesnt())).not.toContain("шагов");
  });
});

describe("что страница не делает", () => {
  it("не считает шаги достижением человека", () => {
    expect(noStepNumbers()).toContain("что он может сделать");
    expect(notDo()[0]).toContain("мелкий шрифт");
    expect(checks()).toHaveLength(3);
  });
});
