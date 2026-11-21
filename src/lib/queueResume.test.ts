import { describe, expect, it } from "vitest";
import { setResumeAt, type QueueItem } from "./queue";
import { load, KEY } from "./queueStore";

/**
 * Продолжение с места остановки: шаг 150 плана.
 *
 * Проверяется то, что решает, повторится ли уже сделанное. Ошибка здесь дорога:
 * продолжить с начала — значит второй раз создать папку или второй раз удалить
 * файл, а этого человек не просил.
 */

const item = (extra: Partial<QueueItem> = {}): QueueItem => ({
  id: "a",
  goal: "разложи документы",
  state: "failed",
  note: "остановилось на шаге 3",
  ...extra,
});

describe("точка продолжения в деле", () => {
  it("запоминается числом шага", () => {
    const [next] = setResumeAt([item()], "a", 3);
    expect(next!.resumeAt).toBe(3);
  });

  it("шаг 1 не запоминается: это и есть начало", () => {
    // Хранить «продолжаю с шага 1» значит хранить «начинаю заново» под чужим именем.
    const [next] = setResumeAt([item({ resumeAt: 4 })], "a", 1);
    expect(next!.resumeAt).toBeUndefined();
  });

  it("мусор стирает прежнюю точку, а не оставляет старую", () => {
    for (const bad of [null, undefined, 0, -2, 2.5, Number.NaN]) {
      const [next] = setResumeAt([item({ resumeAt: 5 })], "a", bad as number | null | undefined);
      expect(next!.resumeAt, String(bad)).toBeUndefined();
    }
  });

  it("другие дела не трогаются", () => {
    const other = item({ id: "b" });
    const next = setResumeAt([item(), other], "a", 2);
    expect(next[1]).toBe(other);
  });
});

describe("точка продолжения переживает закрытие окна", () => {
  const store = () => {
    const map = new Map<string, string>();
    return {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => void map.set(key, value),
    };
  };

  it("после перезапуска пометка говорит «с шага 3», а не «заново»", () => {
    const memory = store();
    memory.setItem(
      KEY,
      JSON.stringify([
        { id: "a", goal: "разложи документы", state: "running", note: "", resumeAt: 3 },
      ]),
    );

    const { items } = load(memory);
    const first = items[0]!;
    expect(first.state).toBe("waiting");
    expect(first.resumeAt).toBe(3);
    // Обещание в тексте совпадает с делом: продолжаю с шага, а не заново.
    expect(first.note).toContain("с шага 3");
    expect(first.note).not.toContain("заново");
  });

  it("без точки продолжения пометка честно говорит «заново»", () => {
    const memory = store();
    memory.setItem(KEY, JSON.stringify([{ id: "a", goal: "дело", state: "running", note: "" }]));

    const { items } = load(memory);
    expect(items[0]!.note).toContain("заново");
  });
});
