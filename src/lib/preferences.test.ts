import { describe, expect, it } from "vitest";
import {
  STALE_MS,
  THRESHOLD,
  all,
  forget,
  pick,
  suggest,
  volume,
  type Sighting,
} from "./preferences";

/**
 * Шаг 261: память о предпочтениях — папки, программы, голос, громкость.
 *
 * Дефект: предпочтений не запоминалось вовсе. Настройки были (тема, язык), а
 * то, что человек **показал делом** — снова открыл `D:\Отчёты`, снова запустил
 * `Code`, поправил громкость до 30% и оставил, — каждый раз приходилось
 * повторять. Второй раз спрашивать об этом — работа, которую человек делает за
 * программу.
 */

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_800_000_000_000;

const sighting = (value: string, daysAgo: number, kind: Sighting["kind"] = "folder"): Sighting => ({
  kind,
  value,
  at: NOW - daysAgo * DAY,
});

describe("предпочтение — это повтор, а не один случай (шаг 261)", () => {
  it("один раз — не привычка", () => {
    // Человек один раз зашёл не туда. Запоминать это значит запоминать ошибки.
    expect(pick([sighting("D:\\Отчёты", 1)], "folder", NOW)).toBeNull();
    expect(THRESHOLD).toBe(2);
  });

  it("два раза — уже предпочтение, и причина названа", () => {
    const got = pick([sighting("D:\\Отчёты", 2), sighting("D:\\Отчёты", 1)], "folder", NOW);
    expect(got).not.toBeNull();
    expect(got!.value).toBe("D:\\Отчёты");
    expect(got!.times).toBe(2);
    expect(got!.why).toContain("2 раза");
  });

  it("«3 раза», а не «3 раз»: число без склонения читается как код", () => {
    const got = pick(
      [sighting("D:\\Отчёты", 3), sighting("D:\\Отчёты", 2), sighting("D:\\Отчёты", 1)],
      "folder",
      NOW,
    );
    expect(got!.why).toContain("3 раза");
  });

  it("виды не смешиваются: папка не становится программой", () => {
    const got = pick([sighting("Code", 1, "program"), sighting("Code", 2, "program")], "folder", NOW);
    expect(got).toBeNull();
  });
});

describe("свежее важнее частого", () => {
  it("пять раз в марте против трёх в ноябре — побеждает ноябрь", () => {
    // Полгода назад папка открывалась каждый день, а теперь — другая.
    // Подсказывать старую значит спорить с человеком.
    const spring = [sighting("C:\\Старое", 200), sighting("C:\\Старое", 210), sighting("C:\\Старое", 220), sighting("C:\\Старое", 230), sighting("C:\\Старое", 240)];
    const autumn = [sighting("D:\\Новое", 3), sighting("D:\\Новое", 5), sighting("D:\\Новое", 7)];
    const got = pick([...spring, ...autumn], "folder", NOW);
    // Пять против трёх — но старое проигрывает, и это правило, а не случай.
    expect(got!.value).toBe("D:\\Новое");
  });

  it("при равной свежести побеждает частое — это не противоречие правилу", () => {
    // Времени равны, значит «чаще» — единственный признак, который остался.
    const got = pick(
      [sighting("A", 1), sighting("A", 1), sighting("B", 1)],
      "folder",
      NOW,
    );
    expect(got!.value).toBe("A");
  });
});

describe("устаревшее называется, а не выдаётся за текущее", () => {
  it("порог свежести — тридцать дней, и он назван", () => {
    expect(STALE_MS).toBe(30 * DAY);
  });

  it("старое предпочтение остаётся, но с оговоркой", () => {
    // Человек мог вернуться к прежней папке после перерыва: молча стереть
    // значит потерять верное, выдать за текущее — соврать.
    const got = suggest([sighting("C:\\Старое", 40), sighting("C:\\Старое", 50)], "folder", NOW);
    expect(got.value).toBe("C:\\Старое");
    expect(got.note).toContain("могло устареть");
  });

  it("свежее идёт без оговорки", () => {
    const got = suggest([sighting("D:\\Отчёты", 1), sighting("D:\\Отчёты", 2)], "folder", NOW);
    expect(got.value).toBe("D:\\Отчёты");
    expect(got.note).toBe("");
  });

  it("нечему учиться — сказано, а не пустая строка", () => {
    const got = suggest([], "folder", NOW);
    expect(got.value).toBeNull();
    expect(got.note).toContain("нужно два раза");
  });

  it("«сегодня» и «вчера» словами, а не «0 дней»", () => {
    const today = pick([sighting("A", 0), sighting("A", 0)], "folder", NOW);
    expect(today!.why).toContain("сегодня");
    const yesterday = pick([sighting("A", 1), sighting("A", 1)], "folder", NOW);
    expect(yesterday!.why).toContain("вчера");
  });
});

describe("громкость — число, а не имя", () => {
  it("30 остаётся числом и подсказывается числом", () => {
    const got = volume([sighting("30", 1, "volume"), sighting("30", 2, "volume")], NOW);
    expect(got.value).toBe(30);
    expect(typeof got.value).toBe("number");
  });

  it("за границами не оглушает и не срывает: 130 → 100, −5 → 0", () => {
    // Без приведения однажды в памяти окажется «130», и колонки оглохнут.
    const high = volume([sighting("130", 1, "volume"), sighting("130", 2, "volume")], NOW);
    expect(high.value).toBe(100);
    const low = volume([sighting("-5", 1, "volume"), sighting("-5", 2, "volume")], NOW);
    expect(low.value).toBe(0);
  });

  it("не число в памяти — названо, а не подставлен ноль", () => {
    // Ноль оглушит колонки молча — это хуже, чем сказать «в памяти мусор».
    const got = volume([sighting("громко", 1, "volume"), sighting("громко", 2, "volume")], NOW);
    expect(got.value).toBeNull();
    expect(got.why).toContain("это не громкость");
  });

  it("нечего подсказать — тоже сказано", () => {
    expect(volume([], NOW).why).toContain("нужно два раза");
  });
});

describe("все виды вместе", () => {
  it("четыре вида — четыре предпочтения, и ни одного лишнего", () => {
    const sights: Sighting[] = [
      sighting("D:\\Отчёты", 1),
      sighting("D:\\Отчёты", 2),
      sighting("Code", 1, "program"),
      sighting("Code", 3, "program"),
      sighting("Алла", 1, "voice"),
      sighting("Алла", 2, "voice"),
      sighting("30", 1, "volume"),
      sighting("30", 2, "volume"),
    ];
    const got = all(sights, NOW);
    expect(got.map((item) => item.kind)).toEqual(["folder", "program", "voice", "volume"]);
  });

  it("вид без повтора не появляется", () => {
    const sights: Sighting[] = [sighting("D:\\Отчёты", 1), sighting("D:\\Отчёты", 2)];
    expect(all(sights, NOW).length).toBe(1);
  });
});

describe("удаление факта — отдельно для каждого", () => {
  it("забывается ровно этот факт, остальные на месте", () => {
    const sights: Sighting[] = [
      sighting("D:\\Отчёты", 1),
      sighting("D:\\Отчёты", 2),
      sighting("Code", 1, "program"),
      sighting("Code", 2, "program"),
    ];
    const left = forget(sights, "folder", "D:\\Отчёты");
    expect(left.length).toBe(2);
    expect(left.every((item) => item.kind === "program")).toBe(true);
  });

  it("исходный список не меняется: удаление не мутирует память", () => {
    const sights: Sighting[] = [sighting("A", 1), sighting("A", 2)];
    forget(sights, "folder", "A");
    expect(sights.length).toBe(2);
  });

  it("после удаления предпочтения больше нет", () => {
    const sights: Sighting[] = [sighting("A", 1), sighting("A", 2)];
    expect(pick(forget(sights, "folder", "A"), "folder", NOW)).toBeNull();
  });
});
