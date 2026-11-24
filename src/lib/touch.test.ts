import { describe, expect, it } from "vitest";
import { hoverOnly, notice, pointerOf, problems, sizes } from "./touch";

/**
 * Шаг 223: планшет и сенсор — крупные цели, никаких действий только по наведению.
 *
 * Проверяется, что размер зависит от указателя, а «спрятано за наведением» —
 * названо дефектом, а не отмечено как неудобство.
 */

// Регрессия D-009: этот файл — тест, названный номером дефекта (шаг 254).
describe("размер зависит от указателя", () => {
  it("палец — 44, а не «как получится»", () => {
    expect(sizes("coarse").control).toBe(44);
    expect(sizes("coarse").row).toBeGreaterThanOrEqual(44);
  });

  it("мышь — 32: крупная цель там разрежает экран, ничего не добавляя", () => {
    expect(sizes("fine").control).toBe(32);
  });

  it("неизвестный указатель считается сенсорным: ошибаться в безопасную сторону", () => {
    // `matchMedia` может отсутствовать, `pointer: fine` может соврать.
    expect(sizes("unknown").control).toBe(44);
  });

  it("на сенсоре между целями больше воздуха: промах не должен нажимать соседнюю", () => {
    expect(sizes("coarse").gap).toBeGreaterThan(sizes("fine").gap);
  });
});

describe("тип указателя читается средой", () => {
  it("coarse — палец", () => {
    expect(pointerOf((q) => ({ matches: q.includes("coarse") }))).toBe("coarse");
  });

  it("fine — мышь", () => {
    expect(pointerOf((q) => ({ matches: q.includes("fine") }))).toBe("fine");
  });

  it("планшет с мышью отдаёт coarse и hover: решаем по coarse", () => {
    // `hover: hover` там тоже true, и по наведению мы бы решили «мышь».
    const media = () => ({ matches: true });
    expect(pointerOf(media)).toBe("coarse");
  });

  it("среда без matchMedia — неизвестно, а не «мышь»", () => {
    expect(pointerOf(undefined)).toBe("unknown");
  });

  it("среда падает на запросе — не повод ставить мелкие цели", () => {
    expect(pointerOf(() => { throw new Error("нет поддержки"); })).toBe("unknown");
  });
});

describe("действие только по наведению — дефект", () => {
  it("спрятано до наведения и нет другого пути — названо", () => {
    const got = hoverOnly({ what: "удалить запись", hiddenUntilHover: true, reachable: false });
    expect(got.ok).toBe(false);
    expect(got.why).toContain("удалить запись");
    expect(got.why).toContain("наведения нет");
  });

  it("спрятано, но есть постоянное действие — терпимо", () => {
    // Подсказка при наведении — ускорение для мыши, не единственный путь.
    expect(hoverOnly({ what: "копировать", hiddenUntilHover: true, reachable: true }).ok).toBe(true);
  });

  it("не спрятано — не дефект, даже если есть hover", () => {
    expect(hoverOnly({ what: "открыть", hiddenUntilHover: false, reachable: false }).ok).toBe(true);
  });

  it("список отдаёт все дефекты, а не первый", () => {
    // Первый дефект останавливает правку: исправили, прогнали, нашли второй.
    const found = problems([
      { what: "один", hiddenUntilHover: true, reachable: false },
      { what: "два", hiddenUntilHover: true, reachable: false },
      { what: "три", hiddenUntilHover: false, reachable: false },
    ]);
    expect(found).toHaveLength(2);
    expect(found.join(" ")).toContain("один");
    expect(found.join(" ")).toContain("два");
  });
});

describe("молчаливое изменение размера читается как поломка", () => {
  it("на сенсоре сказано, что интерфейс подстроился", () => {
    expect(notice("coarse")).toContain("цели крупнее");
  });

  it("на мыши — не сказано ничего: там ничего и не менялось", () => {
    expect(notice("fine")).toBe("");
    expect(notice("unknown")).toBe("");
  });
});
