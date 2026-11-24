import { describe, expect, it } from "vitest";
import { SYSTEM_EDGE, hoverOnly, notice, owner, pointerOf, problems, sizes, whySystem } from "./touch";

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

/**
 * Шаг 233: сенсор — кнопки не меньше 40 px и **без свайпов, конфликтующих с
 * системой**.
 *
 * Кнопки уже были 44 px — норма выполнена, и это проверяется как связь с
 * нормой, а не само по себе. А вот про свайпы не было ничего: ни правила, ни
 * запрета. На планшете это значит, что приложение могло забрать жест от края —
 * и системный жест (уведомления, переключение задач) просто пропадал.
 */
describe("сенсор: кнопки и свайпы (шаг 233)", () => {
  const finger = sizes("coarse");

  it("кнопка не меньше 40 px — и это проверка на норму, а не на число", () => {
    // Сорок — нижняя граница удобной цели для пальца. У нас 44: запас есть, и
    // провал этого теста означал бы, что запас съели.
    expect(finger.control).toBeGreaterThanOrEqual(40);
    expect(finger.gap).toBeGreaterThan(0);
  });

  it("жест от правого края — системный: там панель уведомлений", () => {
    const swipe = { startX: 1010, startY: 400, width: 1024, height: 600 };
    expect(owner(swipe)).toBe("system");
  });

  it("жест от левого края — системный: там переключение задач", () => {
    expect(owner({ startX: 8, startY: 300, width: 1024, height: 600 })).toBe("system");
  });

  it("жест от нижнего и от верхнего края — тоже системный", () => {
    // Четыре края, а не два: запоминать «какие именно» значило бы расходиться
    // с Windows с каждой версией.
    expect(owner({ startX: 500, startY: 596, width: 1024, height: 600 })).toBe("system");
    expect(owner({ startX: 500, startY: 3, width: 1024, height: 600 })).toBe("system");
  });

  it("жест из середины — наш: системных жестов там нет", () => {
    expect(owner({ startX: 500, startY: 300, width: 1024, height: 600 })).toBe("app");
  });

  it("граница полосы названа и она с запасом", () => {
    // Системная полоса на 150% занимает около 20 **физических** пикселей — в
    // точках вёрстки меньше. Ошибиться в сторону «не перехватывать» безопасно.
    expect(SYSTEM_EDGE).toBe(20);
    expect(owner({ startX: 20, startY: 300, width: 1024, height: 600 })).toBe("system");
    expect(owner({ startX: 21, startY: 300, width: 1024, height: 600 })).toBe("app");
  });

  it("отданный системе жест не молчит", () => {
    // Молчание читается как «жест не работает».
    const why = whySystem({ startX: 2, startY: 300, width: 1024, height: 600 });
    expect(why).toContain("отдан системе");
    expect(why).toContain("20");
    expect(whySystem({ startX: 500, startY: 300, width: 1024, height: 600 })).toBe("");
  });

  it("на узком окне полоса не съедает середину", () => {
    // 512 точек (1024×600 при 200%) — полосы по 20 с каждой стороны оставляют
    // 472 середины: жест остаётся возможным.
    const width = 512;
    expect(width - 2 * SYSTEM_EDGE).toBeGreaterThan(0.8 * width);
    expect(owner({ startX: 256, startY: 150, width, height: 300 })).toBe("app");
  });
});
