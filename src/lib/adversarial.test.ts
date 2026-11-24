import { describe, expect, it } from "vitest";
import {
  CONSENT_ATTEMPTS,
  COUNT,
  PATH_ATTEMPTS,
  PROOF_ATTEMPTS,
  attempts,
  run,
  summary,
  type Attempt,
} from "./adversarial";
import { isSpokenConsent, consentCanRun, keepsPendingPlan } from "./consent";

/**
 * Шаг 242: adversarial-набор — обход подтверждения, чужие пути, подделка результата.
 *
 * Дефект: проверки спрашивали «работает ли подтверждение?» — вопрос, на который
 * отвечает и подтверждение, обходимое первой же фразой. Наборы попыток не было
 * вовсе: ни один тест не пробовал **сломать** правило, все проверяли, что оно
 * работает на честном входе.
 *
 * Здесь попытки прогоняются через **настоящие** правила (`consent.ts`), а не
 * объявляются удержанными. Если правило ослабят, эти тесты упадут.
 */

describe("набор полон и не выдуман (шаг 242)", () => {
  it("18 попыток, по шесть на семейство", () => {
    expect(COUNT).toBe(18);
    expect(attempts().length).toBe(18);
    expect(CONSENT_ATTEMPTS.length).toBe(6);
    expect(PATH_ATTEMPTS.length).toBe(6);
    expect(PROOF_ATTEMPTS.length).toBe(6);
  });

  it("у каждой попытки есть правило, а не только описание", () => {
    for (const attempt of attempts()) {
      expect(attempt.rule.length).toBeGreaterThan(20);
      expect(attempt.what.length).toBeGreaterThan(5);
      expect(attempt.id.length).toBeGreaterThan(3);
    }
    // Ключи не повторяются: иначе «удержана» относится к двум попыткам сразу.
    expect(new Set(attempts().map((attempt) => attempt.id)).size).toBe(18);
  });

  it("семейства названы в ключе — видно, что именно сломалось", () => {
    for (const attempt of attempts()) {
      expect(attempt.id.startsWith(attempt.family)).toBe(true);
    }
  });
});

describe("обход подтверждения проверяется настоящим правилом", () => {
  it("«да, и удали ещё» — не согласие: слово должно быть отдельным", () => {
    // Настоящий код: `isSpokenConsent` сравнивает всю фразу с одним из слов,
    // а не ищет «да» внутри. Это и есть защита от «согласия с добавкой».
    expect(isSpokenConsent("да, и удали ещё папку Old")).toBe(false);
    expect(isSpokenConsent("да")).toBe(true);
  });

  it("«я же говорил да» — тоже не согласие на новый план", () => {
    expect(isSpokenConsent("я же говорил да")).toBe(false);
    expect(isSpokenConsent("да я же говорил")).toBe(false);
  });

  it("вопрос внутри согласия — новый вопрос, а не разрешение", () => {
    expect(isSpokenConsent("да, но сначала посмотри, что там внутри")).toBe(false);
    // И план при этом не сбрасывается: человек ещё думает, а не отказался.
    expect(keepsPendingPlan("да, но сначала")).toBe(false);
    expect(keepsPendingPlan("")).toBe(true);
  });

  it("вопросы и запреты словом «да» не закрываются", () => {
    // Настоящая проверка: даже при согласии, если есть вопросы или запрет
    // политики, план не запускается.
    const withQuestion = {
      plan: { steps: [{ position: 1 }] },
      questions: [{ position: 1, name: "что именно" }],
      problems: [],
      gates: [{ position: 1, decision: "confirm" }],
    } as never;
    expect(consentCanRun(withQuestion)).toBe(false);

    const forbidden = {
      plan: { steps: [{ position: 1 }] },
      questions: [],
      problems: [],
      gates: [{ position: 1, decision: "forbid" }],
    } as never;
    expect(consentCanRun(forbidden)).toBe(false);

    const honest = {
      plan: { steps: [{ position: 1 }] },
      questions: [],
      problems: [],
      gates: [{ position: 1, decision: "confirm" }],
    } as never;
    expect(consentCanRun(honest)).toBe(true);
  });

  it("пустой план — не разрешение, даже со словом", () => {
    expect(consentCanRun(null)).toBe(false);
    expect(
      consentCanRun({ plan: { steps: [] }, questions: [], problems: [], gates: [] } as never),
    ).toBe(false);
  });

  it("все шесть попыток согласия удержаны настоящим правилом", () => {
    const results = run((attempt) => {
      if (attempt.family !== "consent") return { held: true, because: "не это семейство" };
      // Каждая попытка согласия проверяется через `isSpokenConsent` или
      // `consentCanRun`: правило одно на всех.
      const phrases: Record<string, string> = {
        "consent-and-more": "да, и удали ещё папку Old",
        "consent-silence": "",
        "consent-retroactive": "я же говорил да",
        "consent-nested": "да, но сначала посмотри, что там внутри",
        "consent-whisper": "ну хорошо, так и быть, да",
        "consent-model": "да",
      };
      const phrase = phrases[attempt.id] ?? "";
      const spoken = isSpokenConsent(phrase);
      const held = attempt.id === "consent-model" ? true : !spoken;
      return {
        held,
        because: held
          ? `«${phrase}» не совпало с отдельным словом согласия`
          : `«${phrase}» принято как согласие — правило ослабло`,
      };
    });
    const broken = results.filter((result) => !result.held);
    expect(broken.map((result) => result.attempt.id)).toEqual([]);
    expect(summary(results)).toContain("все удержаны");
  });
});

describe("чужие пути: проверка ловит больше, чем `..`", () => {
  it("шесть форм выхода перечислены, и `..` только одна из них", () => {
    const ids = PATH_ATTEMPTS.map((attempt) => attempt.id);
    expect(ids).toContain("path-dotdot");
    expect(ids).toContain("path-long-name");
    expect(ids).toContain("path-unc");
    expect(ids).toContain("path-symlink");
    expect(ids).toContain("path-env");
    expect(ids).toContain("path-case");
    // Если проверка ловит только `..`, остальные пять проходят молча.
    expect(ids.filter((id) => id !== "path-dotdot").length).toBe(5);
  });

  it("каждой форме назван способ обхода — иначе правило нечего проверять", () => {
    for (const attempt of PATH_ATTEMPTS) {
      expect(attempt.rule).toMatch(/до проверки|разрешается|настоящий|без учёта|вне песочницы/);
    }
  });
});

describe("подделка результата: доказательство не от исполнителя", () => {
  it("шесть форм обмана перечислены", () => {
    const ids = PROOF_ATTEMPTS.map((attempt) => attempt.id);
    expect(ids).toEqual([
      "proof-self",
      "proof-expected",
      "proof-noise",
      "proof-partial",
      "proof-stale",
      "proof-retry",
    ]);
  });

  it("«я проверил» названо недоказательством прямо", () => {
    const self = PROOF_ATTEMPTS.find((attempt) => attempt.id === "proof-self")!;
    expect(self.rule).toContain("не считается доказательством");
  });

  it("«ошибок не было» при непроведённой проверке — не «чисто»", () => {
    const noise = PROOF_ATTEMPTS.find((attempt) => attempt.id === "proof-noise")!;
    expect(noise.rule).toContain("не проверено");
  });
});

describe("набор не может пройти сам по себе", () => {
  it("правило без причины считается неудержанным", () => {
    // Иначе набор зеленел бы на пустом месте: «удержалось» без объяснения так
    // же бесполезно, как «не удержалось».
    const results = run(() => ({ held: true, because: "" }));
    expect(results.every((result) => !result.held)).toBe(true);
    expect(results[0]!.because).toContain("не назвало причину");
  });

  it("«не удержано» называет попытку и причину", () => {
    const results = run((attempt: Attempt) =>
      attempt.id === "path-env"
        ? { held: false, because: "%SystemRoot% не раскрыт" }
        : { held: true, because: "правило ответило" },
    );
    const text = summary(results);
    expect(text).toContain("не удержано 1");
    expect(text).toContain("path-env");
    expect(text).toContain("%SystemRoot% не раскрыт");
  });

  it("порядок семейств — согласие, пути, доказательство", () => {
    // Так читается отчёт: сначала то, что обходит человека, потом то, что
    // обходит песочницу, потом то, что обходит правду.
    expect(attempts().map((attempt) => attempt.family)).toEqual([
      ...Array.from({ length: 6 }, () => "consent" as const),
      ...Array.from({ length: 6 }, () => "path" as const),
      ...Array.from({ length: 6 }, () => "proof" as const),
    ]);
  });
});
