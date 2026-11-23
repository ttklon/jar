import { describe, expect, it } from "vitest";
import { cue, cueForState, cueWord, direction, distinguishable, totalMs, type Cue } from "./micSound";

/**
 * Шаг 52: «слушаю» и «обрабатываю» различаются на слух.
 *
 * Пока «слушаю» — можно перебить словом; после «обрабатываю» — поздно, надо
 * ждать. Человек, который не смотрит на экран, должен узнавать это без чтения.
 */
const ALL: Cue[] = ["listening", "working", "error"];

describe("звук состояния", () => {
  it("начало — подъём, конец — спуск", () => {
    // Слышно без обучения и не зависит от абсолютного слуха: разница в
    // направлении, а не в высоте.
    expect(direction("listening")).toBe("up");
    expect(direction("working")).toBe("down");
    expect(distinguishable()).toBe(true);
  });

  it("звуки не одинаковые — это проверяется, а не предполагается", () => {
    // Две одинаковые мелодии с разной длительностью перепутают; направления
    // разные — нет.
    const listening = cue("listening").map((tone) => tone.frequency).join(",");
    const working = cue("working").map((tone) => tone.frequency).join(",");
    expect(listening).not.toBe(working);
  });

  it("ошибка звучит как ошибка, а не как мелодия", () => {
    // Ошибка не должна звучать приятно: приятное пропускают. Два удара на одной
    // низкой ноте — «стоп», а не «привет».
    expect(direction("error")).toBe("flat");
    expect(cue("error").every((tone) => tone.frequency < 500)).toBe(true);
  });

  it("сигнал короткий и не задерживает речь", () => {
    // Звук — подсказка, а не пауза в разговоре.
    for (const item of ALL) {
      expect(totalMs(item)).toBeLessThan(400);
    }
  });

  it("частоты слышны на ноутбучных динамиках", () => {
    // Ниже 600 плохо слышно, выше 1000 режет слух.
    for (const item of ALL) {
      for (const tone of cue(item)) {
        expect(tone.frequency).toBeGreaterThanOrEqual(400);
        expect(tone.frequency).toBeLessThanOrEqual(900);
      }
    }
  });
});

describe("что сказать человеку", () => {
  it("названо, что звук значит, а не «сигнал включён»", () => {
    // Иначе человек слышит два звука и не знает, какой из них про что.
    expect(cueWord("listening")).toContain("слушаю");
    expect(cueWord("working")).toContain("разбираю");
    expect(cueWord("error")).toContain("не получилось");
    expect(new Set(ALL.map(cueWord)).size).toBe(3);
  });

describe("связь с состоянием микрофона", () => {
  it("звучат те состояния, где важна очередь говорить", () => {
    // «не слушаю» — покой, а не переход; «спрашиваю» — вопрос уже задан
    // голосом, второй сигнал мешает.
    expect(cueForState("listening")).toBe("listening");
    expect(cueForState("thinking")).toBe("working");
    expect(cueForState("error")).toBe("error");
    expect(cueForState("closed")).toBeNull();
    expect(cueForState("asking")).toBeNull();
  });

  it("приём и обработка не сливаются в один звук", () => {
    // Пока «принимаю» — можно перебить; после — поздно. Один звук на оба
    // состояния и есть тот дефект, который закрывает шаг.
    expect(cueForState("parsing")).not.toBe(cueForState("listening"));
    expect(cueForState("parsing")).toBe(cueForState("thinking"));
  });
});
});
