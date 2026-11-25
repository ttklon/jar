import { describe, expect, it } from "vitest";
import { CROWDED, audit, press, predictable, rows, type Command } from "./refuseFast";

/**
 * Шаг 286: VS Code — палитра команд и предсказуемые отказы.
 *
 * Взято: недоступная команда видна, но серая, и рядом причина. Не взято: сотни
 * команд в списке и отказ после нажатия.
 */

const command = (over: Partial<Command> = {}): Command => ({
  id: "clean",
  title: "почисти диск",
  does: "покажу, что занимает место",
  ok: true,
  why: "",
  next: "",
  ...over,
});

describe("недоступное видно, а не спрятано", () => {
  it("недоступная команда не исчезает из списка", () => {
    // Спрятанное человек ищет и решает, что функции нет.
    const got = rows([command({ ok: false, why: "нет сети", next: "включите сеть" })]);
    expect(got.length).toBe(1);
    expect(got[0]!.enabled).toBe(false);
  });

  it("недоступные уходят вниз, порядок доступных не меняется", () => {
    const got = rows([
      command({ id: "a", ok: false, why: "нет сети" }),
      command({ id: "b" }),
      command({ id: "c" }),
    ]);
    expect(got.map((row) => row.command.id)).toEqual(["b", "c", "a"]);
  });

  it("в строке написано, что будет или почему нельзя", () => {
    expect(rows([command()])[0]!.note).toBe("покажу, что занимает место");
    expect(rows([command({ ok: false, why: "нет сети", next: "включите сеть" })])[0]!.note).toBe(
      "нет сети — включите сеть",
    );
  });
});

describe("отказ приходит до нажатия, а не после", () => {
  it("серая строка не выполняется", () => {
    const got = press(rows([command({ ok: false, why: "нет сети" })])[0]!);
    expect(got.run).toBe(false);
    expect(got.said).toContain("нет сети");
  });

  it("доступная выполняется и называет действие", () => {
    const got = press(rows([command()])[0]!);
    expect(got.run).toBe(true);
    expect(got.said).toBe("покажу, что занимает место");
  });
});

describe("отказ предсказуем: одно и то же — одними словами", () => {
  it("строка и нажатие говорят одно и то же", () => {
    // Расхождение между ними — самая частая причина недоверия к палитре.
    expect(predictable([command({ ok: false, why: "нет сети", next: "включите сеть" })]).ok).toBe(true);
  });

  it("одинаковые обстоятельства — одинаковый отказ", () => {
    const list = [command({ ok: false, why: "нет прав" }), command({ id: "b" })];
    expect(predictable(list).ok).toBe(true);
    expect(predictable(list).said).toContain("одинаковы");
  });
});

describe("список не превращается в чтение", () => {
  it("больше тридцати — уже чтение", () => {
    const many = Array.from({ length: CROWDED + 1 }, (_, i) => command({ id: `c${i}` }));
    const got = audit(many);
    expect(got.ok).toBe(false);
    expect(got.said).toContain("чтение, а не выбор");
  });

  it("серое без причины читается как поломка", () => {
    const got = audit([command({ ok: false, why: "" })]);
    expect(got.ok).toBe(false);
    expect(got.said).toContain("поломка");
  });

  it("тупик честный, но назван", () => {
    const got = audit([command({ ok: false, why: "нет прав", next: "" })]);
    expect(got.ok).toBe(true);
    expect(got.said).toContain("тупик, но честный");
  });
});
