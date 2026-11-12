import { describe, expect, it } from "vitest";
import { describeThought } from "./thought";
import type { Thought } from "../ipc";

function thought(
  proposal: Thought["proposal"],
  problem: string | null = null,
  plan: Thought["plan"] = null,
  learning: Thought["learning"] = null,
): Thought {
  return { prompt: "…", answer: "…", proposal, plan, learning, problem };
}

const learning = {
  registry: "видео|включить|субтитры",
  example: "включить субтитры в видео",
  query: "включи субтитры",
  implementation: ["UI Automation"],
  risk: "read",
  notes: "",
  asked_ms: 1,
  times: 1,
  steps: [],
};

describe("что сказать про ответ модели", () => {
  it("называет руку и причину — этого достаточно, чтобы согласиться или нет", () => {
    const plan = {
      plan: { goal: "потише", steps: [] },
      problems: [],
      gates: [],
      questions: [],
    };
    expect(
      describeThought(
        thought({ Call: { registry: "звук|убавить|громкость", params: {}, why: "просил тише" } }, null, plan),
      ),
    ).toBe("модель предлагает: звук|убавить|громкость — просил тише");
  });

  it("выбор без руки называет себя описанием, а не делом", () => {
    expect(describeThought(thought({ Call: { registry: "видео|включить|субтитры", params: {}, why: "" } }))).toBe(
      "модель выбрала видео|включить|субтитры, но руки для этого пока нет: это только описание",
    );
  });

  it("без причины не выдумывает её", () => {
    const plan = { plan: { goal: "субтитры", steps: [] }, problems: [], gates: [], questions: [] };
    expect(
      describeThought(thought({ Call: { registry: "браузер|включить|субтитры", params: {}, why: "" } }, null, plan)),
    ).toBe("модель предлагает: браузер|включить|субтитры");
  });

  it("про неумение говорит, что просьба записана и переживёт перезапуск", () => {
    expect(
      describeThought(
        thought({ Learn: { goal: "включи субтитры", why: "" } }, null, null, learning),
      ),
    ).toContain("записал в обучение: включи субтитры");
  });

  it("если урок записать не по чему — так и говорит, а не обещает", () => {
    expect(describeThought(thought({ Learn: { goal: "жжжж", why: "" } }))).toBe(
      "модель говорит, что надо научиться — жжжж, но такой строки в реестре нет: " +
        "записать урок не по чему, и притворяться не буду",
    );
  });

  it("переспрашивает вопросом, а не догадкой", () => {
    expect(describeThought(thought({ Ask: { question: "Куда сохранить?", why: "" } }))).toBe(
      "модель переспрашивает: Куда сохранить?",
    );
  });

  it("отказ называет причину", () => {
    expect(describeThought(thought({ Refuse: { reason: "это стоит денег" } }))).toBe(
      "модель отказывается: это стоит денег",
    );
  });

  it("неразобранный ответ не выдаёт за предложение", () => {
    expect(describeThought(thought(null, "руки `x` нет в реестре"))).toBe(
      "модель ответила, но разобрать не удалось: руки `x` нет в реестре",
    );
  });
});
