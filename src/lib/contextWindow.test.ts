import { describe, expect, it } from "vitest";
import {
  cacheMb,
  fit,
  MB_PER_TOKEN,
  say,
  wasteful,
  why,
  WINDOW,
  windowFor,
} from "./contextWindow";

/**
 * Шаг 67: память контекста — не больше нужного; узкое окно для голоса.
 *
 * Окно «с запасом» платит памятью и временем всегда, а не иногда: внимание
 * считается по всему окну, и пустое место в нём тоже.
 */
describe("окно по задаче, а не «побольше»", () => {
  it("голос — узкое окно, код — широкое", () => {
    // Фраза это десять-двадцать слов; код нужен целиком.
    expect(windowFor("voice")).toBeLessThan(windowFor("chat"));
    expect(windowFor("chat")).toBeLessThan(windowFor("plan"));
    expect(windowFor("plan")).toBeLessThan(windowFor("code"));
  });

  it("голосовое окно маленькое: больше — только медленнее", () => {
    // Голосовой ответ ждут, и каждая миллисекунда видна.
    expect(WINDOW.voice).toBeLessThanOrEqual(512);
  });

  it("причина сказана, а не только число", () => {
    // Чтобы число можно было оспорить, а не принять на веру.
    for (const task of ["voice", "chat", "plan", "code"] as const) {
      const reason = why(task);
      expect(reason.length).toBeGreaterThan(20);
    }
    expect(why("voice")).toContain("фраза");
  });
});

describe("цена окна видна", () => {
  it("кеш растёт с окном", () => {
    expect(cacheMb("code")).toBeGreaterThan(cacheMb("voice"));
    expect(cacheMb("voice")).toBe(Math.round(WINDOW.voice * MB_PER_TOKEN));
  });

  it("сказано число, причина и цена в памяти", () => {
    // «Окно побольше» — не бесплатно, и человек должен это видеть.
    const said = say("voice");
    expect(said).toContain(String(WINDOW.voice));
    expect(said).toContain("МБ");
    expect(said).toContain("голос");
  });

  it("окно втрое больше нужного — потеря, а не запас", () => {
    // Иначе настройка «побольше» выглядит улучшением.
    expect(wasteful("voice", 3000)).toBe(true);
    expect(wasteful("voice", 512)).toBe(false);
  });
});

describe("история обрезается умно, а не с начала", () => {
  const cost = () => 10;

  it("начало сохраняется: там правила и роль", () => {
    // Без начала модель перестаёт быть той же моделью.
    const history = ["система", "р1", "р2", "р3", "р4", "р5"];
    const cut = fit(history, 20, cost);
    expect(cut[0]).toBe("система");
    // И последние реплики: они и есть разговор.
    expect(cut[cut.length - 1]).toBe("р5");
  });

  it("влезает всё — ничего не режем", () => {
    const history = ["система", "р1"];
    expect(fit(history, 1000, cost)).toEqual(history);
  });

  it("пустая история не ломает окно", () => {
    expect(fit([], 100, cost)).toEqual([]);
  });

  it("не влезает даже обязательное — отдаём хвост, а не начало", () => {
    // Начало без разговора бесполезнее, чем разговор без начала.
    const history = ["система", "р1", "р2", "р3"];
    const cut = fit(history, 5, () => 10, 2);
    expect(cut).toEqual(["р2", "р3"]);
  });
});
