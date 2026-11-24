import { describe, expect, it } from "vitest";
import { blame, confirm, ensure, firstPhrase, initial, lost, say, willPay } from "./warmStart";

/**
 * Шаг 125: запуск ядра один раз, тёплый старт; холодный измерен и назван.
 *
 * Первая фраза платила 3 с за старт при ответе в 400 мс — 88% времени на то, чтобы
 * начать.
 */
describe("ядро поднимается один раз", () => {
  it("второй запрос берёт поднятое ядро", async () => {
    let ups = 0;
    const kernel = initial();
    const up = async () => {
      ups += 1;
    };
    await ensure(kernel, up);
    // «Живо» подтверждает настоящий запрос, а не наше «мы запускали».
    confirm(kernel);
    await ensure(kernel, up);
    expect(ups).toBe(1);
    expect(kernel.starts).toBe(1);
  });

  it("одновременные запросы ждут один запуск, а не поднимают два", async () => {
    // Два ядра ждут памяти и оба медленнее, чем одно.
    let ups = 0;
    const kernel = initial();
    const up = async () => {
      ups += 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
    };
    await Promise.all([ensure(kernel, up), ensure(kernel, up), ensure(kernel, up)]);
    expect(ups).toBe(1);
    expect(kernel.starts).toBe(1);
  });

  it("неподтверждённое «тёплое» ядро поднимается заново, а не отдаётся мёртвым", async () => {
    // Именно это пряталось: `warm` значило «мы когда-то запускали».
    const kernel = initial();
    let ups = 0;
    await ensure(kernel, async () => {
      ups += 1;
    });
    await ensure(kernel, async () => {
      ups += 1;
    });
    expect(ups).toBe(2);
  });

  it("упавшее на запросе ядро снова холодное, и причина названа", async () => {
    const kernel = initial();
    await ensure(kernel, async () => {});
    confirm(kernel);
    lost(kernel, "нет ответа за 5 с");
    expect(willPay(kernel)).toBe(true);
    expect(say(kernel)).toContain("нет ответа за 5 с");
  });

  it("тёплый старт назван числом", async () => {
    const kernel = initial();
    let clock = 0;
    await ensure(kernel, async () => {
      clock += 3100;
    }, () => clock);
    expect(kernel.coldMs).toBe(3100);
    expect(say(kernel)).toBe("ядро поднято один раз: холодный старт 3100 мс");
  });
});

describe("холодный старт измерен и назван", () => {
  it("до запуска сказано, что фраза заплатит", () => {
    // Молчаливое «первая дольше» читается как «приложение медленное».
    expect(willPay(initial())).toBe(true);
    expect(say(initial())).toBe("ядро не поднято: первая фраза заплатит за холодный старт");
  });

  it("после запуска первая фраза уже не платит", async () => {
    const kernel = initial();
    await ensure(kernel, async () => {});
    expect(willPay(kernel)).toBe(false);
  });

  it("цена первой фразы — старт плюс ответ", async () => {
    const kernel = { ...initial(), coldMs: 3000, state: "warm" as const };
    expect(firstPhrase(kernel, 400)).toBe(3400);
  });
});

describe("падение ядра снова делает старт холодным, и это сказано", () => {
  it("падение названо, а не выглядит деградацией", async () => {
    const kernel = initial();
    await ensure(kernel, async () => {
      throw new Error("нет памяти");
    });
    expect(kernel.state).toBe("failed");
    expect(willPay(kernel)).toBe(true);
    expect(say(kernel)).toContain("нет памяти");
  });

  it("прошлая цена помнится, даже если ядро упало", async () => {
    const kernel = initial();
    let clock = 0;
    await ensure(kernel, async () => {
      clock += 900;
    }, () => clock);
    await ensure(kernel, async () => {
      throw new Error("упало");
    });
    expect(say(kernel)).toContain("прошлый стоил 900 мс");
  });
});

describe("что чинить — старт или ответ", () => {
  it("старт больше половины — чинить старт", () => {
    const kernel = { ...initial(), coldMs: 3100, state: "warm" as const };
    expect(blame(kernel, 400).said).toContain("чинить старт, а не ответ");
  });

  it("ответ дороже старта — так и сказано", () => {
    const kernel = { ...initial(), coldMs: 300, state: "warm" as const };
    expect(blame(kernel, 2400).said).toContain("ответ дороже старта");
  });

  it("старт не платился — не виним его", () => {
    const kernel = { ...initial(), coldMs: 0, state: "warm" as const };
    expect(blame(kernel, 400).said).toContain("старт не платился");
  });
});
