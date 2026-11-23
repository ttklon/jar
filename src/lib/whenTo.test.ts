import { describe, expect, it } from "vitest";
import { ambiguous, number, parse, ready, say } from "./whenTo";

/**
 * Шаг 91: разбор «когда» отдельно от «что».
 *
 * «Завтра в девять сделай отчёт» сегодня исполняется **сейчас** — потому что
 * разбор ищет, что делать, и не отделяет «когда».
 */
const now = new Date("2026-11-20T10:30:00").getTime();

describe("сейчас и по часам — разные вещи", () => {
  it("без «когда» — сейчас", () => {
    expect(parse("сделай отчёт", now).kind).toBe("now");
    expect(ready(parse("сделай отчёт", now), now)).toBe(true);
  });

  it("«завтра в девять» — не сейчас", () => {
    const when = parse("завтра в девять сделай отчёт", now);
    expect(when.kind).toBe("time");
    expect(ready(when, now)).toBe(false);
  });

  it("«через час» считается от сейчас, а не от полуночи", () => {
    const when = parse("через 1 час выключи", now);
    expect(when.kind).toBe("time");
    if (when.kind === "time") expect(when.at - now).toBe(3_600_000);
  });

  it("«через двадцать минут» — числом словами", () => {
    const when = parse("через двадцать минут напомни", now);
    if (when.kind === "time") expect(when.at - now).toBe(20 * 60_000);
    expect(number("двадцать")).toBe(20);
    expect(number("7")).toBe(7);
    expect(number("семьдесят")).toBeNull(); // не угадываем
  });

  it("наступило — можно исполнять", () => {
    const when = parse("через 1 час выключи", now);
    expect(ready(when, now + 3_600_000)).toBe(true);
    expect(ready(when, now + 60_000)).toBe(false);
  });
});

describe("событие — ждать, а не пробовать сейчас", () => {
  it("«когда закончится копирование» — событие", () => {
    const when = parse("когда закончится копирование, выключи компьютер", now);
    expect(when.kind).toBe("event");
    expect(ready(when, now)).toBe(false);
    expect(ready(when, now, true)).toBe(true);
  });

  it("сказано «не раньше», а не «запланировано»", () => {
    // Иначе человек не может проверить, что понято верно.
    expect(say(parse("когда закончится копирование, выключи", now), now)).toContain("не раньше");
  });
});

describe("условие проверяется, а не считается выполненным", () => {
  it("«если больше 90%» — не повод сделать сразу", () => {
    const when = parse("если диск заполнится больше 90%, почисти", now);
    expect(when.kind).toBe("condition");
    expect(ready(when, now)).toBe(false);
  });

  it("сказано, что будет проверка", () => {
    expect(say(parse("если диск заполнится, почисти", now), now)).toContain("проверю");
  });
});

describe("вечер и утро — не одно и то же", () => {
  it("«в девять вечера» — 21 час", () => {
    const when = parse("завтра в девять вечера", now);
    if (when.kind === "time") {
      expect(new Date(when.at).getHours()).toBe(21);
    }
  });

  it("«в девять утра» — 9 часов", () => {
    const when = parse("завтра в девять утра", now);
    if (when.kind === "time") {
      expect(new Date(when.at).getHours()).toBe(9);
    }
  });

  it("«в девять» без половины суток — неоднозначно, и это названо", () => {
    // Человек знает, утро это или вечер, а приложение — нет.
    expect(ambiguous("в 9 сделай отчёт")).toBe(true);
    expect(ambiguous("в 9 утра сделай отчёт")).toBe(false);
  });
});

describe("«потом» — это после предыдущего, а не по часам", () => {
  it("событие без часа не становится временем", () => {
    const when = parse("когда закончится — потом выключи", now);
    expect(when.kind).toBe("event");
  });
});
