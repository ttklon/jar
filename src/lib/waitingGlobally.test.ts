import { describe, expect, it } from "vitest";
import { badge, defer, notDo, queue, remindAfter, type Waiting } from "./waitingGlobally";

/**
 * Шаг 376: дело, которое ждёт подтверждения, видно из любого экрана.
 *
 * Идущее дело закончится само; ждущее без человека не сдвинется никогда.
 */

const waiting = (over: Partial<Waiting> = {}): Waiting => ({
  what: "уборка загрузок",
  ask: "удалить 12 файлов?",
  since: 1,
  canDefer: true,
  ...over,
});

describe("видно везде и заметнее идущего", () => {
  it("одно дело — с вопросом целиком", () => {
    expect(badge([waiting()])).toBe("уборка загрузок: ждёт ответа — удалить 12 файлов?");
  });

  it("несколько — счёт и имена", () => {
    expect(badge([waiting(), waiting({ what: "отправка" })])).toContain("2 дела ждут ответа");
  });

  it("ничего не ждёт — null, а не «всё хорошо»", () => {
    expect(badge([])).toBeNull();
  });
});

describe("не исчезает, но и не спамит", () => {
  it("меньше пяти минут — без напоминания", () => {
    expect(remindAfter(1)).toBeNull();
  });

  it("пять минут — вежливо", () => {
    expect(remindAfter(10)).toBe("ждёт ответа уже несколько минут");
  });

  it("тридцать — «дело не идёт без вас»", () => {
    expect(remindAfter(40)).toContain("не идёт без вашего ответа");
  });
});

describe("вопрос не перекрывает вопрос", () => {
  it("новый встаёт за старым", () => {
    const got = queue([waiting(), waiting({ what: "отправка" })]);
    expect(got[0]).toContain("сейчас спрашиваю: уборка загрузок");
    expect(got[1]).toContain("после него 1 вопрос: отправка");
  });

  it("один вопрос — без «после него»", () => {
    expect(queue([waiting()]).length).toBe(1);
  });

  it("склонение вопросов", () => {
    expect(queue([waiting(), waiting({ what: "a" }), waiting({ what: "b" })])[1]).toContain("2 вопроса");
  });
});

describe("отложить — не отменить", () => {
  it("отложить можно — спрошу в окно без дела", () => {
    const got = defer(waiting());
    expect(got.ok).toBe(true);
    expect(got.said).toContain("следующее окно без дела");
  });

  it("нельзя — только отменить, и сказано почему", () => {
    const got = defer(waiting({ canDefer: false }));
    expect(got.ok).toBe(false);
    expect(got.said).toContain("изменит файлы");
  });
});

describe("чего ожидание не делает", () => {
  it("не исчезает, не перекрывает, не блокирует", () => {
    const got = notDo().join();
    expect(got).toContain("вопрос без ответа");
    expect(got).toContain("вслепую");
    expect(got).toContain("не блокирует");
  });
});
