import { describe, expect, it } from "vitest";
import { after, at, here, offer, oneClick, type Undoable } from "./undoHere";

/**
 * Шаг 120: связать отчёт с откатом — что можно вернуть прямо здесь.
 *
 * «Сделано: 5 шагов» и ни одного пути вернуть; частичный откат молчал.
 */
const steps: Undoable[] = [
  { position: 1, what: "создать папку", undoable: true },
  { position: 2, what: "переместить 12 файлов", undoable: true },
  { position: 3, what: "перезаписать отчёт", undoable: false, refusal: "файл уже перезаписан" },
];

describe("у каждого шага видно, можно ли его вернуть", () => {
  it("можно — сказано прямо", () => {
    expect(at(steps[0]!)).toBe("можно вернуть");
  });

  it("нельзя — причиной, а не серой кнопкой", () => {
    // Серое не объясняет, почему.
    expect(at(steps[2]!)).toBe("нельзя вернуть: файл уже перезаписан");
  });

  it("причина не названа — так и сказано", () => {
    expect(at({ position: 1, what: "x", undoable: false })).toContain("причина не названа");
  });
});

describe("частичный откат назван, а не скрыт за «отменить всё»", () => {
  it("вернуть 2 из 3 — сказано числом", () => {
    const got = here(steps);
    expect(got.said).toBe("вернуть можно 2 из 3, остальные 1 останутся");
    expect(got.choose).toBe(true);
  });

  it("всё можно — одним нажатием, без выбора", () => {
    const got = here(steps.slice(0, 2));
    expect(got.said).toContain("одним нажатием");
    expect(got.choose).toBe(false);
  });

  it("ничего нельзя — кнопку не предлагаем", () => {
    const got = here([steps[2]!]);
    expect(got.said).toBe("вернуть нельзя ничего — причины у каждого шага");
    expect(offer(got)).toBe(false);
  });

  it("откатывать нечего — так и сказано", () => {
    expect(here([]).said).toContain("откатывать нечего");
  });
});

describe("порядок отката — обратный", () => {
  it("последнее возвращается первым", () => {
    // Иначе откат шага 1 ломает шаг 2, который ещё стоит.
    expect(here(steps).steps.map((step) => step.position)).toEqual([3, 2, 1]);
  });

  it("одним нажатием — только то, что можно вернуть, в обратном порядке", () => {
    expect(oneClick(here(steps)).map((step) => step.position)).toEqual([2, 1]);
  });
});

describe("итог отката — два факта, а не один", () => {
  it("сколько вернули и сколько не смогли", () => {
    expect(after(["a", "b"], ["c: занято"], 3)).toBe("вернул 2 из 3, не смог 1: c: занято");
  });

  it("всё вернули — без «не смог 0»", () => {
    expect(after(["a"], [], 1)).toBe("вернул 1 из 1");
  });

  it("нечего было возвращать — так и сказано", () => {
    expect(after([], [], 0)).toBe("нечего было возвращать");
  });
});
