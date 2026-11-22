import { describe, expect, it } from "vitest";
import { checkFirstRun, named, pendingSteps, summarizeFirstRun } from "./firstRunCheck";
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

const ALL_PASSED = {
  "zshelper.welcome.seen": "1",
  "zshelper.mic.explained": "1",
  "zshelper.person.asked": "1",
};

describe("второй запуск проверяет, что первый остался пройденным (шаг 27)", () => {
  it("пройденный путь назван пройденным, и хвалить нечего", () => {
    const verdicts = checkFirstRun(memoryStorage(ALL_PASSED));

    expect(verdicts.map((item) => item.state)).toEqual(["done", "done", "done"]);
    // Пустой совет у пройденного: строка «всё хорошо» на каждый запуск — шум.
    expect(verdicts.every((item) => item.advice === "")).toBe(true);
    expect(summarizeFirstRun(verdicts)).toEqual({ done: 3, total: 3, missing: [] });
  });

  it("непройденное названо, и у него есть действие", () => {
    const verdicts = checkFirstRun(
      memoryStorage({ "zshelper.welcome.seen": "1" }),
    );

    const missing = pendingSteps(verdicts);
    expect(missing).toEqual(["mic", "name"]);
    // Провал без действия — ещё один отказ текстом (шаг 25).
    for (const item of verdicts.filter((row) => row.state !== "done")) {
      expect(item.advice.length).toBeGreaterThan(20);
    }
  });

  it("«не проверено» — это не «провалено» и не «пройдено»", () => {
    // Хранилища нет вовсе: браузер без localStorage, чужой профиль, сбой.
    const verdicts = checkFirstRun(null);
    expect(verdicts.every((item) => item.state === "unknown")).toBe(true);

    // И это честно не попадает в «пройдено».
    const summary = summarizeFirstRun(verdicts);
    expect(summary.done).toBe(0);
    expect(summary.total).toBe(3);
  });

  it("сломанное хранилище — «не проверено», а не падение", () => {
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
    const verdicts = checkFirstRun(broken);
    // Хранилище есть, но не читается: «не сделано» было бы обвинением человека.
    expect(verdicts.every((item) => item.state === "not-done")).toBe(true);
  });

  it("отказ называть имя не считается непройденным путём (шаг 38)", () => {
    // Спрашивали, но имени нет — это выбор, а не поломка.
    const storage = memoryStorage({ ...ALL_PASSED });
    delete storage.data["zshelper.person.name"];

    const verdicts = checkFirstRun(storage);
    expect(verdicts.find((item) => item.step === "name")?.state).toBe("done");
    expect(named(storage)).toBe(false);
  });

  it("имя видно отдельно: по нему приложение обращается по-человечески", () => {
    expect(named(memoryStorage({ "zshelper.person.name": "Аня" }))).toBe(true);
    expect(named(memoryStorage({ "zshelper.person.name": "" }))).toBe(false);
    expect(named(null)).toBe(false);
  });
});
