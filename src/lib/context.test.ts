import { describe, expect, it } from "vitest";
import { aliases, aroundPhrase, rankForWindow } from "./context";
import type { PlanItem } from "../ipc";

function item(key: string, example: string, score = 1): PlanItem {
  return {
    key,
    example,
    risk: "read",
    decision: "allow",
    decision_reason: "",
    needs_token: false,
    tool: null,
    score,
  };
}

/**
 * Подсказка про программу перед человеком меняет только порядок. Ничего не выбрасывает,
 * решений не трогает и молчит, если не знает программы.
 */
describe("подсказка по окну", () => {
  it("поднимает то, что про программу перед человеком", () => {
    const items = [
      item("звук|поставить|пауза в музыке", "поставить на паузу музыку", 9),
      item("браузер|включить|субтитры", "включить субтитры в видео на сайте", 2),
    ];

    const { items: order, moved } = rankForWindow(items, {
      title: "Видео — браузер",
      process: "chrome.exe",
    });

    expect(order.map((row) => row.key)).toEqual([
      "браузер|включить|субтитры",
      "звук|поставить|пауза в музыке",
    ]);
    expect(moved).toBe(2);
  });

  it("незнакомую программу не угадывает и порядок не трогает", () => {
    const items = [item("звук|поставить|пауза", "поставить на паузу"), item("браузер|включить|субтитры", "субтитры")];
    const { items: order, moved } = rankForWindow(items, { title: "Что-то", process: "myapp.exe" });

    expect(order).toEqual(items);
    expect(moved).toBe(0);
  });

  it("без окна отвечает тем же списком", () => {
    const items = [item("а|б|в", "пример")];
    expect(rankForWindow(items, null)).toEqual({ items, moved: 0 });
  });

  it("если подходящих нет — не переставляет ничего", () => {
    const items = [item("файл|открыть|папка", "открыть папку"), item("звук|убавить|громкость", "убавить громкость")];
    const { items: order } = rankForWindow(items, { title: "Чат", process: "telegram.exe" });
    expect(order).toEqual(items);
  });

  it("знает программы, которыми человек пользуется каждый день", () => {
    expect(aliases("chrome.exe")).toContain("браузер");
    expect(aliases("CHROME.EXE")).toContain("браузер");
    expect(aliases("unknown.exe")).toEqual([]);
    expect(aliases("")).toEqual([]);
  });

  it("называет окно так, чтобы было понятно, о чём речь", () => {
    expect(aroundPhrase({ title: "Видео — браузер", process: "chrome.exe" })).toBe(
      "Видео — браузер — chrome.exe",
    );
    expect(aroundPhrase({ title: "  ", process: "notepad.exe" })).toBe("notepad.exe");
  });
});
