import { describe, expect, it } from "vitest";
import { add, checks, mayAdd, notDo, provenMeans, type Book, type Promise_ } from "./noNewPromises";

/**
 * Шаг 496: не добавлять новых обещаний, пока старые не доказаны.
 */

const item = (over: Partial<Promise_> = {}): Promise_ => ({ text: "понимаю «почисти загрузки»", proven: false, ...over });
const book = (items: Promise_[]): Book => ({ items });
const fresh = (): Promise_ => ({ text: "понимаю «отправь письмо»", proven: false });

describe("три исхода правила", () => {
  it("есть недоказанное — нельзя, и названо какое", () => {
    const got = mayAdd(book([item()]));
    expect(got.verdict).toBe("сначала доказать");
    expect(got.said).toContain("недоказанных 1");
    expect(got.said).toContain("«почисти загрузки»");
  });

  it("всё доказано — можно", () => {
    expect(mayAdd(book([item({ proven: true })])).verdict).toBe("можно");
  });

  it("замена недоказанного — можно, список не растёт", () => {
    const got = mayAdd(book([item()]), "почисти загрузки");
    expect(got.verdict).toBe("только вместо");
    expect(got.said).toContain("список не растёт");

    const next = add(book([item()]), fresh(), "почисти загрузки");
    expect(next.book.items).toHaveLength(1);
    expect(next.book.items[0]!.text).toContain("письмо");
  });

  it("замена доказанного — нельзя: заменять нечего", () => {
    expect(mayAdd(book([item({ proven: true })]), "почисти загрузки").verdict).toBe("сначала доказать");
  });

  it("замена того, чего нет — нельзя", () => {
    expect(mayAdd(book([item()]), "чего-то нет").said).toContain("заменять нечего");
  });

  it("добавление при недоказанных не меняет список", () => {
    const before = book([item()]);
    const got = add(before, fresh());
    expect(got.book.items).toHaveLength(1);
    expect(got.verdict).toContain("сначала доказать");
  });

  it("добавление при доказанных растит список", () => {
    const got = add(book([item({ proven: true })]), fresh());
    expect(got.book.items).toHaveLength(2);
  });
});

describe("что считается доказанным", () => {
  it("тест с утверждением и приёмка на трёх машинах", () => {
    const got = provenMeans();
    expect(got).toHaveLength(2);
    expect(got[0]).toContain("без `expect`");
    expect(got[1]).toContain("«работает у меня» — не приёмка");
  });

  it("«в порядке исключения» не бывает — только замена", () => {
    const got = notDo().join();
    expect(got).toContain("сначала доказать, потом обещать");
    expect(got).toContain("исключение — это замена");
    expect(checks()).toHaveLength(3);
  });
});
