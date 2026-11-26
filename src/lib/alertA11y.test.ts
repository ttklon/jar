import { describe, expect, it } from "vitest";
import { aria, check, checks, notDo, queue, type Notice } from "./alertA11y";

/**
 * Шаг 198: ошибки объявляются экранному диктору.
 */

const notice = (over: Partial<Notice> = {}): Notice => ({ text: "не удалось открыть папку загрузки", level: "ошибка", todo: "проверьте, что папка на месте", ...over });

describe("важное — assertive, обычное — polite", () => {
  it("ошибка — alert и assertive", () => {
    const got = aria(notice());
    expect(got.role).toBe("alert");
    expect(got.live).toBe("assertive");
  });

  it("подсказка — status и polite", () => {
    const got = aria(notice({ level: "подсказка", todo: undefined }));
    expect(got.role).toBe("status");
    expect(got.live).toBe("polite");
  });

  it("предупреждение — polite, не перебивает", () => {
    expect(aria(notice({ level: "предупреждение", todo: undefined })).live).toBe("polite");
  });
});

describe("метка — смысл, а не картинка", () => {
  it("у ошибки в метке есть «что делать»", () => {
    expect(aria(notice()).label).toBe("не удалось открыть папку загрузки. Что сделать: проверьте, что папка на месте");
  });

  it("значок в тексте — замечание", () => {
    expect(check(notice({ text: "↓ не удалось" })).join()).toContain("диктор прочтёт это вслух");
  });

  it("«подробнее» в тексте — тоже", () => {
    expect(check(notice({ text: "не удалось, подробнее в журнале" })).join()).toContain("прочтёт это вслух");
  });

  it("ошибка без «что делать» — проблема без выхода", () => {
    expect(check(notice({ todo: undefined })).join()).toContain("не слышит выход");
  });

  it("пустое сообщение — объявлять нечего", () => {
    expect(check(notice({ text: "  " })).join()).toContain("диктору нечего объявлять");
  });
});

describe("очередь: важное сразу, обычное по одному", () => {
  it("ошибка объявляется первой", () => {
    const got = queue([notice({ level: "подсказка", text: "совет" }), notice()]);
    expect(got.said).toContain("сразу объявляется ошибка");
    expect(got.first).toBe("не удалось открыть папку загрузки");
  });

  it("повторы не читаются", () => {
    const got = queue([notice({ level: "подсказка", text: "одно" }), notice({ level: "подсказка", text: "одно" })]);
    expect(got.first).toBe("одно");
    expect(got.rest).toBe(0);
  });

  it("пусто — нечего объявлять", () => {
    expect(queue([]).said).toBe("объявлять нечего");
  });
});

describe("чего это не делает", () => {
  it("не объявляет всё важным", () => {
    expect(notDo()[0]).toContain("перебивать сам себя");
    expect(checks()).toHaveLength(3);
  });
});
