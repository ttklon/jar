import { describe, expect, it } from "vitest";
import { KEPT, TOUCHED, consistent, gigabytes, plan, promise } from "./reinstall";

/**
 * Шаг 219: приложение работает после переустановки — без сети и без повторной
 * загрузки модели.
 *
 * Модели лежат внутри папки данных приложения, и «удалите данные и поставьте
 * заново» стирает часы скачивания. Проверяется, что ответ это учитывает.
 */

const model = { file: "qwen.gguf", sha256: "a".repeat(64) };

describe("что переустановка трогает и что нет", () => {
  it("модели названы отдельно, а не словом «данные»", () => {
    // «Данные» каждый понимает по-своему, и обычно уже, чем нужно.
    expect(KEPT.join(" ")).toContain("модели");
    expect(TOUCHED.join(" ")).toContain("программа");
    expect(TOUCHED.join(" ")).toContain("движок");
  });

  it("обещание перечисляет и то, и другое", () => {
    const text = promise();
    expect(text).toContain("Не трогает");
    expect(text).toContain("не качается заново");
  });
});

describe("без сети — запуск не ломается", () => {
  it("всё на месте: разговор сразу, и сеть не нужна", () => {
    const got = plan({ model, expected: model.sha256, engine: true }, false);
    expect(got.canStart).toBe(true);
    expect(got.download).toEqual([]);
    expect(got.said).toContain("сеть для этого не нужна");
  });

  it("модели нет и сети нет: сказано, что не выйдет, и что всё равно работает", () => {
    const got = plan({ model: null, expected: null, engine: true }, false);
    expect(got.canStart).toBe(false);
    expect(got.said).toContain("сети нет");
    // И не сваливает вину за всё приложение: история и действия работают.
    expect(got.said).toContain("история, настройки");
  });

  it("модель есть, движка нет: качать сотни мегабайт, а не гигабайты", () => {
    const got = plan({ model, expected: model.sha256, engine: false }, true);
    expect(got.download).toEqual(["движок"]);
    expect(got.said).toContain("не качается заново");
    expect(gigabytes(got, 4, 0.2)).toBeCloseTo(0.2);
  });
});

describe("модель не качается заново", () => {
  it("хеш сошёлся — ноль гигабайт", () => {
    const got = plan({ model, expected: model.sha256, engine: true }, true);
    expect(gigabytes(got, 4, 0.2)).toBe(0);
  });

  it("эталона нет — запускать можно, но «тот самый» не доказано", () => {
    const got = plan({ model, expected: null, engine: true }, true);
    expect(got.canStart).toBe(true);
    expect(got.said).toContain("эталона хеша нет");
  });

  it("хеш не совпал — предупредить до разговора, а не молчать", () => {
    const got = plan({ model, expected: "b".repeat(64), engine: true }, true);
    expect(got.said).toContain("хеш не совпал");
    expect(got.canStart).toBe(true);
  });
});

describe("ответы не противоречат друг другу", () => {
  it("три частичных состояния — три разных ответа", () => {
    const answers = [
      plan({ model: null, expected: null, engine: true }, true).said,
      plan({ model, expected: model.sha256, engine: false }, true).said,
      plan({ model, expected: model.sha256, engine: true }, true).said,
    ];
    expect(new Set(answers).size).toBe(3);
  });

  it("«не качается заново» и «скачать модель» в одном ответе — ловушка", () => {
    const broken = { canStart: false, download: ["модель"], said: "модель не качается заново" };
    expect(consistent(broken).ok).toBe(false);
    expect(consistent(broken).why).toContain("не качается заново");
  });

  it("«можно начать» и «скачать модель» одновременно — ловушка тоже", () => {
    expect(consistent({ canStart: true, download: ["модель"], said: "" }).ok).toBe(false);
  });
});
