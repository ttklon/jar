import { describe, expect, it } from "vitest";
import { STEPS, audit, diagnosis, firstAnswer, notAdvise, oneStep, type HelpStep } from "./wontStart";

/**
 * Шаг 308: инструкция «если не запускается» — три шага и диагностика.
 *
 * Человек, у которого не запускается, не знает, что из списка причин — его случай.
 */

describe("ровно три шага, каждый заканчивается фактом", () => {
  it("наша инструкция проходит проверку", () => {
    expect(audit()).toEqual([]);
    expect(STEPS.length).toBe(3);
  });

  it("у каждого шага сказано, что человек увидит", () => {
    expect(STEPS.every((step) => step.see.length > 15)).toBe(true);
  });

  it("первый шаг ведёт в журнал, а не к списку причин", () => {
    expect(STEPS[0]!.do).toContain("журнал первого запуска");
  });

  it("пять шагов — уже не дочитывают", () => {
    const long: HelpStep[] = STEPS.concat([
      { order: 4, do: "проверьте драйверы видеокарты", see: "в диспетчере устройств нет жёлтых значков" },
      { order: 5, do: "проверьте реестр", see: "ветка HKCU на месте" },
    ]);
    expect(audit(long).join()).toContain("должно быть три");
  });

  it("«переустановите» — не шаг", () => {
    const bad = STEPS.map((step) => (step.order === 3 ? { ...step, do: "переустановите программу" } : step));
    expect(audit(bad).join()).toContain("стирает следы");
  });

  it("«попробуйте» — тоже не шаг", () => {
    const bad = STEPS.map((step) => (step.order === 1 ? { ...step, do: "попробуйте запустить ещё раз" } : step));
    expect(audit(bad).join()).toContain("нужен факт");
  });

  it("шаг без «что увидеть» — не проверяем", () => {
    const bad = STEPS.map((step) => (step.order === 2 ? { ...step, see: "смотрите" } : step));
    expect(audit(bad).join()).toContain("что человек должен увидеть");
  });
});

describe("первый ответ — одно действие", () => {
  it("причина известна — она и первый шаг", () => {
    const got = firstAnswer("нет WebView2");
    expect(got).toContain("нет WebView2");
    expect(got).toContain("поставить WebView2");
  });

  it("неизвестна — ведём в журнал, а не перечисляем причины", () => {
    const got = firstAnswer(null);
    expect(got).toContain("журнал");
    expect(got).not.toMatch(/возможно|в некоторых случаях/i);
  });
});

describe("шаг под причину, а не коды", () => {
  it("WebView2", () => {
    expect(oneStep("ошибка: WebView2 не найден")).toContain("без перезагрузки");
  });

  it("место на диске", () => {
    expect(oneStep("мало места на диске")).toContain("другой диск");
  });

  it("неизвестная причина — отчёт, а не угадывание", () => {
    expect(oneStep("что-то пошло не так")).toContain("прислать отчёт");
  });
});

describe("чего инструкция не советует", () => {
  it("три вредных совета названы", () => {
    const got = notAdvise().join();
    expect(got).toContain("антивирус");
    expect(got).toContain("переустановить");
    expect(notAdvise().length).toBe(3);
  });
});

describe("диагностика — то же, что человек видел бы глазами", () => {
  it("четыре строки, включая последнюю ошибку", () => {
    const got = diagnosis({ windows: "Windows 10 22H2", webView2: false, user: "anna" }, "нет WebView2");
    expect(got.split("\n").length).toBe(4);
    expect(got).toContain("WebView2: нет");
  });

  it("нет записей — это тоже факт", () => {
    expect(diagnosis({ windows: "Windows 11", webView2: true, user: "ivan" }, null)).toContain("не дошла до журнала");
  });
});
