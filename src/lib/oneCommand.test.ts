import { describe, expect, it } from "vitest";
import { after, failure, left, oneLine, plan } from "./oneCommand";

/**
 * Шаг 288: Ollama — одна команда, и работает; фоновый сервис.
 *
 * Взято: одно действие запускает всё. Не взято: сервис, который живёт сам, и
 * командная строка как единственный вход.
 */

describe("одно действие запускает всё", () => {
  it("модель на диске — короче путь", () => {
    const got = plan(true, 0);
    expect(got.map((stage) => stage.what)).toEqual(["check", "load", "ready"]);
  });

  it("модели нет — появляется скачивание и называет объём", () => {
    const got = plan(false, 4665);
    const download = got.find((stage) => stage.what === "download");
    expect(download).toBeDefined();
    expect(download!.said).toContain("4.7 ГБ");
  });

  it("последний этап — готово", () => {
    expect(oneLine(plan(true, 0))).toContain("готово");
  });
});

describe("молчаливая пауза — это «сломалось»", () => {
  it("до половины — без ложной точности", () => {
    // «Осталось 3 минуты» на загрузке, которая займёт двадцать, человек запомнит.
    expect(left(500, 4665, 600)).toContain("примерно");
  });

  it("после половины — число", () => {
    expect(left(4000, 4665, 120)).toContain("осталось около");
  });

  it("только начали — так и сказано", () => {
    expect(left(0, 4665, 0)).toBe("начал скачивать");
    expect(left(4665, 4665, 0)).toBe("скачано");
  });

  it("меньше минуты — не «0 мин»", () => {
    expect(left(3000, 4665, 30)).toBe("меньше минуты");
  });
});

describe("сервис кончается вместе с разговором", () => {
  it("модель выгружается сама", () => {
    // То, что надо останавливать руками, останавливают забывчивые.
    const got = after();
    expect(got.unload).toBe(true);
    expect(got.said).toContain("выгружена");
  });
});

describe("отказ называет шаг, а не «ошибка загрузки»", () => {
  it("где встало — видно", () => {
    expect(failure("download", "нет сети").said).toContain("не скачивается");
    expect(failure("load", "мало памяти").said).toContain("не хватает памяти");
  });

  it("причина сохраняется дословно", () => {
    const got = failure("check", "диск не читается");
    expect(got.what).toBe("failed");
    if (got.what === "failed") expect(got.why).toBe("диск не читается");
  });
});
