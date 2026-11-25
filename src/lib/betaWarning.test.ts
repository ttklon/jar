import { describe, expect, it } from "vitest";
import { KNOWN_BREAKS, audit, consent, needsWarning, policy, warning, type Warning } from "./betaWarning";

/**
 * Шаг 315: канал beta с явным предупреждением — выбор человека, а не сюрприз.
 *
 * Человек должен понимать, на что подписывается, до переключения.
 */

describe("предупреждение говорит, что именно ломается", () => {
  it("наше предупреждение проходит проверку", () => {
    expect(audit(warning(4))).toEqual([]);
  });

  it("реальный случай важнее общих слов", () => {
    const got = warning(4).lines.join();
    expect(got).toContain("уже ломалось");
    expect(got).toContain("первую секунду");
  });

  it("«возможны ошибки» — не предупреждение", () => {
    const bad: Warning = {
      title: "Beta",
      lines: ["возможны ошибки", "версия может быть нестабильной"],
      confirm: "ОК",
    };
    const got = audit(bad).join();
    expect(got).toContain("не сказано, что именно ломается");
    expect(got).toContain("нужно действие словами");
  });

  it("без «как вернуться» и «что с данными» — не годится", () => {
    const bad: Warning = {
      title: "Beta",
      lines: ["уже ломалось: голос", "обновляется чаще", "это тест"],
      confirm: "Понятно",
    };
    const got = audit(bad).join();
    expect(got).toContain("как вернуться");
    expect(got).toContain("что будет с данными");
  });

  it("предупреждение без известных случаев выдумано", () => {
    const bad: Warning = { title: "Beta", lines: ["обновляется чаще", "вернуться можно", "данные не трогаем"], confirm: "Понятно" };
    expect(audit(bad).join()).toContain("значит, предупреждение выдумано");
  });

  it("про данные — проще: схема stable не увидит новые записи", () => {
    expect(warning(4).lines.join()).toContain("не увидит новые записи");
  });

  it("живых случаев не меньше трёх", () => {
    expect(KNOWN_BREAKS.length).toBeGreaterThanOrEqual(3);
  });
});

describe("согласие помнит, на что согласился", () => {
  it("впервые — предупреждение нужно", () => {
    expect(needsWarning(null, warning(4))).toBe(true);
  });

  it("тот же текст — второй раз не спрашиваем", () => {
    const saved = consent(warning(4), 1_700_000_000_000);
    expect(needsWarning(saved, warning(4))).toBe(false);
  });

  it("текст изменился — спрашиваем снова", () => {
    // Иначе «согласился на beta» тянется годами через разные beta.
    const saved = consent(warning(4), 1_700_000_000_000);
    const changed = warning(4);
    const newer: Warning = { ...changed, lines: changed.lines.concat("уже ломалось: новое обновление ломало шрифты") };
    expect(needsWarning(saved, newer)).toBe(true);
  });

  it("согласие привязано к каналу", () => {
    expect(consent(warning(4), 1).channel).toBe("beta");
  });
});

describe("beta не ставится сама", () => {
  it("тихое обновление выключено всегда, а не настройкой", () => {
    const got = policy();
    expect(got).toContain("всегда");
    expect(got).toContain("не должна ставиться сама");
  });
});
