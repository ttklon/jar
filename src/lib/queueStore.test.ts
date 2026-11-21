import { describe, expect, it, vi } from "vitest";
import { KEY, createWriter, load, save } from "./queueStore";
import type { QueueItem } from "./queue";

/** Хранилище в памяти: тест не должен зависеть от состояния между запусками. */
function memory(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    getItem: (key: string) => (key in data ? (data[key] as string) : null),
    setItem: (key: string, value: string) => {
      data[key] = value;
    },
    raw: () => data,
  };
}

const deed = (id: string, state: QueueItem["state"] = "waiting"): QueueItem => ({
  id,
  goal: `дело ${id}`,
  state,
  note: "",
});

describe("очередь дел на диске", () => {
  it("закрыл окно — открыл: дела на месте", () => {
    const store = memory();
    save(store, [deed("a"), deed("b")]);

    const { items } = load(store);
    expect(items.map((item) => item.id)).toEqual(["a", "b"]);
    expect(items[0]?.goal).toBe("дело a");
  });

  it("пустая очередь тоже запоминается", () => {
    // Иначе после «стоп» и перезапуска вернулись бы старые дела.
    const store = memory();
    save(store, [deed("a")]);
    save(store, []);
    expect(load(store).items).toEqual([]);
  });

  it("дело, которое шло в момент закрытия, не врёт про «идёт»", () => {
    const store = memory();
    save(store, [deed("a", "running"), deed("b")]);

    const { items, interrupted } = load(store);
    expect(interrupted).toBe(1);
    // Процесса уже нет: считать, что дело бежит, значит врать.
    expect(items[0]?.state).toBe("waiting");
    expect(items[0]?.note).toContain("перезапуск");
    // Остальные не тронуты.
    expect(items[1]?.state).toBe("waiting");
  });

  it("«нужно ваше слово» остаётся собой: его и не начинали", () => {
    const store = memory();
    save(store, [deed("a", "held")]);
    expect(load(store).items[0]?.state).toBe("held");
  });

  it("битый файл — пустая очередь, а не падение", () => {
    const store = memory({ [KEY]: "{это не json" });
    expect(load(store)).toEqual({ items: [], interrupted: 0 });

    const wrong = memory({ [KEY]: JSON.stringify({ items: [] }) });
    expect(load(wrong).items).toEqual([]);
  });

  it("чужой мусор в массиве не попадает в очередь", () => {
    const store = memory({
      [KEY]: JSON.stringify([
        { id: "a", goal: "нормальное" },
        { id: "", goal: "без номера" },
        { goal: "без номера вовсе" },
        null,
        "строка",
        { id: "b", goal: "  " },
      ]),
    });

    const { items } = load(store);
    expect(items.map((item) => item.id)).toEqual(["a"]);
    // Неизвестное состояние не выдумываем — ставим в ожидание.
    expect(items[0]?.state).toBe("waiting");
  });

  it("запись с паузой: много изменений — одна запись", () => {
    vi.useFakeTimers();
    const store = memory();
    const setItem = vi.spyOn(store, "setItem");

    const writer = createWriter(store, 100);
    writer.write([deed("a")]);
    writer.write([deed("a"), deed("b")]);
    writer.write([deed("a"), deed("b"), deed("c")]);

    // До паузы на диск ничего не ушло — иначе была бы запись на каждый чих.
    expect(setItem).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(setItem).toHaveBeenCalledTimes(1);
    // Записано последнее состояние, а не первое.
    expect(load(store).items).toHaveLength(3);

    vi.useRealTimers();
  });

  it("flush пишет немедленно: окно закрывается, ждать некогда", () => {
    const store = memory();
    const writer = createWriter(store, 10_000);
    writer.write([deed("a")]);
    writer.flush();
    // Немедленно, без ожидания паузы — иначе последняя правка потерялась бы.
    expect(load(store).items.map((item) => item.id)).toEqual(["a"]);
  });

  it("хранилище, которое отказывает, не роняет приложение", () => {
    const broken = {
      getItem: () => {
        throw new Error("запрещено");
      },
      setItem: () => {
        throw new Error("место кончилось");
      },
    };

    expect(() => save(broken, [deed("a")])).not.toThrow();
    expect(load(broken)).toEqual({ items: [], interrupted: 0 });
  });
});
