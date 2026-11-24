import { describe, expect, it } from "vitest";
import { answer, say, success, tally, unsure, WORDS, type Raw } from "./threeWords";

/**
 * Шаг 118: отчёт по шагу — тремя словами.
 *
 * `failed` читался как «не сделано», хотя шаг мог выполниться и сломаться на
 * проверке; `skipped` попадал в «сделано»; третьего слова не было вовсе.
 */
describe("три слова, и ни одного четвёртого", () => {
  it("слов ровно три", () => {
    expect(WORDS).toEqual(["сделано", "не сделано", "неизвестно"]);
  });
});

describe("«сделано» требует подтверждения проверкой", () => {
  it("ok с подтверждением — сделано", () => {
    expect(answer({ status: "ok", proof: "путь существует", confirmed: true })).toBe("сделано");
  });

  it("ok без подтверждения — неизвестно, а не сделано", () => {
    // Иначе «сделано» — вера (шаг 111).
    expect(answer({ status: "ok", confirmed: false })).toBe("неизвестно");
  });
});

describe("«не сделано» — факт, а не догадка", () => {
  it("пропущенный шаг — не сделано, а не сделано «по умолчанию»", () => {
    expect(answer({ status: "skipped" })).toBe("не сделано");
  });

  it("отменённый и проваленный без доказательства — не сделано", () => {
    expect(answer({ status: "cancelled" })).toBe("не сделано");
    expect(answer({ status: "failed" })).toBe("не сделано");
  });

  it("провал с доказательством — неизвестно: шаг мог сделаться", () => {
    // «Не сделано» и «сделано» здесь оба были бы ложью.
    expect(answer({ status: "failed", proof: "12 файлов переименовано" })).toBe("неизвестно");
  });
});

describe("«неизвестно» — честный статус, а не прятание", () => {
  it("шаг прерван посередине — неизвестно", () => {
    expect(answer({ status: "ok", interrupted: true })).toBe("неизвестно");
  });

  it("противоречие в отчёте — неизвестно", () => {
    expect(answer({ status: "ok", conflicted: true })).toBe("неизвестно");
  });

  it("ещё не начиналось — неизвестно, а не «не сделано»", () => {
    expect(answer({ status: "pending" })).toBe("неизвестно");
  });

  it("неизвестные считаются отдельно и называются", () => {
    const list: Raw[] = [{ status: "ok", confirmed: true }, { status: "pending" }, { status: "skipped" }];
    expect(unsure(list)).toEqual([1]);
  });
});

describe("итог — три числа рядом", () => {
  it("сделано, не сделано и неизвестно названы все", () => {
    const got = tally([{ status: "ok", confirmed: true }, { status: "skipped" }, { status: "pending" }]);
    expect(say(got)).toBe("из 3: сделано 1, не сделано 1, неизвестно 1");
  });

  it("«сделано N» без двух других — обещание, а не отчёт", () => {
    const said = say(tally([{ status: "ok", confirmed: true }]));
    expect(said).toContain("не сделано 0");
    expect(said).toContain("неизвестно 0");
  });

  it("дело удалось только без неизвестных и без провалов", () => {
    expect(success(tally([{ status: "ok", confirmed: true }]))).toBe(true);
    expect(success(tally([{ status: "ok", confirmed: true }, { status: "pending" }]))).toBe(false);
    expect(success(tally([]))).toBe(false);
  });

  it("пустой отчёт — «нечего отчитывать», а не «успех»", () => {
    expect(say(tally([]))).toBe("шагов нет — нечего отчитывать");
  });
});
