import { describe, expect, it } from "vitest";
import { MIN_FREE_BYTES, canWriteMyself, choose, describe as describeChoice, type Place } from "./diskChoice";

/**
 * Шаг 226: хранение не на системном диске, если он полон.
 *
 * Дефект был не в отсутствии проверки места — она есть в загрузчике. Дефект в
 * том, что выбора не было: всё писалось в `LOCALAPPDATA`, то есть на `C:`, и
 * когда там кончалось место, приложение отказывало, хотя рядом стоял пустой
 * `D:`. Человек при этом получал «нет места» и шёл чистить системный диск.
 */

const GB = 1024 * 1024 * 1024;

function place(drive: string, free: number | null, system = false): Place {
  return { drive, free, system };
}

describe("места хватает — ничего не меняем", () => {
  it("на текущем месте достаточно места", () => {
    const choice = choose([place("C:", 50 * GB, true)], 4 * GB);
    expect(choice.drive).toBe("C:");
    expect(choice.askHuman).toBe(false);
    // И это сказано числом, а не «всё хорошо»: «вроде работает» — та фраза,
    // после которой перестают верить.
    expect(choice.why).toContain("50,0 ГБ");
  });

  it("перенос ради красоты не предлагается", () => {
    // Работающее приложение не трогают только потому, что где-то места больше:
    // перенос — риск, и он должен быть оправдан.
    const choice = choose([place("C:", 50 * GB, true), place("D:", 900 * GB)], 4 * GB);
    expect(choice.drive).toBe("C:");
    expect(canWriteMyself(choice)).toBe(true);
  });
});

describe("системный диск полон — предлагаем другой, с числом", () => {
  it("выбирается несистемный диск, где места хватает", () => {
    const choice = choose([place("C:", 1 * GB, true), place("D:", 240 * GB)], 4 * GB);
    expect(choice.drive).toBe("D:");
    expect(choice.why).toContain("1,0 ГБ");
    expect(choice.why).toContain("240,0 ГБ");
  });

  it("перенос — решение человека, а не наше", () => {
    // Тихий перенос в чужое место — сюрприз: человек не знает, где его файлы.
    const choice = choose([place("C:", 1 * GB, true), place("D:", 240 * GB)], 4 * GB);
    expect(choice.askHuman).toBe(true);
    expect(canWriteMyself(choice)).toBe(false);
    expect(describeChoice(choice)).toContain("Предлагаю");
  });

  it("системный диск не предлагается даже когда он единственный с местом", () => {
    // Он и есть то, что кончается; предлагать его — совет чистить C:.
    //
    // Первая версия проверки была ложно-зелёной: в наборе был только C: с малым
    // местом, и `drive === null` получался сам собой, без отсечения системного
    // диска. Убираем отсечение — тест оставался зелёным. Теперь в наборе есть
    // второй системный диск **с местом**: пройти можно только отсечением.
    const choice = choose([place("C:", 1 * GB, true), place("C:", 900 * GB, true)], 4 * GB);
    expect(choice.drive).toBeNull();
    // И это не «нечего предложить»: места на 900 ГБ хватало бы, но это тот же
    // системный диск.
    expect(choice.why).toContain("900,0 ГБ");
  });

  it("из двух подходящих берётся тот, где больше места", () => {
    const choice = choose(
      [place("C:", 1 * GB, true), place("D:", 20 * GB), place("E:", 300 * GB)],
      4 * GB,
    );
    expect(choice.drive).toBe("E:");
    expect(choice.others.map((item) => item.drive)).toEqual(["D:"]);
  });
});

describe("места нет нигде — так и говорим, с числами", () => {
  it("названы все диски, а не «не получилось»", () => {
    const choice = choose([place("C:", 1 * GB, true), place("D:", 2 * GB)], 4 * GB);
    expect(choice.drive).toBeNull();
    expect(choice.why).toContain("C:");
    expect(choice.why).toContain("D:");
    expect(choice.why).toContain("4,0 ГБ");
  });

  it("«не прочитано» — это не «ноль»: разница видна человеку", () => {
    // Диск, размер которого прочитать не удалось, нельзя объявить пустым:
    // это догадка, а догадка о месте ведёт к недокачанному файлу.
    const choice = choose([place("C:", 1 * GB, true), place("D:", null)], 4 * GB);
    expect(choice.drive).toBeNull();
    expect(choice.why).toContain("не прочитано");
  });

  it("писать самовольно нельзя: `canWriteMyself` требует и диска, и согласия", () => {
    const nowhere = choose([place("C:", 0, true)], 4 * GB);
    expect(canWriteMyself(nowhere)).toBe(false);
  });
});

describe("строки для человека", () => {
  it("числа с запятой, а не с точкой", () => {
    // Русский интерфейс: «1,2 ГБ». Точка читается как чужая.
    expect(describeChoice(choose([place("C:", 1.2 * GB, true)], 4 * GB))).not.toContain("1.2");
  });

  it("минимум назван и он не ноль", () => {
    expect(MIN_FREE_BYTES).toBeGreaterThan(0);
    expect(MIN_FREE_BYTES).toBeLessThan(GB);
  });

  it("в каждой строке есть действие или причина, но не «Ошибка»", () => {
    for (const choice of [
      choose([place("C:", 50 * GB, true)], 4 * GB),
      choose([place("C:", 1 * GB, true), place("D:", 240 * GB)], 4 * GB),
      choose([place("C:", 1 * GB, true)], 4 * GB),
    ]) {
      const text = describeChoice(choice);
      expect(text).not.toContain("Ошибка");
      expect(text.length).toBeGreaterThan(20);
    }
  });
});
