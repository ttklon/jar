import { describe, expect, it } from "vitest";
import { asserts, build, cancelFromFeed, trap, type Deed } from "./feedCancelProof";

/**
 * Шаг 370: тест — из ленты можно отменить идущее дело, и это видно в отчёте.
 *
 * Ломается стык: кнопка нажата, дело остановлено, а отчёт показывает «готово».
 */

const deed = (): Deed => ({
  id: "1",
  what: "уборка загрузок",
  state: "running",
  steps: [
    { name: "найти старые файлы", outcome: "done" },
    { name: "проверить, что не нужны", outcome: "done" },
    { name: "удалить", outcome: "pending" },
    { name: "отчёт", outcome: "pending" },
  ],
});

describe("отмена из ленты видна в отчёте", () => {
  it("дело становится отменённым, а не готовым", () => {
    const got = cancelFromFeed(deed(), 2);
    expect(got.deed.state).toBe("cancelled");
    expect(got.report.state).toBe("cancelled");
  });

  it("в отчёте шаг назван отменённым, а не выполненным", () => {
    const got = cancelFromFeed(deed(), 2);
    expect(got.deed.steps[2]!.outcome).toBe("cancelled");
    expect(got.report.text).toContain("остальное не делалось");
  });

  it("выполненные до отмены остались выполненными", () => {
    const got = cancelFromFeed(deed(), 2);
    expect(got.report.done).toBe(2);
    expect(got.deed.steps[0]!.outcome).toBe("done");
  });

  it("в ответе — сколько успело и сколько нет", () => {
    expect(cancelFromFeed(deed(), 2).said).toBe("отменено после 2 шагов; не выполнено 2");
  });
});

describe("отчёт собирается из случившегося, а не из плана", () => {
  it("готовое дело — «готово» с числом шагов", () => {
    const all: Deed = { ...deed(), state: "done", steps: deed().steps.map((s) => ({ ...s, outcome: "done" as const })) };
    expect(build(all).text).toBe("уборка загрузок: готово — 4 шагов");
  });

  it("ловушка названа: план весь на месте, а выполнено — часть", () => {
    expect(trap()).toContain("план весь на месте");
  });
});

describe("что тест обязан проверить", () => {
  it("четыре факта, включая «кнопка была»", () => {
    const got = asserts();
    expect(got.length).toBe(4);
    expect(got[0]).toContain("была кнопка");
    expect(got[3]).toContain("остались выполненными");
  });
});
