import { describe, expect, it } from "vitest";
import { MONTH_MS, SHOWS_NEEDED, afterShow, countsAsShow, duringFirstMonth, grewUp, show, type Rule } from "./firstMonth";

/**
 * Шаг 329: первый месяц — предложение подтвердить автоматизацию, а не тихий запуск.
 *
 * У человека ещё нет опыта с этим правилом: он не видел, что оно заденет.
 */

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 20);

const rule = (over: Partial<Rule> = {}): Rule => ({
  createdAt: NOW - 40 * DAY,
  ranQuietly: 8,
  acknowledged: 8,
  ...over,
});

describe("выросло — месяц и пять показов, а не одно из двух", () => {
  it("месяц и восемь показов — выросло", () => {
    const got = grewUp(rule(), NOW);
    expect(got.ok).toBe(true);
    expect(got.said).toContain("дальше — тихо");
  });

  it("неделя — ещё молодое, и сказано сколько ждать", () => {
    const got = grewUp(rule({ createdAt: NOW - 7 * DAY }), NOW);
    expect(got.ok).toBe(false);
    expect(got.said).toContain("ещё 23 дня");
  });

  it("месяц прошёл, но показов мало — опыта почти нет", () => {
    const got = grewUp(rule({ ranQuietly: 2, acknowledged: 2 }), NOW);
    expect(got.ok).toBe(false);
    expect(got.said).toContain("месяц прошёл, а опыта почти нет");
  });

  it("пороги названы числами", () => {
    expect(MONTH_MS).toBe(30 * DAY);
    expect(SHOWS_NEEDED).toBe(5);
  });
});

describe("молодое правило показывает, а не спрашивает", () => {
  it("тридцать вопросов — не автоматизация", () => {
    const got = duringFirstMonth(rule({ createdAt: NOW - DAY }), NOW);
    expect(got.ask).toBe(false);
    expect(got.said).toContain("показывает себя");
  });

  it("выросшее — тихо", () => {
    expect(duringFirstMonth(rule(), NOW).said).toBe("тихо");
  });
});

describe("показ — это что стало иначе", () => {
  it("не «правило сработало», а результат", () => {
    const got = show("Уборка загрузок", "удалено 12 файлов");
    expect(got).toContain("Сам сделал");
    expect(got).toContain("В первый месяц");
  });

  it("замеченное и с реакцией — показ состоялся", () => {
    expect(countsAsShow(true, true)).toBe(true);
  });

  it("уведомление, которое не открыли, показом не считается", () => {
    expect(countsAsShow(true, false)).toBe(false);
    expect(countsAsShow(false, false)).toBe(false);
  });
});

describe("после показа — три ответа, все сохраняются", () => {
  it("«так и надо» — дальше без показа", () => {
    expect(afterShow("fine")).toContain("дальше без показа");
  });

  it("«больше не делай» — выключено, вернуть можно", () => {
    expect(afterShow("stop")).toContain("вернуть можно");
  });

  it("«поправь» — про конкретное, а не «откройте настройки»", () => {
    const got = afterShow("tune");
    expect(got).toContain("время, условие или само дело");
    expect(got).toContain("на паузе");
  });
});
