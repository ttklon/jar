import { describe, expect, it } from "vitest";
import {
  REASON_ACTION,
  REASON_TEXT,
  UNKNOWN_REASON,
  ownerOf,
  reasonLine,
  reasonOf,
  type Reason,
} from "./reason";

/**
 * Шаги 14 и 15: один словарь причин и одни слова на всех экранах.
 *
 * Дефект был не в том, что отказ не объясняли, а в том, что объясняли
 * **по-разному**: `no-room`, «не хватает диска» и «мало свободного» читались как
 * три разные беды. Человек учится один раз — но только если слова одни.
 */
const ALL: Reason[] = ["no-program", "no-rights", "no-room", "no-network", "by-policy", "stopped"];

describe("словарь причин", () => {
  it("шесть причин, и каждая названа своими словами", () => {
    expect(ALL).toHaveLength(6);
    const words = ALL.map((reason) => REASON_TEXT[reason]);
    expect(new Set(words).size).toBe(6);
  });

  it("у каждой причины есть конкретный шаг, а не «повторите позже»", () => {
    // Совет, который нельзя выполнить, — это не помощь.
    for (const reason of ALL) {
      const action = REASON_ACTION[reason];
      expect(action.length).toBeGreaterThan(10);
      expect(action.toLowerCase()).not.toContain("попробуйте позже");
    }
  });

  it("остановка человеком — не поломка", () => {
    // Иначе «Стоп» превращается в ошибку, и человека обвиняют в том, что он
    // сделал осознанно.
    expect(ownerOf("stopped")).toBe("choice");
    expect(REASON_TEXT.stopped).not.toContain("ошибка");
    expect(REASON_TEXT.stopped).not.toContain("не вышло");
  });
});

describe("перевод системного текста в одну причину", () => {
  it("одна причина узнаётся по всем своим обличьям", () => {
    // Windows, PowerShell, node и Chromium называют одно и то же по-разному.
    const same = ["Access is denied", "EACCES: permission denied", "запустите от администратора"];
    expect(same.map((text) => reasonOf(new Error(text)))).toEqual([
      "no-rights",
      "no-rights",
      "no-rights",
    ]);
  });

  it("нет места узнаётся так же, как нет сети, — по смыслу", () => {
    expect(reasonOf(new Error("ENOSPC: no space left on device"))).toBe("no-room");
    expect(reasonOf(new Error("недостаточно места на диске"))).toBe("no-room");
    expect(reasonOf(new Error("ERR_INTERNET_DISCONNECTED"))).toBe("no-network");
    expect(reasonOf(new Error("нет подключения к сети"))).toBe("no-network");
  });

  it("права важнее сети: отказ доступа не лечится повтором", () => {
    // `net::ERR_ACCESS_DENIED` — и права, и сеть. Повторять бессмысленно, а
    // значит причина — права.
    expect(reasonOf(new Error("net::ERR_ACCESS_DENIED(-138)"))).toBe("no-rights");
  });

  it("неизвестное остаётся неизвестным, а не становится «нет сети»", () => {
    // Именно так и появлялись неправильные объяснения: на всё подряд вешали
    // одну причину.
    expect(reasonOf(new Error("что-то пошло не так"))).toBeNull();
    expect(reasonOf(new Error(""))).toBeNull();
    expect(reasonOf(null)).toBeNull();
    // И для человека есть отдельная фраза, а не тишина.
    expect(UNKNOWN_REASON).toContain("не удалось узнать");
  });
});

describe("одна фраза везде", () => {
  it("сначала факт, потом действие", () => {
    // Обратный порядок читается как совет без объяснения.
    const line = reasonLine("no-room");
    expect(line.indexOf(REASON_TEXT["no-room"])).toBeLessThan(line.indexOf(REASON_ACTION["no-room"]));
  });

  it("фраза одна и та же на любом экране — она функция, а не текст на месте", () => {
    // Разные экраны вызывают одно правило, поэтому слова не разъезжаются.
    expect(reasonLine("no-program")).toBe(reasonLine("no-program"));
    // И это одна строка: отказ читают одним взглядом, а не собирают из частей.
    // Тире внутри «нельзя по правилу» — часть слов, поэтому сверяем концы, а не
    // считаем дефисы.
    const line = reasonLine("by-policy");
    expect(line.startsWith(REASON_TEXT["by-policy"])).toBe(true);
    expect(line.endsWith(REASON_ACTION["by-policy"])).toBe(true);
    expect(line).not.toContain("\n");
  });
});
