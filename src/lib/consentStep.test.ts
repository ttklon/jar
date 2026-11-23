import { describe, expect, it } from "vitest";
import { allowed, check, grant, print, revoke, say, STALE_MS, stale } from "./consentStep";

/**
 * Шаг 102: согласие по шагу, отзывается при изменении параметра.
 *
 * Человек разрешил шаг с путём D:\Отчёты, потом поправил на D:\Всё — согласие
 * осталось, и удалилось «всё».
 */
const P = { path: "D:\\Отчёты" };

describe("правка после согласия — обход, и он закрыт", () => {
  it("параметр изменился — согласие снято", () => {
    const granted = grant([], 0, P, 1000);
    const after = check(granted, [{ params: { path: "D:\\Всё" } }]);
    expect(after.kept).toHaveLength(0);
    expect(after.lost[0]?.why).toContain("параметр изменился");
  });

  it("параметр тот же — согласие в силе", () => {
    const granted = grant([], 0, P, 1000);
    expect(check(granted, [{ params: { ...P } }]).kept).toHaveLength(1);
  });

  it("снятие объяснено, а не «снова нужно подтверждение»", () => {
    // Молчаливое снятие выглядит поломкой, а не последствием правки.
    const said = say(check(grant([], 0, P, 1), [{ params: { path: "x" } }]));
    expect(said).toContain("согласие снято");
    expect(said).toContain("заново");
  });

  it("шаг из плана исчез — согласие тоже", () => {
    expect(check(grant([], 2, P, 1), [{ params: P }]).lost[0]?.why).toContain("шага больше нет");
  });
});

describe("согласие живёт по шагу, а не по плану", () => {
  it("снятие одного не снимает остальные", () => {
    // Человек передумал про один шаг, а не про весь план.
    let granted = grant(grant([], 0, P, 1), 1, { path: "B" }, 2);
    granted = revoke(granted, 0);
    expect(granted).toHaveLength(1);
    expect(granted[0]?.position).toBe(1);
  });

  it("разрешён именно этот шаг", () => {
    const granted = grant([], 1, P, 1);
    expect(allowed(granted, 1, P)).toBe(true);
    expect(allowed(granted, 0, P)).toBe(false);
  });

  it("«да» на один шаг не разрешает другой, даже с такими же параметрами", () => {
    // «Удалить A» не значит «удалить B».
    const granted = grant([], 0, P, 1);
    expect(allowed(granted, 1, P)).toBe(false);
  });
});

describe("порядок ключей не снимает согласие", () => {
  it("отпечаток не зависит от порядка", () => {
    // Иначе согласие снималось бы само при каждом пересчёте плана.
    expect(print({ a: "1", b: "2" })).toBe(print({ b: "2", a: "1" }));
    expect(print(undefined)).toBe("");
  });

  it("новое согласие на ту же позицию заменяет старое", () => {
    const granted = grant(grant([], 0, P, 1), 0, { path: "C" }, 2);
    expect(granted).toHaveLength(1);
    expect(allowed(granted, 0, { path: "C" })).toBe(true);
    expect(allowed(granted, 0, P)).toBe(false);
  });
});

describe("старое согласие — согласие на другой план", () => {
  it("через 15 минут согласие устарело", () => {
    // План мог измениться снаружи: файлы переименованы.
    expect(STALE_MS).toBe(15 * 60 * 1000);
    expect(stale({ position: 0, print: "", at: 0 }, STALE_MS + 1)).toBe(true);
    expect(stale({ position: 0, print: "", at: 0 }, STALE_MS - 1)).toBe(false);
  });
});
