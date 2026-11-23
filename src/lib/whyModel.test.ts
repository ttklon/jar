import { describe, expect, it } from "vitest";
import { change, complete, lines, report, REQUIRED, short, unexplained, type Fact } from "./whyModel";

/**
 * Шаг 79: отчёт «почему выбрана эта модель» на экране.
 *
 * Если причина не названа, спорить не с чем, и человек не доверяет решению.
 */
const fact = (what: string, found: string, means: string, helped = true): Fact => ({
  what,
  found,
  means,
  helped,
});

const full = () => [
  fact("память", "16 ГБ", "помещается 7B"),
  fact("совместимость", "AVX2 есть", "считать будет быстро"),
  fact("диск", "HDD", "первый запуск дольше", false),
];

describe("причина — факт о его машине, а не «мы так решили»", () => {
  it("каждая строка связывает факт и следствие", () => {
    // Не «память: 16 ГБ» отдельно и «выбрана 7B» отдельно: связь и есть объяснение.
    const said = lines(report("7B", full()));
    expect(said[0]).toContain("16 ГБ");
    expect(said[0]).toContain("помещается 7B");
  });

  it("память идёт первой: человек читает первые две строки", () => {
    const got = report("7B", [
      fact("диск", "SSD", "быстро"),
      fact("память", "16 ГБ", "помещается 7B"),
    ]);
    expect(got.facts[0]?.what).toBe("память");
  });

  it("причина проверяема: числа, которые можно сверить", () => {
    // Если проверить нельзя, это не объяснение.
    const said = lines(report("7B", full())).join(" ");
    expect(said).toContain("16 ГБ");
    expect(said).toContain("AVX2");
  });
});

describe("названы все факты, а не один", () => {
  it("отчёт полон, когда названы память и совместимость", () => {
    // Скрыть два из трёх — значит дать неполное объяснение.
    expect(complete(report("7B", full()))).toBe(true);
    expect(complete(report("7B", [fact("память", "16 ГБ", "влезает")]))).toBe(false);
  });

  it("требования отчёта названы явно", () => {
    expect(REQUIRED).toContain("память");
    expect(REQUIRED).toContain("совместимость");
  });
});

describe("сказано, что изменит решение", () => {
  it("мешающий факт назван с путём", () => {
    // «Закройте браузер — поместится 7B»: иначе объяснение констатирует, а не помогает.
    const said = change(
      report("1.5B", [fact("память", "4 ГБ", "поместится 1.5B; закройте браузер — поместится 3B", false)]),
    );
    expect(said).toContain("закройте браузер");
  });

  it("всё помогло — менять нечего", () => {
    expect(change(report("7B", full()))).not.toBeNull(); // диск мешает: первый запуск дольше
    expect(change(report("7B", [fact("память", "16 ГБ", "влезает")]))).toBeNull();
  });
});

describe("карточка — одна строка, подробности — по нажатию", () => {
  it("короткая подпись называет модель и главную причину", () => {
    const said = short(report("7B", full()));
    expect(said).toContain("7B");
    expect(said).toContain("помещается 7B");
  });
});

describe("нечем объяснить — так и сказать", () => {
  it("пустой отчёт назван ошибкой, а не решением без причины", () => {
    // «Оптимально для вас» — ошибка, которую не видно.
    const said = lines(report("7B", []));
    expect(said[0]).toContain("ошибка отчёта");
    expect(unexplained()).toContain("ошибка отчёта");
  });
});
