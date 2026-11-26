import { describe, expect, it } from "vitest";
import { build } from "./rightNow";

/**
 * Мост «что сейчас» проверяется на правиле: состояние собирается из того, что
 * известно, и ничего не додумывает.
 */

describe("состояние для экрана «что сейчас»", () => {
  it("пустое состояние — ответ «ничего не происходит», а не пустой экран", () => {
    const blocks = build({ running: [], waiting: [], scheduled: [], modelReady: true }, 0);
    expect(blocks[0]?.title).toBe("ничего не происходит");
  });

  it("идущее дело названо шагом, а не «работает»", () => {
    const blocks = build(
      { running: [{ what: "почистить диск", step: 1, total: 4 }], waiting: [], scheduled: [], modelReady: true },
      0,
    );
    expect(blocks.map((block) => block.title)).toContain("делается сейчас");
    expect(blocks.flatMap((block) => block.lines)).toContain("«почистить диск»: шаг 2 из 4");
  });

  it("ждущее — первым: без ответа человека дело стоит", () => {
    const blocks = build(
      {
        running: [{ what: "чищу", step: 0, total: 2 }],
        waiting: [{ what: "удалить 42 файла", step: 0, total: 1, waitingFor: "подтверждение" }],
        scheduled: [],
        modelReady: true,
      },
      0,
    );
    expect(blocks[0]?.title).toBe("ждёт вашего ответа");
  });

  it("модель не загружена — сказано и названо нормальным", () => {
    const blocks = build({ running: [], waiting: [], scheduled: [], modelReady: false }, 0);
    expect(blocks.flatMap((block) => block.lines).join(" ")).toMatch(/загрузится при первом деле/);
  });
});
