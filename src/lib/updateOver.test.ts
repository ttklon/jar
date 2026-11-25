import { describe, expect, it } from "vitest";
import { STEPS, afterInstall, dataOnRollback, orderCheck, promise, type Probe, type Step } from "./updateOver";

/**
 * Шаг 304: обновление поверх — данные и память на месте, откат при сбое.
 *
 * Обновление — главный источник потерь данных: не из-за кода, а из-за порядка.
 */

const probe = (over: Partial<Probe> = {}): Probe => ({
  started: true,
  version: "2.0",
  dataReads: true,
  memories: 40,
  ...over,
});

describe("порядок: сохранить, поставить, проверить, потом удалить", () => {
  it("наш порядок правильный — нарушений нет", () => {
    expect(orderCheck()).toEqual([]);
    expect(STEPS.length).toBe(5);
  });

  it("удалить app.old до проверки — откатываться некуда", () => {
    const bad: Step[] = [
      { order: 1, what: "проверить место" },
      { order: 2, what: "сохранить текущую версию рядом как app.old" },
      { order: 3, what: "поставить новую версию поверх" },
      { order: 4, what: "удалить app.old только после успешной проверки" },
      { order: 5, what: "запустить и проверить" },
    ];
    expect(orderCheck(bad).join()).toContain("до проверки");
  });

  it("поставить до сохранения — при сбое нечего возвращать", () => {
    const bad: Step[] = [
      { order: 1, what: "поставить новую версию поверх" },
      { order: 2, what: "сохранить текущую версию рядом как app.old" },
      { order: 3, what: "запустить и проверить" },
      { order: 4, what: "удалить app.old" },
    ];
    expect(orderCheck(bad).join()).toContain("нечего возвращать");
  });

  it("два шага с одним номером — порядок не определён", () => {
    const bad: Step[] = [
      { order: 1, what: "сохранить текущую версию рядом как app.old" },
      { order: 1, what: "поставить новую версию поверх" },
      { order: 2, what: "запустить и проверить" },
      { order: 3, what: "удалить app.old" },
    ];
    expect(orderCheck(bad).join()).toContain("порядок не определён");
  });
});

describe("проверка после установки решает судьбу", () => {
  it("всё на месте — оставляем", () => {
    const got = afterInstall(probe(), "2.0", 40);
    expect(got.outcome).toBe("keep");
    expect(got.said).toContain("все 40 фактов памяти на месте");
  });

  it("не запустилась — возвращаем прежнюю", () => {
    const got = afterInstall(probe({ started: false }), "2.0", 40);
    expect(got.outcome).toBe("rollback");
    expect(got.said).toContain("app.old");
  });

  it("запустилась не та версия — что-то смешалось", () => {
    expect(afterInstall(probe({ version: "1.9" }), "2.0", 40).said).toContain("что-то смешалось");
  });

  it("данные не читаются — откат", () => {
    expect(afterInstall(probe({ dataReads: false }), "2.0", 40).outcome).toBe("rollback");
  });

  it("память потеряла факты — откат и разбор, а не «допишем потом»", () => {
    const got = afterInstall(probe({ memories: 37 }), "2.0", 40);
    expect(got.outcome).toBe("rollback");
    expect(got.said).toContain("потеряла 3 фактов");
  });
});

describe("откат программы не откатывает данные", () => {
  it("прежняя версия читает новую схему — можно", () => {
    expect(dataOnRollback(3, 3).ok).toBe(true);
  });

  it("не читает — предупредить до отката", () => {
    const got = dataOnRollback(4, 3);
    expect(got.ok).toBe(false);
    expect(got.said).toContain("предупредить до отката");
  });
});

describe("обещание человеку", () => {
  it("память и файлы останутся, вернётся прежняя", () => {
    const got = promise();
    expect(got).toContain("останутся на месте");
    expect(got).toContain("вернётся прежняя");
  });
});
