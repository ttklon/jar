import { describe, expect, it } from "vitest";
import {
  fitsHere,
  lines,
  needsWord,
  nothingFits,
  offered,
  rights,
  sizeWord,
  speedWord,
  type Card,
} from "./modelScreen";

/**
 * Шаг 71: экран моделей — размер, лицензия, требования, замер.
 *
 * Выбор здесь необратимый: скачанный файл на 4.7 ГБ занимает диск, и «ой, не
 * то» стоит часа загрузки.
 */
const card = (over: Partial<Card> = {}): Card => ({
  name: "Qwen 1.5B",
  sizeMb: 1100,
  license: "Apache-2.0",
  needsMb: 2600,
  measuredPerSecond: null,
  good: "разговор и простой план",
  ...over,
});

describe("четыре факта, по которым выбирают", () => {
  it("карточка называет размер, лицензию, требования и замер", () => {
    // Все четыре — те, по которым действительно выбирают.
    const said = lines(card(), 8192).join(" | ");
    expect(said).toContain("1.1 ГБ");
    expect(said).toContain("лицензия");
    expect(said).toContain("памяти");
    expect(said).toContain("не мерили");
  });

  it("размер по-человечески: гигабайты, а не 1100 МБ", () => {
    // 1100 МБ человек переводит в голове, и ошибается.
    expect(sizeWord(1100)).toBe("1.1 ГБ");
    expect(sizeWord(400)).toBe("400 МБ");
  });

  it("замер главнее паспорта, и «не мерили» — честный ответ", () => {
    expect(speedWord(card({ measuredPerSecond: 8.66 }))).toContain("на этой машине");
    expect(speedWord(card({ measuredPerSecond: 8.66 }))).toContain("8.7");
    expect(speedWord(card())).toBe("на этой машине не мерили");
  });

  it("лицензия стоит выше рекламы: сначала можно ли, потом что умеет", () => {
    // Если лицензия запрещает — остальное неважно.
    const said = lines(card({ license: "non-commercial" }), 8192);
    expect(said[1]).toContain("нельзя");
    expect(said[said.length - 1]).toBe(card().good);
  });
});

describe("лицензия — запрет, а не примечание", () => {
  it("Apache и MIT разрешают работу", () => {
    expect(rights("Apache-2.0").commercial).toBe(true);
    expect(rights("MIT").commercial).toBe(true);
  });

  it("некоммерческая — прямой запрет, названный словами", () => {
    // Ошибка в сторону «можно» — нарушение лицензии.
    expect(rights("CC-BY-NC-4.0").commercial).toBe(false);
    expect(rights("CC-BY-NC-4.0").said).toContain("в работе нельзя");
  });

  it("незнакомая лицензия считается запрещающей", () => {
    // Ошибка в сторону «нельзя» стоит минуты, в сторону «можно» — нарушения.
    expect(rights("SomeCustom-1.0").commercial).toBe(false);
    expect(rights("").commercial).toBe(false);
    expect(rights("").said).toContain("не указана");
  });
});

describe("что помещается на этой машине", () => {
  it("сравнение с заявкой, а не с размером файла", () => {
    // Модель в памяти — это не только веса: нужен контекст и кеш.
    expect(fitsHere(card({ needsMb: 2600 }), 4096)).toBe(true);
    expect(fitsHere(card({ needsMb: 6100 }), 4096)).toBe(false);
  });

  it("в строках сказано, помещается или нет", () => {
    expect(lines(card(), 8192)[2]).toContain("помещается");
    expect(lines(card({ needsMb: 6100 }), 4096)[2]).toContain("не помещается");
  });

  it("не помещается или нельзя — не предлагается", () => {
    // Иначе человек скачает 4 ГБ зря.
    expect(offered(card(), 8192)).toBe(true);
    expect(offered(card({ needsMb: 6100 }), 4096)).toBe(false);
    expect(offered(card({ license: "non-commercial" }), 8192)).toBe(false);
  });

  it("не подошло ничего — причина и путь, а не «моделей нет»", () => {
    expect(nothingFits(1024)).toContain("закройте");
    expect(nothingFits(1024)).toContain("1 ГБ");
  });

  it("требование называется словами, а не «2600»", () => {
    // Число в мегабайтах человек не переводит в «влезет ли».
    expect(needsWord(card({ needsMb: 2600 }))).toBe("нужно 2.5 ГБ памяти");
    expect(needsWord(card({ needsMb: 400 }))).toBe("нужно 400 МБ памяти");
  });
});
