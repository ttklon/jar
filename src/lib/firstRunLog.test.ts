// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  LOG_KEY,
  LOG_LIMIT,
  appendEvent,
  clearLog,
  isEmpty,
  readLog,
  summarize,
} from "./firstRunLog";
import type { StorageLike } from "./firstRun";

function memoryStorage(initial: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data: Record<string, string> = { ...initial };
  return {
    data,
    getItem: (key) => (key in data ? (data[key] as string) : null),
    setItem: (key, value) => {
      data[key] = value;
    },
    removeItem: (key) => {
      delete data[key];
    },
  };
}

describe("журнал первого запуска (шаг 40)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("переживает перезапуск: что было в прошлый раз — видно после него", () => {
    const storage = memoryStorage();
    appendEvent({ what: "downloaded", item: "модель разговора" }, storage);
    appendEvent({ what: "verified", item: "модель разговора", how: "hash" }, storage);
    appendEvent({ what: "deferred", item: "модель распознавания", why: "не хватает места" }, storage);

    // «Другой запуск»: то же хранилище, новый вызов.
    const summary = summarize(readLog(storage));
    expect(summary.downloaded).toEqual(["модель разговора"]);
    expect(summary.verified).toEqual(["модель разговора"]);
    expect(summary.deferred).toEqual(["модель распознавания"]);
  });

  it("проверка — отдельный факт от скачивания", () => {
    // Файл скачан, но эталона не было — хеш записан, а не сверен. Если слить
    // это с «проверено», журнал соврёт о том, чего не делал.
    const storage = memoryStorage();
    appendEvent({ what: "downloaded", item: "движок разговора" }, storage);
    appendEvent({ what: "verified", item: "движок разговора", how: "recorded" }, storage);

    const log = readLog(storage);
    expect(log).toHaveLength(2);
    expect(summarize(log).verified).toEqual(["движок разговора"]);
  });

  it("одно событие дважды подряд — один факт, а не два", () => {
    const storage = memoryStorage();
    appendEvent({ what: "downloaded", item: "модель разговора" }, storage);
    appendEvent({ what: "downloaded", item: "модель разговора" }, storage);

    expect(readLog(storage)).toHaveLength(1);
  });

  it("испорченная запись не роняет экран и не показывается как факт", () => {
    const broken = memoryStorage({ [LOG_KEY]: "это не json" });
    expect(readLog(broken)).toEqual([]);

    // Полуправда: массив, но записи в нём чужие. Понятное оставляем, прочее — нет.
    const mixed = memoryStorage({
      [LOG_KEY]: JSON.stringify([
        { what: "downloaded", item: "модель разговора" },
        { what: "придумано", item: "что-то" },
        { what: "verified", item: "" },
        null,
        { what: "deferred", item: "движок", why: "нет сети" },
      ]),
    });
    expect(readLog(mixed)).toEqual([
      { what: "downloaded", item: "модель разговора" },
      { what: "deferred", item: "движок", why: "нет сети" },
    ]);
  });

  it("журнал ограничен: это первая минута, а не летопись", () => {
    const storage = memoryStorage();
    for (let index = 0; index < LOG_LIMIT + 10; index += 1) {
      appendEvent({ what: "checked", item: `пункт ${index}`, result: "present" }, storage);
    }
    const log = readLog(storage);
    expect(log).toHaveLength(LOG_LIMIT);
    // Старое уходит, новое остаётся — журнал не должен застревать на начале.
    expect(log[log.length - 1]).toEqual({ what: "checked", item: `пункт ${LOG_LIMIT + 9}`, result: "present" });
  });

  it("сломанное хранилище — пустой журнал, а не падение", () => {
    const broken: StorageLike = {
      getItem: () => {
        throw new Error("нет доступа");
      },
      setItem: () => {
        throw new Error("нет доступа");
      },
      removeItem: () => {
        throw new Error("нет доступа");
      },
    };
    expect(readLog(broken)).toEqual([]);
    expect(appendEvent({ what: "downloaded", item: "модель" }, broken)).toBe(false);
    expect(() => clearLog(broken)).not.toThrow();
  });

  it("пустой журнал не рисует пустую карточку", () => {
    expect(isEmpty([])).toBe(true);
    expect(isEmpty([{ what: "checked", item: "движок", result: "absent" }])).toBe(false);
  });

  it("пункт проверяется отдельно от «не дошли»: отложено — это решение, а не очередь", () => {
    const storage = memoryStorage();
    // До распознавания не дошла очередь — это не «отложено».
    appendEvent({ what: "checked", item: "движок распознавания", result: "absent" }, storage);
    const summary = summarize(readLog(storage));

    expect(summary.deferred).toEqual([]);
    expect(summary.checked).toEqual(["движок распознавания"]);
  });
});
