import { describe, expect, it } from "vitest";
import { checks, examples, notRun, screen } from "./firstScreen";

/**
 * Шаг 379: нет дел — три примера фраз и поле ввода. Не пусто.
 */

describe("три примера разных жанров", () => {
  it("ровно три", () => {
    expect(examples().length).toBe(3);
  });

  it("жанры не повторяются", () => {
    expect(new Set(examples().map((e) => e.kind)).size).toBe(3);
  });

  it("первый — самый безопасный, а не удаление", () => {
    expect(examples()[0]!.kind).toBe("safe");
    expect(examples()[0]!.what).toContain("ничего не меняю");
  });

  it("у дела с файлами сказано, что будет список до удаления", () => {
    expect(examples()[1]!.what).toContain("спрошу");
  });

  it("расписание не запускается само", () => {
    expect(examples()[2]!.what).toContain("с вашего согласия");
  });
});

describe("поле ввода активно сразу", () => {
  it("без «начните с примера»", () => {
    expect(screen().input).toBe(true);
  });

  it("имя известно — обращение, иначе без «Пользователь»", () => {
    expect(screen("Анна").hint).toBe("Анна, что сделать? Можно своими словами — я переспрошу, если не пойму");
    expect(screen().hint.startsWith("что сделать?")).toBe(true);
  });

  it("кнопки «Начать» нет", () => {
    expect(screen().startButton).toBe(false);
  });
});

describe("проверки пустого экрана", () => {
  it("наш экран проходит все проверки", () => {
    expect(checks(screen())).toEqual([]);
  });

  it("неактивное поле — замечание", () => {
    expect(checks({ ...screen(), input: false }).join()).toContain("неактивно");
  });

  it("два примера — замечание", () => {
    expect(checks({ ...screen(), examples: examples().slice(0, 2) }).join()).toContain("а нужно три");
  });

  it("три примера одного жанра — замечание", () => {
    const same = examples().map((e) => ({ ...e, kind: "safe" as const }));
    expect(checks({ ...screen(), examples: same }).join()).toContain("примеры одного жанра");
  });

  it("страшный первый пример — замечание", () => {
    const bad = [{ ...examples()[1]! }, examples()[0]!, examples()[2]!];
    expect(checks({ ...screen(), examples: bad }).join()).toContain("приглашение нажать опасное");
  });
});

describe("пример подставляет фразу, а не выполняет", () => {
  it("так и сказано", () => {
    expect(notRun()).toContain("подставляет фразу в поле");
  });
});
