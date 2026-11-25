import { describe, expect, it } from "vitest";
import { allowed, askOwner, cannot, useful, wholePlan } from "./guestHands";

/**
 * Шаг 405: ограничение для гостя — только безопасные руки.
 */

describe("гостю только чтение", () => {
  it("чтение можно", () => {
    expect(allowed("read").ok).toBe(true);
  });

  it("удаление нельзя — и не «с подтверждением», а совсем", () => {
    const got = allowed("delete");
    expect(got.ok).toBe(false);
    expect(got.said).toContain("Попросите хозяина");
  });

  it("отправка и деньги — нельзя", () => {
    expect(allowed("send").ok).toBe(false);
    expect(allowed("pay").ok).toBe(false);
  });
});

describe("дело целиком — или никак", () => {
  it("только чтение — выполняется целиком", () => {
    expect(wholePlan(["read", "read"]).runs).toBe(true);
  });

  it("есть удаление — не выполняется, и сказано почему", () => {
    const got = wholePlan(["read", "delete"]);
    expect(got.runs).toBe(false);
    expect(got.said).toContain("бросить на середине было бы хуже");
  });
});

describe("подтверждает только хозяин и лично", () => {
  it("ждёт хозяина, а не «рядом сидел взрослый»", () => {
    const got = askOwner("почисти загрузки");
    expect(got.waiting).toBe(true);
    expect(got.said).toContain("подтвердить должен он сам");
  });
});

describe("«только чтение» — не «ничего нельзя»", () => {
  it("четыре полезных дела", () => {
    expect(useful().length).toBe(4);
    expect(useful().join()).toContain("найти файл");
  });

  it("нельзя ровно опасные руки", () => {
    expect(cannot().length).toBe(5);
    expect(cannot().join()).toContain("тратить деньги");
  });
});
