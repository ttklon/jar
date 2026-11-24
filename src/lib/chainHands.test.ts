import { describe, expect, it } from "vitest";
import { chain, order, risky, say, split, type Deed } from "./chainHands";

/**
 * Шаг 108: связать руки в сценарий без ручного JSON.
 *
 * Человек говорит «сделай то и то», а не пишет конфиг.
 */
const VERBS = ["создай", "перенеси", "переименуй", "проверь"];

function deed(tool: string, params: Record<string, string> = {}): Deed {
  return { tool, params, said: tool };
}

describe("фраза делится на дела, но не по каждой «и»", () => {
  it("«и» между глаголами разделяет дела", () => {
    expect(split("создай папку и перенеси отчёт", VERBS)).toHaveLength(2);
  });

  it("«и» внутри названия — не разделитель", () => {
    // «файлы и папки» — одно дело, а не два.
    const parts = split("перенеси файлы и папки", VERBS);
    expect(parts).toHaveLength(1);
    expect(parts[0]).toContain("папки");
  });

  it("запятая и «потом» тоже разделяют", () => {
    expect(split("создай папку, потом перенеси отчёт", VERBS)).toHaveLength(2);
  });
});

describe("порядок — из зависимостей, а не из порядка в файле", () => {
  it("шаг, чей путь берётся из другого, идёт после него", () => {
    // Иначе перестановка ломает сценарий молча.
    const first = deed("files|перенести|файлы/папки", { from: "D:\\a.txt", to: "@1" });
    const second = deed("files|создать|папку", { path: "D:\\Архив" });
    const got = order([first, second]);
    expect(got.steps[0]?.tool).toBe("files|создать|папку");
    expect(got.steps[1]?.tool).toBe("files|перенести|файлы/папки");
  });

  it("связь названа, а не угадана по совпадению имён", () => {
    const got = order([
      deed("files|создать|папку", { path: "D:\\Архив" }),
      deed("files|перенести|файлы/папки", { to: "@0" }),
    ]);
    expect(got.links[0]).toEqual({ step: 1, param: "to", from: 0 });
  });

  it("круг — ошибка, а не «как-нибудь выполним»", () => {
    // Сценарий, который не может начаться, не начинается.
    const got = order([
      deed("a|x|y", { p: "@1" }),
      deed("b|x|y", { p: "@0" }),
    ]);
    expect(got.steps).toHaveLength(0);
    expect(got.gaps[0]).toContain("по кругу");
  });

  it("ссылка на несуществующий шаг — дыра, а не тишина", () => {
    const got = order([deed("a|x|y", { p: "@5" })]);
    expect(got.gaps[0]).toContain("несуществующий");
  });
});

describe("связка собирается из сказанного", () => {
  it("два дела — две строки, порядок по зависимостям", () => {
    const got = chain(
      "создай папку и перенеси отчёт",
      (said) =>
        said.startsWith("создай")
          ? deed("files|создать|папку", { path: "D:\\Архив" })
          : deed("files|перенести|файлы/папки", { from: "D:\\a.txt", to: "@0" }),
      VERBS,
    );
    expect(say(got)[0]).toBe("дел в связке: 2");
    expect(say(got).some((line) => line.startsWith("связь:"))).toBe(true);
  });

  it("непонятое не теряется: оно названо", () => {
    // «отпразднуй» не из тех глаголов, что знают руки, поэтому оно остаётся
    // частью первого дела — и **это** видно: дело уходит в «не понял» целиком.
    const got = chain("создай папку и отпразднуй", () => null, VERBS);
    expect(say(got)[0]).toContain("не из чего");

    const mixed = chain(
      "создай папку затем отпразднуй",
      (said) => (said.startsWith("создай") ? deed("files|создать|папку") : null),
      [...VERBS, "отпразднуй"],
    );
    expect(mixed.unknown).toEqual(["отпразднуй"]);
    expect(say(mixed).some((line) => line.includes("не понял"))).toBe(true);
  });

  it("ни одного дела — так и сказано, а не «выполняю»", () => {
    const got = chain("что-нибудь", () => null, VERBS);
    expect(say(got)[0]).toContain("не из чего");
  });
});

describe("связка опасна, если опасен любой шаг", () => {
  it("согласие дают на самое опасное, а не на среднее", () => {
    expect(risky(["read", "write-local"])).toBe(false);
    expect(risky(["read", "destructive"])).toBe(true);
  });
});
