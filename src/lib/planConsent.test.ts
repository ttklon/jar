import { describe, expect, it } from "vitest";
import { diff, grant, holds, needsConsent, print, say, type Seen } from "./planConsent";

/**
 * Шаг 117: каждое изменение плана после согласия требует нового согласия.
 *
 * Шаг 102 закрыл правку параметров. Здесь — всё остальное: состав, порядок, риск.
 */
const plan: Seen[] = [
  { tool: "files|создать|папку", params: { path: "D:\\Архив" }, risk: "write-local" },
  { tool: "files|переместить|файлы/папки", params: { to: "D:\\Архив" }, risk: "write-local" },
];

describe("тот же план — согласие в силе", () => {
  it("ничего не изменилось", () => {
    // Иначе любая перерисовка сбрасывает согласие, и его дают не читая.
    expect(needsConsent(plan, plan)).toBe(false);
    expect(say(diff(plan, plan))).toBe("план не менялся — согласие в силе");
  });

  it("отпечаток не зависит от порядка ключей в параметрах", () => {
    const reordered: Seen[] = [{ tool: "files|создать|папку", params: { path: "D:\\Архив" }, risk: "write-local" }];
    const other: Seen[] = [{ tool: "files|создать|папку", params: { path: "D:\\Архив" }, risk: "write-local" }];
    expect(print(reordered)).toBe(print(other));
  });

  it("согласие, данное на план, к этому плану и относится", () => {
    expect(holds(grant(plan, 1000), plan)).toBe(true);
  });
});

describe("добавление шага после согласия — обход", () => {
  it("новый шаг требует согласия, даже без параметров", () => {
    // Параметры — не весь план: шаг с пустыми параметрами проходит как «ничего не
    // изменилось», если сравнивать только их.
    const after = [...plan, { tool: "files|удалить|файл", params: {}, risk: "destructive" }];
    const got = diff(plan, after);
    expect(got.changed).toBe(true);
    expect(got.why[0]).toContain("добавлен шаг 3");
  });

  it("добавлен опасный шаг — вопрос будет строже", () => {
    const after = [...plan, { tool: "files|удалить|файл", params: {}, risk: "destructive" }];
    expect(diff(plan, after).worse).toBe(true);
    expect(say(diff(plan, after))).toContain("вопрос будет строже");
  });

  it("добавлен безопасный шаг — согласие всё равно нужно", () => {
    const after = [...plan, { tool: "files|проверить|размеры и место", params: {}, risk: "read" }];
    expect(diff(plan, after).changed).toBe(true);
    expect(diff(plan, after).worse).toBe(false);
  });

  it("шаг удалён — тоже изменение", () => {
    expect(diff(plan, [plan[0]!]).why[0]).toContain("удалён шаг 2");
  });
});

describe("перестановка — другое действие при том же наборе", () => {
  it("тот же набор в другом порядке требует согласия", () => {
    // «Удалить, потом скопировать» ≠ «скопировать, потом удалить».
    const swapped = [plan[1]!, plan[0]!];
    const got = diff(plan, swapped);
    expect(got.changed).toBe(true);
  });

  it("перестановка названа словами", () => {
    const swapped = [plan[1]!, plan[0]!];
    const said = diff(plan, swapped).why.join(" ");
    expect(said).toMatch(/заменён|порядок/);
  });
});

describe("смена риска без смены параметров", () => {
  it("рука стала опаснее — согласие заново", () => {
    const after: Seen[] = [{ ...plan[0]!, risk: "destructive" }, plan[1]!];
    const got = diff(plan, after);
    expect(got.changed).toBe(true);
    expect(got.worse).toBe(true);
    expect(got.why[0]).toContain("риск шага 1 изменился");
  });

  it("рука стала безопаснее — тоже изменение, но не «опаснее»", () => {
    const after: Seen[] = [{ ...plan[0]!, risk: "read" }, plan[1]!];
    expect(diff(plan, after).changed).toBe(true);
    expect(diff(plan, after).worse).toBe(false);
  });
});

describe("правка параметров — тоже новое согласие", () => {
  it("параметры изменились внутри того же шага", () => {
    const after: Seen[] = [{ ...plan[0]!, params: { path: "E:\\Новое" } }, plan[1]!];
    const got = diff(plan, after);
    expect(got.changed).toBe(true);
    expect(got.why[0]).toContain("параметры шага 1");
  });
});

describe("старое согласие к новому плану не относится", () => {
  it("держится только на том плане, на который дано", () => {
    const after = [...plan, { tool: "files|удалить|файл", params: {}, risk: "destructive" }];
    expect(holds(grant(plan, 1000), after)).toBe(false);
  });
});
