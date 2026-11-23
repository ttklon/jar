import { describe, expect, it } from "vitest";
import {
  downloadable,
  freeMb,
  freeWord,
  mark,
  nothing,
  numbers,
  SAFE_SPARE,
  verdict,
} from "./tooBig";

/**
 * Шаг 73: отметка «модель не влезает в память» до скачивания.
 *
 * Иначе человек скачивает 4.7 ГБ, ждёт полчаса и узнаёт о нехватке памяти
 * после.
 */
const gb = (value: number) => value * 1024;

describe("не влезает — сказано до скачивания", () => {
  it("не влезает — отметка стоит на карточке, а не в справке", () => {
    // Видно там, где принимают решение.
    const said = mark({ needsMb: gb(6), hasMb: gb(4) });
    expect(said).toContain("не помещается");
  });

  it("названы числа: сколько нужно и сколько есть", () => {
    // Иначе не понять, «чуть-чуть» или «втрое».
    const said = mark({ needsMb: gb(6), hasMb: gb(4) });
    expect(said).toContain("нужно 6 ГБ");
    expect(said).toContain("есть 4 ГБ");
    // И дробное число не теряется: 6.1 не превращается в 6.
    expect(numbers({ needsMb: gb(6.1), hasMb: gb(4) })).toContain("6.1 ГБ");
    expect(numbers({ needsMb: gb(6.1), hasMb: gb(4) })).toContain("нужно");
  });

  it("назван путь, а не только запрет", () => {
    // Отметка без пути — это запрет, а не помощь.
    const said = mark({ needsMb: gb(6), hasMb: gb(4) });
    expect(said).toContain("закройте");
    expect(said).toContain("поменьше");
  });

  it("нельзя скачивать только когда не влезает", () => {
    // Скачивание — полчаса и гигабайты; проба должна стоить двух чисел.
    expect(downloadable({ needsMb: gb(6), hasMb: gb(4) })).toBe(false);
    expect(downloadable({ needsMb: gb(1.9), hasMb: gb(8) })).toBe(true);
  });
});

describe("«влезает в притык» — не «влезает»", () => {
  it("притык назван предупреждением, а не разрешением", () => {
    // Под нагрузкой такой запас исчезает.
    const said = mark({ needsMb: gb(4), hasMb: gb(4.2) });
    expect(said).toContain("притык");
    expect(said).toContain("подтормаживать");
  });

  it("с запасом — помещается", () => {
    expect(mark({ needsMb: gb(4), hasMb: gb(8) })).toContain("помещается");
    expect(verdict({ needsMb: gb(4), hasMb: gb(4) * (1 + SAFE_SPARE) })).toBe("fits");
  });

  it("притык не запрещается: это выбор человека", () => {
    // Запрещать притык значит решать за него; не предупредить — обманывать.
    expect(downloadable({ needsMb: gb(4), hasMb: gb(4.2) })).toBe(true);
  });
});

describe("сколько освободить — числом", () => {
  it("названо, сколько не хватает, с запасом", () => {
    // «Закройте программы» без числа не говорит, хватит ли закрыть браузер.
    const need = freeMb({ needsMb: gb(6), hasMb: gb(4) });
    expect(need).toBeGreaterThan(gb(2));
    expect(freeWord({ needsMb: gb(6), hasMb: gb(4) })).toContain("освободите");
  });

  it("влезает — освобождать нечего", () => {
    expect(freeMb({ needsMb: gb(1.9), hasMb: gb(8) })).toBe(0);
    expect(freeWord({ needsMb: gb(1.9), hasMb: gb(8) })).toBeNull();
  });
});

describe("не влезает ничего — причина и путь", () => {
  it("названо, что делать, а не «железо не подходит»", () => {
    // Чаще всего память занята браузером, и это решается.
    const said = nothing();
    expect(said).toContain("закройте");
    expect(said).toContain("браузер");
  });
});
