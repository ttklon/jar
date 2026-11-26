import { describe, expect, it } from "vitest";
import { KEEP, add, age, find, latest, recall, remember, say, type Remembered } from "./deedMemory";

/**
 * Шаг 271: память о деле — «вчера чистил диск» — с результатом и путями.
 *
 * Карточка дела (шаг 84) говорит про **одно** дело и живёт, пока на неё смотрят.
 * «Как вчера» разбирает, **когда** просить, и повторяет шаги. Ни то, ни другое не
 * отвечает на вопрос, с которого начинается память о деле: «что я делал вчера и
 * чем это кончилось».
 */

const DAY = 24 * 60 * 60 * 1000;
const TODAY = 1_800_000_000_000;
const YESTERDAY = TODAY - DAY;

const deed = (over: Partial<Remembered> = {}): Remembered => ({
  at: YESTERDAY,
  subject: "почистить диск",
  outcome: "ok",
  result: "освободилось 2,3 ГБ",
  paths: ["C:\\Users\\me\\Temp"],
  because: "",
  ...over,
});

describe("помнится результат, а не факт запуска", () => {
  it("успех помнится с результатом", () => {
    const got = remember({ at: YESTERDAY, subject: "почистить диск", outcome: "ok", result: "освободилось 2,3 ГБ", paths: ["C:\\Temp"] });
    expect(got).not.toBeNull();
    expect(got!.result).toBe("освободилось 2,3 ГБ");
  });

  it("успех без записанного результата не выдумывает его", () => {
    // «Всё хорошо» — это не результат: значит, его не записали, и говорить за
    // человека нельзя.
    expect(say(deed({ result: "" }))).toContain("результат не записан");
  });

  it("дело, которое ещё идёт, не запоминается", () => {
    // Его видно на экране; «вспомнить» можно только законченное.
    expect(remember({ at: TODAY, subject: "почистить диск", outcome: "running" })).toBeNull();
  });

  it("дело без предмета не запоминается", () => {
    expect(remember({ at: TODAY, subject: "   ", outcome: "ok" })).toBeNull();
  });
});

describe("пути помнятся, потому что по ним ищут следы", () => {
  it("путь есть в отчёте", () => {
    // Человек помнит «чистил диск», а не «C:\Users\…\Temp». Но проверить можно
    // только по пути.
    expect(say(deed())).toContain("пути: C:\\Users\\me\\Temp");
  });

  it("повторы путей не задваивают отчёт", () => {
    const got = remember({ at: YESTERDAY, subject: "чистка", outcome: "ok", paths: ["C:\\a", "C:\\a", "C:\\b"] });
    expect(got!.paths).toEqual(["C:\\a", "C:\\b"]);
  });

  it("много путей — три и «и ещё»", () => {
    const got = say(deed({ paths: ["C:\\a", "C:\\b", "C:\\c", "C:\\d", "C:\\e"] }));
    expect(got).toContain("и ещё 2");
  });

  it("дело без путей не пишет «пути:»", () => {
    expect(say(deed({ paths: [] }))).not.toContain("пути:");
  });
});

describe("провал помнится наравне с успехом", () => {
  it("провал с причиной и путями", () => {
    // Успех повторяют, а провал разбирают: «вчера не получилось» — тоже память.
    const got = say(deed({ outcome: "failed", result: "остановилось на 3-м файле", because: "файл занят" }));
    expect(got).toContain("не получилось");
    expect(got).toContain("причина: файл занят");
    expect(got).toContain("C:\\Users\\me\\Temp");
  });

  it("остановленное отличается от непроделанного", () => {
    expect(say(deed({ outcome: "cancelled" }))).toContain("остановлено");
    expect(say(deed({ outcome: "denied" }))).toContain("не разрешено");
  });

  it("провал записывается в память так же, как успех", () => {
    const got = remember({ at: YESTERDAY, subject: "почистить диск", outcome: "failed", because: "файл занят" });
    expect(add([], got!).length).toBe(1);
  });
});

describe("память ограничена, и это честно", () => {
  it("больше тридцати дел не держится", () => {
    let history: Remembered[] = [];
    for (let i = 0; i < KEEP + 5; i += 1) history = add(history, deed({ at: YESTERDAY + i }));
    expect(history.length).toBe(KEEP);
    expect(history[history.length - 1]!.at).toBe(YESTERDAY + KEEP + 4);
  });
});

describe("возраст называется, а не замалчивается", () => {
  it("сегодня, вчера, дни назад", () => {
    // Без этого «чистил диск» через месяц читается как «вчера».
    expect(age(deed({ at: TODAY + 1000 }), TODAY)).toBe("сегодня");
    expect(age(deed({ at: YESTERDAY + 1000 }), TODAY)).toBe("вчера");
    expect(age(deed({ at: TODAY - 3 * DAY - 1000 }), TODAY)).toBe("3 дня назад");
  });

  it("давнее — датой, а не «30 дней назад»", () => {
    const got = age(deed({ at: TODAY - 40 * DAY }), TODAY);
    expect(got).toMatch(/^\d{2}\.\d{2}\.\d{4}$/);
  });

  it("дело в 23:30 трое суток назад — «3 дня назад», а не «2»", () => {
    // Настоящий дефект прежней формулы: она сравнивала момент с границей суток и
    // округляла вниз, поэтому вечернее дело «молодело» на день.
    const late = new Date(2026, 10, 17, 23, 30).getTime();
    const todayStart = new Date(2026, 10, 20, 0, 0).getTime();
    expect(age(deed({ at: late }), todayStart)).toBe("3 дня назад");
  });

  it("вчера в 23:00 — это вчера, а не сегодня", () => {
    // Границы по календарю: иначе дело в 23:00 при разговоре в 8 утра «сегодня».
    const late = TODAY - 9 * 60 * 60 * 1000;
    expect(age(deed({ at: late }), TODAY)).toBe("вчера");
  });
});

describe("поиск по словам человека и по времени", () => {
  const history = [
    deed({ at: TODAY - 10 * DAY, subject: "почистить диск", result: "освободилось 2 ГБ" }),
    deed({ at: YESTERDAY, subject: "переименовать фото", result: "переименовано 40 файлов", paths: ["D:\\Фото"] }),
    deed({ at: TODAY, subject: "почистить диск", result: "освободилось 300 МБ", outcome: "failed", because: "файл занят" }),
  ];

  it("«чистил диск» находит оба, включая провал", () => {
    expect(find(history, { words: "чистил диск" }).length).toBe(2);
  });

  it("поиск идёт по путям", () => {
    expect(find(history, { words: "фото" }).length).toBe(1);
  });

  it("«вчера» ограничивает временем, а не словом", () => {
    const got = find(history, { words: "чистил", since: YESTERDAY, until: TODAY });
    expect(got.length).toBe(0);
    expect(find(history, { since: TODAY }).length).toBe(1);
  });

  it("без слов возвращается всё в заданном промежутке", () => {
    expect(find(history, {}).length).toBe(3);
  });
});

describe("что ответить на «вспомни»", () => {
  it("одно дело — рассказ с результатом и путями", () => {
    const got = recall([deed()], [deed()], "почистил диск");
    expect(got).toContain("почистить диск — получилось");
    expect(got).toContain("2,3 ГБ");
    expect(got).toContain("C:\\Users\\me\\Temp");
  });

  it("несколько — последнее и число", () => {
    const history = [deed({ at: YESTERDAY }), deed({ at: TODAY, result: "освободилось 300 МБ" })];
    const got = recall(history, history, "почистил диск");
    expect(got).toContain("таких дел 2");
    expect(got).toContain("последнее");
  });

  it("три разных «ничего»: пустая память, не нашлось, и предмет назван", () => {
    expect(recall([], [], "диск")).toContain("ещё ничего не делал");
    expect(recall([deed()], [], "борщ")).toContain("попробуйте назвать диск");
  });
});

describe("самое свежее дело", () => {
  it("по умолчанию человек говорит про недавнее", () => {
    const history = [deed({ at: TODAY - 100 * DAY }), deed({ at: YESTERDAY })];
    expect(latest(history)!.at).toBe(YESTERDAY);
  });

  it("пустая память — null, а не выдумка", () => {
    expect(latest([])).toBeNull();
  });
});
