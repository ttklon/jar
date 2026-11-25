import { describe, expect, it } from "vitest";
import { ENOUGH_CONFIRMS, FRESH_MS, ask, cancel, learn, mayRunQuietly, sameKind, status, type History } from "./earnedTrust";

/**
 * Шаг 323: автоматическое дело того же типа, что уже подтверждали вручную.
 *
 * Доверие зарабатывается числом, а не словами.
 */

const NOW = Date.UTC(2026, 10, 20);
const DAY = 86_400_000;

const history = (over: Partial<History> = {}): History => ({
  kind: "убрать загрузки",
  confirmed: 3,
  lastAt: NOW - 5 * DAY,
  cancelledAt: 0,
  ...over,
});

describe("доверие зарабатывается числом", () => {
  it("три подтверждения за месяц — можно тихо", () => {
    const got = mayRunQuietly(history(), NOW);
    expect(got.ok).toBe(true);
    expect(got.said).toContain("можно без вопроса");
  });

  it("ни разу не делал руками — первое срабатывание спросит", () => {
    const got = mayRunQuietly(null, NOW);
    expect(got.ok).toBe(false);
    expect(got.said).toContain("первое срабатывание спросит");
  });

  it("один раз — случайность, нужно два", () => {
    const got = mayRunQuietly(history({ confirmed: 1 }), NOW);
    expect(got.ok).toBe(false);
    expect(got.said).toContain("один раз это случайность");
    expect(ENOUGH_CONFIRMS).toBe(2);
  });

  it("год назад — привычку считаем утраченной", () => {
    const got = mayRunQuietly(history({ lastAt: NOW - 400 * DAY }), NOW);
    expect(got.ok).toBe(false);
    expect(got.said).toContain("30 дней");
    expect(FRESH_MS).toBe(30 * DAY);
  });

  it("после отмены счёт начнётся заново", () => {
    const got = mayRunQuietly(history({ cancelledAt: NOW - DAY }), NOW);
    expect(got.ok).toBe(false);
    expect(got.said).toContain("счёт начнётся заново");
  });

  it("отмена была раньше последнего подтверждения — не мешает", () => {
    const got = mayRunQuietly(history({ cancelledAt: NOW - 10 * DAY, lastAt: NOW - DAY }), NOW);
    expect(got.ok).toBe(true);
  });
});

describe("тип дела совпадает точно", () => {
  it("«убрать загрузки» и «убрать рабочий стол» — разные дела", () => {
    expect(sameKind("убрать загрузки", "убрать рабочий стол")).toBe(false);
  });

  it("регистр и лишние пробелы не делают дело другим", () => {
    expect(sameKind("Убрать  загрузки", "убрать загрузки")).toBe(true);
  });
});

describe("что спрашиваем, если доверия нет", () => {
  it("вопрос про конкретное дело, а не «разрешить автоматизацию»", () => {
    const got = ask("убираю загрузки");
    expect(got).toContain("делать это сам каждый день");
    expect(got).toContain("или спрашивать каждый раз");
  });

  it("человек может не решать сейчас — вариант «спрашивать» есть", () => {
    expect(ask("убираю загрузки")).toContain("спрашивать");
  });
});

describe("обучение и отмена", () => {
  it("ручное подтверждение повышает счёт", () => {
    expect(learn(history({ confirmed: 1 }), NOW).confirmed).toBe(2);
  });

  it("первое дело учит с нуля", () => {
    const got = learn(null, NOW);
    expect(got.confirmed).toBe(1);
    expect(got.lastAt).toBe(NOW);
  });

  it("отмена — сигнал, а не наказание", () => {
    expect(cancel(history(), NOW).cancelledAt).toBe(NOW);
  });

  it("статус при создании — про доверие, а не «правило создано»", () => {
    expect(status(null, NOW)).toContain("будет спрашивать");
    expect(status(history(), NOW)).toBe("правило создано: сработает само, без вопроса");
  });
});
