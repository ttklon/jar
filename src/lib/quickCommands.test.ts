import { describe, expect, it } from "vitest";
import { checkName, create, needsConfirm, normal, offer, OFTEN, preview, say, suggest, type Quick } from "./quickCommands";

/**
 * Шаг 99: собирать частые фразы в «быстрые команды» без кода.
 *
 * Человек говорит одно и то же каждый день, и каждый раз это фраза целиком.
 */
const heard = (phrase: string, times: number) => Array.from({ length: times }, () => ({ heard: phrase }));
const quick = (name: string, phrase: string, dangerous = false): Quick => ({ name, phrase, dangerous, times: OFTEN });

describe("команда появляется из повтора, а не из настройки", () => {
  it("три раза — предложение, два раза — нет", () => {
    // Появиться должна сама, без кода.
    expect(suggest(heard("покажи, что занимает место", 3), [])).toHaveLength(1);
    expect(suggest(heard("покажи, что занимает место", 2), [])).toHaveLength(0);
    expect(OFTEN).toBe(3);
  });

  it("частые идут первыми", () => {
    const got = suggest([...heard("редкая", 3), ...heard("частая", 9)], []);
    expect(got[0]?.phrase).toBe("частая");
  });

  it("регистр и лишние пробелы не делают фразу другой", () => {
    expect(normal("Найди  отчёт")).toBe("найди отчет");
    const got = suggest([{ heard: "найди отчёт" }, { heard: "Найди  отчёт" }, { heard: "найди отчёт" }], []);
    expect(got).toHaveLength(1);
    expect(got[0]?.times).toBe(3);
  });

  it("уже сокращённое не предлагается дважды", () => {
    const got = suggest(heard("почисти", 5), [quick("мойка", "почисти")]);
    expect(got).toHaveLength(0);
  });
});

describe("имя выбирает человек, а не приложение", () => {
  it("«очистка диска C:» — наше слово, его не вспомнят", () => {
    const bad = checkName("очистка диска C:", []);
    expect(bad.ok).toBe(false);
    expect(bad.why).toContain("короче");
  });

  it("занятое слово не переиспользуется", () => {
    const clash = checkName("мойка", [quick("мойка", "почисти")]);
    expect(clash.ok).toBe(false);
    expect(clash.why).toContain("уже значит");
  });

  it("пустое слово не годится", () => {
    expect(checkName("", []).ok).toBe(false);
  });

  it("хорошее слово принимается и названо своим", () => {
    const good = checkName("мойка", []);
    expect(good.ok).toBe(true);
    expect(good.why).toContain("я его не придумываю");
  });
});

describe("сокращение не скрывает действие", () => {
  it("показано, что стоит за словом", () => {
    // «Мойка» однажды может удалить не то.
    expect(preview(quick("мойка", "почисти корзину"))).toContain("почисти корзину");
  });

  it("опасное остаётся опасным даже в одно слово", () => {
    // Сокращение — удобство записи, а не разрешение.
    const item = quick("снос", "удали всё", true);
    expect(needsConfirm(item)).toBe(true);
    expect(preview(item)).toContain("необратимо");
  });

  it("создание передаёт опасность, а не выводит её", () => {
    const made = create("снос", { phrase: "удали всё", times: 5, taken: false, why: "" }, true, []);
    expect(Array.isArray(made)).toBe(true);
    if (Array.isArray(made)) expect(made[0]?.dangerous).toBe(true);
  });

  it("плохое имя не создаёт команду", () => {
    const made = create("", { phrase: "почисти", times: 3, taken: false, why: "" }, false, []);
    expect(Array.isArray(made)).toBe(false);
  });
});

describe("предложение — один раз, а не назойливо", () => {
  it("первый раз предлагаем", () => {
    expect(offer([], "почисти")).toBe(true);
  });

  it("второй раз — нет: навязчивое отключают вместе с функцией", () => {
    expect(offer(["почисти"], "почисти")).toBe(false);
  });
});

describe("сказано, что за словом", () => {
  it("пустой список говорит, откуда появятся команды", () => {
    expect(say([])).toContain("появятся из фраз");
  });

  it("команда названа вместе с фразой", () => {
    expect(say([quick("мойка", "почисти корзину")])).toContain("мойка");
    expect(say([quick("мойка", "почисти корзину")])).toContain("почисти корзину");
  });
});
