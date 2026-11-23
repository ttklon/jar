import { describe, expect, it } from "vitest";
import { parse as parseNegation, canDo } from "./negation";
import { plan, split } from "./twoDeeds";

/**
 * Шаг 90: фраза из двух дел исполняет оба и не смешивает параметры; фраза с
 * отрицанием ничего не удаляет.
 *
 * Это **стык** двух шагов (83 и 84), и ошибки на стыке дороже, чем внутри:
 * каждое правило по отдельности верно, а вместе они дают удаление того, что
 * просили не трогать.
 */

/** Что будет исполнено по фразе — дела, параметры и запрет. */
function run(phrase: string): { deeds: string[]; params: Record<string, string>[]; blocked: boolean } {
  const deeds = split(phrase);
  const negation = parseNegation(phrase);
  return {
    deeds: deeds.map((deed) => deed.text),
    // Параметры **свои у каждого дела**: «найди за март и отправь за апрель» —
    // два разных периода, и смешать их значит отправить не тот отчёт.
    params: deeds.map((deed): Record<string, string> => {
      const month = /(январ|феврал|март|апрел|ма[йя]|июн|июл|август|сентябр|октябр|ноябр|декабр)/i.exec(deed.text);
      return month ? { period: month[0].toLowerCase() } : {};
    }),
    blocked: !canDo(negation),
  };
}

describe("два дела — оба, по очереди и со своими параметрами", () => {
  it("оба дела исполняются", () => {
    const got = run("найди отчёт за март и отправь его маме");
    expect(got.deeds).toHaveLength(2);
    expect(plan(split("найди отчёт за март и отправь его маме"))).toHaveLength(2);
  });

  it("параметры не смешиваются", () => {
    // «Найди за март и отправь за апрель» — два разных периода.
    const got = run("найди отчёт за март и отправь отчёт за апрель");
    expect(got.params[0]?.period).toBe("март");
    expect(got.params[1]?.period).toBe("апрел");
    expect(got.params[0]?.period).not.toBe(got.params[1]?.period);
  });

  it("параметр первого дела не переезжает во второе", () => {
    const got = run("найди отчёт за март и отправь его маме");
    expect(got.params[0]).toEqual({ period: "март" });
    expect(got.params[1]).toEqual({});
  });

  it("порядок не переворачивается", () => {
    const got = run("найди отчёт за март и отправь его маме");
    expect(got.deeds[0]).toContain("найди");
    expect(got.deeds[1]).toContain("отправь");
  });
});

describe("отрицание — не удаляет ничего", () => {
  it("«не удаляй отчёты» — запрет, исполнения нет", () => {
    expect(run("не удаляй отчёты").blocked).toBe(true);
  });

  it("«не удаляй и не отправляй» — запрет на всё", () => {
    const got = run("не удаляй отчёты и не отправляй письма");
    expect(got.blocked).toBe(true);
  });

  it("запрет во втором деле тоже запирает", () => {
    // «Найди и не удаляй»: первое можно, второе нельзя — значит, оба дела
    // требуют подтверждения, а не «сделаю разрешённое молча».
    const got = run("найди отчёт и не удаляй его");
    expect(got.blocked).toBe(true);
  });

  it("«без копии» — не запрет: перемещение выполняется", () => {
    const got = run("перемести файлы без копии");
    expect(got.blocked).toBe(false);
  });
});

describe("стык: два дела и «не» в одном", () => {
  it("«найди, но не отправляй» — не отправляет", () => {
    // Каждое правило по отдельности верно, а вместе — удаление того, о чём
    // просили не трогать.
    expect(run("найди отчёт, но не отправляй").blocked).toBe(true);
  });

  it("ожидание не превращается в исполнение по частям", () => {
    expect(run("не отправляй, пока не проверю").blocked).toBe(true);
  });

  it("обычная фраза из двух дел без «не» проходит", () => {
    expect(run("открой папку и запусти программу").blocked).toBe(false);
  });
});
