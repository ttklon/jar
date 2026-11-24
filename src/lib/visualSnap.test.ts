import { describe, expect, it } from "vitest";
import { accepted, diff, empty, report, type Element, type Snapshot } from "./visualSnap";

/**
 * Шаг 246: снимок «до/после» для каждой крупной правки интерфейса.
 *
 * Дефект: визуальной регрессии не проверял никто. Playwright в CI не гоняется
 * (браузера нет), а `toHaveScreenshot`, который не с кем сравнить, — это файл в
 * репозитории, а не проверка. Пиксельное сравнение к тому же ловит любую правку
 * шрифта и молчит о настоящем: «сдвинулось на 1 px» и «кнопка пропала» для него
 * одно и то же.
 *
 * Здесь снимок — **описание**: имя экрана и элементы с ролями, подписями,
 * доступностью и целями касания. Сравнение отвечает на вопрос, который задают на
 * самом деле: что изменилось и было ли это нарочно.
 */

const element = (over: Partial<Element> = {}): Element => ({
  key: "cancel",
  label: "Отменить",
  role: "button",
  focusable: true,
  target: 32,
  ...over,
});

const screen = (elements: Element[], over: Partial<Snapshot> = {}): Snapshot => ({
  screen: "Журнал",
  why: "правка карточки дела",
  elements,
  ...over,
});

const base = [
  element({ key: "cancel", label: "Отменить" }),
  element({ key: "repeat", label: "Повторить" }),
  element({ key: "open", label: "Открыть папку" }),
];

describe("снимок — данные, а не картинка (шаг 246)", () => {
  it("совпадение снимков видно без пикселей", () => {
    const before = screen(base);
    const after = screen(base.map((item) => ({ ...item })));
    expect(empty(diff(before, after))).toBe(true);
    expect(report(before, after)).toContain("без изменений");
    expect(report(before, after)).toContain("3 элементов");
  });

  it("снимок читается в отчёте: имя экрана и число элементов", () => {
    const text = report(screen(base), screen(base));
    expect(text).toContain("Журнал");
  });
});

describe("пропажа называется первой — это регрессия", () => {
  it("исчезнувшая кнопка названа с подписью и ролью", () => {
    const after = screen(base.filter((item) => item.key !== "cancel"));
    const got = diff(screen(base), after);
    expect(got.gone).toEqual(["«Отменить» (button) пропал"]);
    // И в отчёте пропажа идёт до появившегося: новая кнопка обычно нарочно.
    // Сравнивать надо с **существующей** частью: `indexOf("изменилось")` на
    // строке без изменений даёт -1, и «меньше» выполнялось бы наоборот.
    const withBoth = report(
      screen(base),
      screen([...base.filter((item) => item.key !== "cancel"), element({ key: "share", label: "Поделиться" })]),
    );
    expect(withBoth.indexOf("пропало")).toBeGreaterThan(-1);
    expect(withBoth.indexOf("появилось")).toBeGreaterThan(-1);
    expect(withBoth.indexOf("пропало")).toBeLessThan(withBoth.indexOf("появилось"));
  });

  it("пропажа не может быть «принята как правка» без явного списка", () => {
    const after = screen(base.filter((item) => item.key !== "repeat"));
    const got = diff(screen(base), after);
    const verdict = accepted(got, "переделали карточку");
    expect(verdict.ok).toBe(false);
    expect(verdict.said).toContain("не может убирать элементы");
  });
});

describe("переименование — одна правка, а не «пропал и появился»", () => {
  it("смена подписи при том же ключе — изменение, а не два события", () => {
    // Иначе каждая правка текста давала бы два события вместо одного, и
    // настоящая пропажа тонула бы в шуме.
    const after = screen(base.map((item) => (item.key === "repeat" ? { ...item, label: "Повторить ещё раз" } : item)));
    const got = diff(screen(base), after);
    expect(got.gone).toEqual([]);
    expect(got.added).toEqual([]);
    expect(got.changed).toEqual(["подпись «Повторить» стала «Повторить ещё раз»"]);
  });

  it("новый элемент назван отдельно", () => {
    const after = screen([...base, element({ key: "share", label: "Поделиться" })]);
    const got = diff(screen(base), after);
    expect(got.added).toEqual(["«Поделиться» (button) появился"]);
    expect(got.gone).toEqual([]);
  });
});

describe("невидимая регрессия видна: клавиатура и цель касания", () => {
  it("кнопка перестала нажиматься с клавиатуры — это названо", () => {
    // Пиксельный снимок этого не покажет: кнопка на месте и выглядит так же.
    const after = screen(base.map((item) => (item.key === "cancel" ? { ...item, focusable: false } : item)));
    const got = diff(screen(base), after);
    expect(got.changed).toContain("элемент «Отменить» перестал быть доступен с клавиатуры");
  });

  it("цель касания уменьшилась — названо обоими числами", () => {
    const after = screen(base.map((item) => (item.key === "repeat" ? { ...item, target: 24 } : item)));
    const got = diff(screen(base), after);
    expect(got.changed).toContain("цель касания «Повторить»: 32 → 24 px");
  });

  it("роль сменилась — названо: диктор читает другое", () => {
    const after = screen(base.map((item) => (item.key === "open" ? { ...item, role: "link" } : item)));
    const got = diff(screen(base), after);
    expect(got.changed).toContain("элемент «Открыть папку»: роль button → link");
  });
});

describe("порядок — часть интерфейса, а не оформление", () => {
  it("перестановка замечена", () => {
    const swapped = [base[1]!, base[0]!, base[2]!];
    const got = diff(screen(base), screen(swapped));
    expect(got.moved.length).toBeGreaterThan(0);
    expect(got.moved.join(" ")).toContain("переехал");
  });

  it("совпадение порядка не даёт ложного «переехал»", () => {
    expect(diff(screen(base), screen(base)).moved).toEqual([]);
  });
});

describe("снимок не перезаписывается молча", () => {
  it("разница без причины — отказ", () => {
    const after = screen(base.map((item) => (item.key === "repeat" ? { ...item, label: "Повтор" } : item)));
    const verdict = accepted(diff(screen(base), after), "  ");
    expect(verdict.ok).toBe(false);
    expect(verdict.said).toContain("не перезаписывается молча");
  });

  it("правка с причиной принимается — и причина видна в ответе", () => {
    const after = screen(base.map((item) => (item.key === "repeat" ? { ...item, label: "Повтор" } : item)));
    const verdict = accepted(diff(screen(base), after), "сократили подпись, чтобы влезала при 200%");
    expect(verdict.ok).toBe(true);
    expect(verdict.said).toContain("сократили подпись");
  });

  it("правки нет — причина не требуется", () => {
    expect(accepted(diff(screen(base), screen(base)), "").ok).toBe(true);
  });
});
