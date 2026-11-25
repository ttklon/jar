import { describe, expect, it } from "vitest";
import { badge, badgeAll, everywhere, notDoing, type Running } from "./runningGlobally";

/**
 * Шаг 367: дело, которое идёт, видно из любого экрана — индикатор, а не поиск.
 */

const running = (over: Partial<Running> = {}): Running => ({
  what: "уборка загрузок",
  done: 3,
  total: 7,
  waiting: false,
  cancellable: true,
  ...over,
});

describe("плашка говорит, что идёт и где оно", () => {
  it("название дела и шаг, а не «выполняется»", () => {
    expect(badge(running())).toBe("уборка загрузок: шаг 3 из 7");
  });

  it("ждёт ответа — это не «идёт»", () => {
    expect(badge(running({ waiting: true }))).toBe("уборка загрузок: ждёт вашего ответа");
  });

  it("без шагов — просто «идёт»", () => {
    expect(badge(running({ total: 0, done: 0 }))).toBe("уборка загрузок: идёт");
  });
});

describe("несколько дел — одно место", () => {
  it("одно дело", () => {
    expect(badgeAll([running()])).toBe("уборка загрузок: шаг 3 из 7");
  });

  it("ждущее важнее идущего: без ответа не сдвинется", () => {
    const got = badgeAll([running(), running({ what: "проверка обновлений", waiting: true })]);
    expect(got).toBe("проверка обновлений: ждёт вашего ответа");
  });

  it("два ждущих — счёт, а не стопка", () => {
    expect(badgeAll([running({ waiting: true }), running({ what: "б", waiting: true })])).toBe("2 дела ждут ответа");
  });

  it("несколько идущих — списком в одной строке", () => {
    const got = badgeAll([running(), running({ what: "проверка обновлений" })]);
    expect(got).toContain("2 дела идут");
    expect(got).toContain("уборка загрузок");
  });

  it("ничего не идёт — плашки нет", () => {
    expect(badgeAll([])).toBeNull();
  });

  it("склонение: 1 дело идёт, 2 дела идут, 5 дел идут", () => {
    expect(badgeAll([running()])).not.toContain("дел идут");
    expect(badgeAll([running(), running({ what: "б" })])).toContain("дела идут");
    expect(badgeAll(Array.from({ length: 5 }, (_, i) => running({ what: `д${i}` })))).toContain("дел идут");
  });
});

describe("везде, а не на одном экране", () => {
  it("три места, включая трей и заголовок", () => {
    const got = everywhere();
    expect(got.length).toBe(3);
    expect(got.join()).toContain("трее");
    expect(got.join()).toContain("заголовке окна");
  });

  it("не перекрывает, не крадёт фокус, не требует нажатия", () => {
    const got = notDoing().join();
    expect(got).toContain("не забирает фокус");
    expect(got).toContain("исчезает сама");
  });
});
