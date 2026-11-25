import { describe, expect, it } from "vitest";
import { atStart, auditSteps, backupName, migrations, tooNewText, type Found } from "./schemaVersion";

/**
 * Шаг 313: схема данных с миграциями и проверкой версии при старте.
 *
 * Старая версия, открыв новый файл, молча переписывает его и теряет поля.
 */

const found = (over: Partial<Found> = {}): Found => ({ schema: 3, supported: 3, ...over });

describe("проверка версии при старте", () => {
  it("та же схема — читаем как есть", () => {
    expect(atStart(found()).step).toBe("read");
  });

  it("старее — мигрируем, но сначала копия", () => {
    const got = atStart(found({ schema: 2 }));
    expect(got.step).toBe("migrate");
    expect(got.said).toContain("сначала копия");
  });

  it("новее — не трогаем вовсе", () => {
    const got = atStart(found({ schema: 4 }));
    expect(got.step).toBe("tooNew");
    expect(got.said).toContain("не трогаем");
  });

  it("нет номера — это правка руками или порча, а не старая программа", () => {
    expect(atStart(found({ schema: Number.NaN })).step).toBe("broken");
    expect(atStart(found({ schema: 0 })).step).toBe("broken");
  });
});

describe("миграция шагами, а не прыжком", () => {
  it("1→3 идёт через 2", () => {
    expect(migrations(1, 3)).toEqual([1, 2]);
  });

  it("нечего мигрировать — пустой список", () => {
    expect(migrations(3, 3)).toEqual([]);
  });

  it("прыжок через версию ловится", () => {
    expect(auditSteps([1, 3]).join()).toContain("прыгает через версию");
  });

  it("правильные шаги проходят", () => {
    expect(auditSteps(migrations(1, 4))).toEqual([]);
  });

  it("миграция «назад» — это откат, а не миграция", () => {
    expect(auditSteps([-1]).join()).toContain("это откат");
  });
});

describe("копия находится глазами", () => {
  it("имя говорит, из какой схемы", () => {
    expect(backupName("data.json", 2)).toBe("data-схема-2.bak.json");
  });

  it("файл без расширения — тоже работает", () => {
    expect(backupName("memory", 5)).toBe("memory-схема-5.bak");
  });
});

describe("человеку про новый файл", () => {
  it("сказано «обновите», а не «ошибка чтения»", () => {
    const got = tooNewText(found({ schema: 5 }));
    expect(got).toContain("Обновите программу");
    expect(got).toContain("данные не тронуты");
    expect(got).not.toContain("ошибка чтения");
  });
});
