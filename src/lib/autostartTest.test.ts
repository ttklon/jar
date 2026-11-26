import { describe, expect, it } from "vitest";
import { command, disable, ENTRY_NAME, enable, launches, notDo, steps, type Registry } from "./autostartTest";

/**
 * Шаг 450: тест — автозапуск включается и выключается, запись одна, без дублей.
 */

const empty = (): Registry => ({ entries: [] });
const target = "C:\\Program Files\\ZShelper\\ZShelper.exe";

describe("жизненный цикл: одна запись на каждом шаге", () => {
  it("1. выключен — записи нет", () => {
    expect(empty().entries).toHaveLength(0);
    expect(launches(empty()).count).toBe(0);
  });

  it("2. включили — ровно одна", () => {
    const got = enable(empty(), target);
    expect(got.registry.entries).toHaveLength(1);
    expect(launches(got.registry).ok).toBe(true);
  });

  it("3. включили ещё раз — по-прежнему одна", () => {
    const once = enable(empty(), target).registry;
    const twice = enable(once, target);
    expect(twice.registry.entries).toHaveLength(1);
    expect(twice.said).toContain("ничего не меняю");
  });

  it("4. выключили — записи нет", () => {
    const on = enable(empty(), target).registry;
    expect(disable(on).registry.entries).toHaveLength(0);
  });

  it("5. включили после выключения — одна, а не две", () => {
    const off = disable(enable(empty(), target).registry).registry;
    expect(enable(off, target).registry.entries).toHaveLength(1);
  });
});

describe("путь изменился — замена, а не добавление", () => {
  it("переустановка в другую папку", () => {
    const old = enable(empty(), "C:\\Old\\ZShelper.exe").registry;
    const moved = enable(old, "C:\\New\\ZShelper.exe");
    expect(moved.registry.entries).toHaveLength(1);
    expect(moved.said).toContain("заменена, а не добавлена");
  });
});

describe("дубли от старой версии — выключение убирает все", () => {
  it("две записи — обе убраны и названы числом", () => {
    const doubled: Registry = { entries: [{ name: ENTRY_NAME, command: '"C:\\old\\Z.exe"' }, { name: ENTRY_NAME, command: command(target) }] };
    const got = disable(doubled);
    expect(got.registry.entries).toHaveLength(0);
    expect(got.said).toContain("убрано 2 записи");
  });

  it("две копии при входе — названный дефект", () => {
    const doubled: Registry = { entries: [{ name: ENTRY_NAME, command: "a" }, { name: ENTRY_NAME, command: "b" }] };
    const got = launches(doubled);
    expect(got.ok).toBe(false);
    expect(got.said).toContain("спорить за горячие клавиши");
  });
});

describe("команда запуска", () => {
  it("путь в кавычках и тихий старт", () => {
    expect(command(target)).toBe(`"${target}" --minimized`);
  });

  it("имя записи без версии", () => {
    expect(ENTRY_NAME).toBe("ZShelper");
  });
});

describe("что проверяет тест", () => {
  it("пять шагов жизненного цикла", () => {
    expect(steps()).toHaveLength(5);
  });

  it("три реальных дефекта", () => {
    const got = notDo().join();
    expect(got).toContain("обновление не должно добавлять вторую копию");
    expect(got).toContain("дубли от старой версии останутся");
  });
});
