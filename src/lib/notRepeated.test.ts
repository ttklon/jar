import { describe, expect, it } from "vitest";
import { APART_MS, KEEP, NEED, confidence, keep, occasions, say, spread, trim, worth, type Act } from "./notRepeated";

/**
 * Шаг 272: не запоминать то, что человек не повторил.
 *
 * В одной памяти жили два правила про повторы, и оба были неверны: предпочтения
 * запоминали со второго раза, но считали повторы **внутри вида**, а
 * `factsToRemember()` запоминал ответ **после одного раза**. Опасность не в том,
 * что память чего-то не запомнит, — а в **ложном предпочтении**: подставленное
 * выглядит знанием.
 */

const MIN = 60 * 1000;
const T0 = 1_800_000_000_000;

const act = (over: Partial<Act> = {}): Act => ({
  kind: "folder",
  value: "D:\\Отчёты",
  at: T0,
  ...over,
});

describe("повтор — это разное время, а не два раза подряд", () => {
  it("два клика за секунду — один поступок", () => {
    // Иначе любое дрожание руки становится привычкой.
    const acts = [act({ at: T0 }), act({ at: T0 + 300 })];
    expect(spread(acts)).toBe(1);
    expect(worth(acts, "folder", "D:\\Отчёты").remember).toBe(false);
  });

  it("то же дело через десять минут — уже повтор", () => {
    const acts = [act({ at: T0 }), act({ at: T0 + 10 * MIN })];
    expect(spread(acts)).toBe(2);
    expect(worth(acts, "folder", "D:\\Отчёты").remember).toBe(true);
  });

  it("граница повтора названа — пять минут", () => {
    expect(APART_MS).toBe(5 * MIN);
    expect(spread([act({ at: T0 }), act({ at: T0 + APART_MS })])).toBe(2);
    expect(spread([act({ at: T0 }), act({ at: T0 + APART_MS - 1 })])).toBe(1);
  });

  it("порядок истории не важен — считается по времени", () => {
    const acts = [act({ at: T0 + 10 * MIN }), act({ at: T0 })];
    expect(spread(acts)).toBe(2);
  });
});

describe("повтор — это то же значение, а не тот же вид", () => {
  it("две разные папки дважды — не привычка к папке", () => {
    // Это работа в разных местах, а не предпочтение.
    const acts = [act({ value: "D:\\Отчёты" }), act({ value: "D:\\Фото" })];
    expect(worth(acts, "folder", "D:\\Отчёты").remember).toBe(false);
    expect(worth(acts, "folder", "D:\\Фото").remember).toBe(false);
  });

  it("одно и то же значение дважды — привычка", () => {
    const acts = [act({ at: T0 }), act({ at: T0 + 10 * MIN })];
    expect(worth(acts, "folder", "D:\\Отчёты").remember).toBe(true);
  });

  it("пробелы по краям — то же значение", () => {
    const acts = [act({ value: "D:\\Отчёты", at: T0 }), act({ value: " D:\\Отчёты ", at: T0 + 10 * MIN })];
    expect(worth(acts, "folder", "D:\\Отчёты").remember).toBe(true);
  });

  it("пустое не запоминается никогда", () => {
    const acts = [act({ value: "" }), act({ value: "", at: T0 + 10 * MIN })];
    expect(worth(acts, "folder", "").remember).toBe(false);
  });
});

describe("прямая просьба не требует повтора", () => {
  it("«запомни, что …» — слово человека, а не наблюдение", () => {
    // Требовать повторения прямой просьбы значит спорить с человеком о его словах.
    const acts = [act({ asked: true })];
    expect(worth(acts, "folder", "D:\\Отчёты").remember).toBe(true);
    expect(worth(acts, "folder", "D:\\Отчёты").because).toContain("просили это запомнить");
  });

  it("прямая просьба помогает, даже если раньше был провал", () => {
    const acts = [act({ outcome: "failed", at: T0 }), act({ asked: true, at: T0 + 10 * MIN })];
    expect(worth(acts, "folder", "D:\\Отчёты").remember).toBe(true);
  });
});

describe("провал значение не подтверждает", () => {
  it("папки не было — запоминать нечего", () => {
    const acts = [act({ outcome: "failed", at: T0 }), act({ outcome: "failed", at: T0 + 10 * MIN })];
    const got = worth(acts, "folder", "D:\\Отчёты");
    expect(got.remember).toBe(false);
    expect(got.because).toContain("не получилось");
  });

  it("состоявшееся и провалившееся вместе — повторов всего один", () => {
    const acts = [act({ outcome: "ok", at: T0 }), act({ outcome: "failed", at: T0 + 10 * MIN })];
    expect(worth(acts, "folder", "D:\\Отчёты").remember).toBe(false);
  });
});

describe("редкость видна, а не спрятана", () => {
  it("один раз из пяти случаев — не «2 раза»", () => {
    // При показе только числа повторов «из пяти — один» и «из одного — один»
    // выглядят одинаково.
    const acts: Act[] = [
      act({ value: "D:\\Отчёты", at: T0 }),
      act({ value: "D:\\Фото", at: T0 + 10 * MIN }),
      act({ value: "D:\\Фото", at: T0 + 20 * MIN }),
      act({ value: "D:\\Видео", at: T0 + 30 * MIN }),
      act({ value: "D:\\Музыка", at: T0 + 40 * MIN }),
    ];
    const got = confidence(acts, "folder", "D:\\Отчёты");
    expect(got.times).toBe(1);
    expect(got.cases).toBe(5);
    expect(got.share).toBeCloseTo(1 / 5);
  });

  it("граница пятиминутки не делает из одного случая два", () => {
    // `T0` кратно пяти минутам: два действия в две миллисекунды друг от друга
    // лежат по разные стороны границы сетки. Нарезка `floor(at / APART_MS)`
    // назвала бы это двумя случаями — а человек сделал одно и то же подряд.
    const acts = [act({ at: T0 - 1 }), act({ at: T0 + 1 })];
    expect(occasions(acts)).toBe(1);
    expect(confidence(acts, "folder", "D:\\Отчёты").cases).toBe(1);
  });

  it("случаи считаются по времени, а не по числу записей", () => {
    // Два клика подряд — один случай, а не два: если считать записи, «3 раза
    // подряд за секунду» дадут долю 3/3, то есть уверенность, которой нет.
    const acts = [
      act({ value: "D:\\Отчёты", at: T0 }),
      act({ value: "D:\\Отчёты", at: T0 + 300 }),
      act({ value: "D:\\Фото", at: T0 + 10 * MIN }),
    ];
    const got = confidence(acts, "folder", "D:\\Отчёты");
    expect(got.cases).toBe(2);
    expect(got.times).toBe(1);
    expect(got.share).toBeCloseTo(0.5);
  });

  it("всегда одно и то же — доля полная", () => {
    const acts = [act({ at: T0 }), act({ at: T0 + 10 * MIN })];
    const got = confidence(acts, "folder", "D:\\Отчёты");
    expect(got.times).toBe(2);
    expect(got.share).toBe(1);
  });

  it("пустая история — доля ноль, а не деление на ноль", () => {
    expect(confidence([], "folder", "D:\\Отчёты").share).toBe(0);
  });
});

describe("что сказать, когда повтора не хватило", () => {
  it("не «недостаточно данных», а что сделать", () => {
    const got = say(worth([act()], "folder", "D:\\Отчёты"), "D:\\Отчёты");
    expect(got).toContain("пока не запоминаю");
    expect(got).toContain("ещё раз");
  });

  it("запомнилось — сказано почему", () => {
    const acts = [act({ at: T0 }), act({ at: T0 + 10 * MIN })];
    expect(say(worth(acts, "folder", "D:\\Отчёты"), "D:\\Отчёты")).toContain("2 раза в разное время");
  });
});

describe("фильтр на запись: отвергнутое называется", () => {
  it("повторившееся становится фактом, остальное — нет", () => {
    const acts = [
      act({ value: "D:\\Отчёты", at: T0 }),
      act({ value: "D:\\Отчёты", at: T0 + 10 * MIN }),
      act({ value: "D:\\Фото", at: T0 + 20 * MIN }),
    ];
    const got = keep(acts);
    expect(got.facts.map((fact) => fact.value)).toEqual(["D:\\Отчёты"]);
    expect(got.dropped.map((fact) => fact.value)).toEqual(["D:\\Фото"]);
    expect(got.dropped[0]!.why).toContain("один раз");
  });

  it("молча выброшенное наблюдение выглядит как потеря", () => {
    // Человек будет искать папку, которую точно называл.
    const got = keep([act({ value: "D:\\Фото" })]);
    expect(got.dropped.length).toBe(1);
    expect(got.dropped[0]!.why).not.toBe("");
  });

  it("порог общий с предпочтениями — два", () => {
    expect(NEED).toBe(2);
  });
});

describe("история не растёт бесконечно", () => {
  it("остаются последние тридцать", () => {
    const acts = Array.from({ length: KEEP + 5 }, (_, i) => act({ at: T0 + i * 10 * MIN }));
    const got = trim(acts);
    expect(got.length).toBe(KEEP);
    expect(got[got.length - 1]!.at).toBe(T0 + (KEEP + 4) * 10 * MIN);
  });
});
