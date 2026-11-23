import { describe, expect, it } from "vitest";
import {
  action,
  IDLE_MS,
  resumeMs,
  sayUnload,
  sayWaiting,
  words,
  wouldHurt,
} from "./idleUnload";

/**
 * Шаг 74: выгрузка модели по простою с быстрым возвратом.
 *
 * Модель, загруженная один раз, занимает 4–7 ГБ весь день, пока человек решает
 * другие задачи: другие программы тормозят, система свопится.
 */
describe("простой — память обратно", () => {
  it("через десять минут простоя выгружаем", () => {
    expect(action({ idleMs: IDLE_MS, loaded: true })).toBe("unload");
    expect(action({ idleMs: IDLE_MS - 1, loaded: true })).toBe("keep");
  });

  it("пауза в разговоре — не простой, а размышление", () => {
    // Выгружать на пятой минуте значит загружать снова через минуту.
    expect(action({ idleMs: 60_000, loaded: true })).toBe("keep");
  });

  it("незагруженное не выгружается", () => {
    // Бессмысленная работа; и ложное сообщение «освободил память».
    expect(action({ idleMs: 999_999, loaded: false })).toBe("keep");
  });

  it("простой меряется от фразы, а не от запуска", () => {
    // Человек может работать час подряд, и это не простой.
    expect(action({ idleMs: 0, loaded: true })).toBe("keep");
    expect(words({ idleMs: 0, loaded: true }, 4600, "ssd")).toBeNull();
  });
});

describe("возврат быстрый, и это сказано", () => {
  it("на SSD возврат — секунды, на HDD — дольше", () => {
    // Экономия памяти не должна стоить полминуты ожидания.
    expect(resumeMs(4600, "ssd")).toBeLessThan(resumeMs(4600, "hdd"));
    expect(resumeMs(4600, "ssd")).toBeLessThan(30_000);
  });

  it("выгрузка говорит, что освободила и сколько стоил возврат", () => {
    // Иначе человек боится, что теперь всё будет медленно.
    const said = sayUnload(4600, "ssd");
    expect(said).toContain("4.5 ГБ");
    expect(said).toContain("вернусь за");
  });

  it("возврат предупреждает до ответа, а не объясняет после", () => {
    // Иначе человек решит, что приложение стало медленнее.
    expect(sayWaiting("ssd")).toContain("несколько секунд");
    expect(sayWaiting("hdd")).toContain("минуты");
  });
});

describe("работу не обрываем ради памяти", () => {
  it("идёт работа — не выгружаем", () => {
    // Выгрузить посреди генерации значит оборвать работу человека.
    expect(wouldHurt({ idleMs: IDLE_MS * 2, loaded: true }, true)).toBe(true);
  });

  it("работы нет — выгружаем спокойно", () => {
    expect(wouldHurt({ idleMs: IDLE_MS * 2, loaded: true }, false)).toBe(false);
    expect(wouldHurt({ idleMs: 0, loaded: false }, true)).toBe(false);
  });
});
