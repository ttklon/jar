import { describe, expect, it } from "vitest";
import { check, done, say, stop, type Asked, type Got } from "./doesItFit";

/**
 * Шаг 86: проверять понимание по результату — сходится ли шаг с фразой.
 *
 * «Открой отчёт» открыло папку — действие выполнено, отчёт не открыт, а
 * человек видит «готово» и пустой экран.
 */
const asked = (object: string, qualifier: Asked["qualifier"] = "нет"): Asked => ({ object, qualifier });
const got = (what: string, by: Got["by"] = "нет", count = 1): Got => ({ what, by, count });

describe("сходится — предмет тот и признак тот", () => {
  it("открылся отчёт — готово", () => {
    expect(check(asked("отчёт"), got("отчёт-март.pdf"))).toBe("fits");
    expect(say(asked("отчёт"), got("отчёт-март.pdf"))).toContain("готово");
  });

  it("предмет по основе слова: «отчёты» и «отчёт» — одно", () => {
    expect(check(asked("отчёты"), got("отчёт-март"))).toBe("fits");
  });

  it("признак тот же — сходится", () => {
    expect(check(asked("файлы", "размер"), got("файлы", "размер", 5))).toBe("fits");
  });
});

describe("открылось не то — это не успех", () => {
  it("«открой отчёт» открыло папку — не выполнено", () => {
    // Честный отказ лучше «готово» и пустого экрана.
    const fit = check(asked("отчёт"), got("папка загрузки"));
    expect(fit).toBe("wrong-thing");
    expect(say(asked("отчёт"), got("папка загрузки"))).toContain("не то");
    expect(done(fit)).toBe(false);
  });

  it("не тот предмет останавливает план", () => {
    // Следующие шаги опираются на результат этого.
    expect(stop("wrong-thing")).toBe(true);
  });
});

describe("сделано, но не так — сказано, а не замолчано", () => {
  it("просили по размеру, нашлось по дате", () => {
    const fit = check(asked("файлы", "размер"), got("файлы", "дата", 20));
    expect(fit).toBe("wrong-way");
    expect(say(asked("файлы", "размер"), got("файлы", "дата", 20))).toContain("не так");
  });

  it("но это всё-таки сделано: шаг не провален", () => {
    // Человек сам решит, годится ли.
    expect(done("wrong-way")).toBe(true);
    expect(stop("wrong-way")).toBe(false);
  });

  it("результат не показал признак — не повод объявлять ошибку", () => {
    expect(check(asked("файлы", "размер"), got("файлы", "нет", 3))).toBe("fits");
  });
});

describe("пусто — это не «готово»", () => {
  it("нашлось ноль — сказано прямо", () => {
    const fit = check(asked("отчёт"), got("отчёт", "нет", 0));
    expect(fit).toBe("empty");
    expect(say(asked("отчёт"), got("отчёт", "нет", 0))).toContain("пусто");
    expect(done(fit)).toBe(false);
  });

  it("пусто останавливает план", () => {
    expect(stop("empty")).toBe(true);
  });
});

describe("«готово» значит «получилось»", () => {
  it("слово «готово» только при совпадении", () => {
    // Иначе его перестают читать, как и лишний вопрос.
    expect(say(asked("отчёт"), got("отчёт"))).toContain("готово");
    expect(say(asked("отчёт"), got("папка"))).not.toContain("готово");
    expect(say(asked("отчёт"), got("отчёт", "нет", 0))).not.toContain("готово");
  });
});
