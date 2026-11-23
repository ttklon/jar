import { describe, expect, it } from "vitest";
import { done, need, question, rule, SHOW, wasted, type Plan } from "./askWhen";

/**
 * Шаг 82: уточняющий вопрос — только когда без него исполнение опасно.
 *
 * Каждый вопрос — это работа, которую человек не хотел: он говорил, чтобы стало
 * быстрее, а стал диктант.
 */
const plan = (over: Partial<Plan> = {}): Plan => ({
  irreversible: false,
  matches: 1,
  exact: true,
  ...over,
});

describe("обратимое — не спрашивать никогда", () => {
  it("открыть, найти, показать — делаем молча", () => {
    // Ошибка стоит одного повторного слова, а вопрос — минуты.
    expect(need(plan({ irreversible: false, matches: 300 })).ask).toBe(false);
    expect(need(plan({ irreversible: false })).why).toContain("обратимо");
  });
});

describe("необратимое, но однозначное — тоже не спрашивать", () => {
  it("«удали файл отчёт-март.pdf» понятно", () => {
    // Вопрос «удалить?» тут — торможение на ровном месте.
    expect(need(plan({ irreversible: true, exact: true, matches: 1 })).ask).toBe(false);
    expect(need(plan({ irreversible: true, exact: true, matches: 1 })).why).toContain("точно");
  });

  it("после действия сказано, что сделано и почему без вопроса", () => {
    // Молчание после удаления — это то, из-за чего человек не знает, удалилось ли.
    const said = done(plan({ irreversible: true }), "файл отчёт-март.pdf");
    expect(said).toContain("удалено");
    expect(said).toContain("без вопроса");
  });
});

describe("необратимое и неоднозначное — вопрос обязателен", () => {
  it("триста отчётов — спросить до, а не после", () => {
    // Вопрос после необратимого действия — не выбор, а сообщение о случившемся.
    const check = need(plan({ irreversible: true, exact: false, matches: 300 }));
    expect(check.ask).toBe(true);
    expect(check.why).toContain("300");
  });

  it("в вопросе число и три имени, а не весь список", () => {
    const said = question(plan({ irreversible: true, exact: false, matches: 10 }), [
      "отчёт-март",
      "отчёт-апрель",
      "отчёт-май",
      "отчёт-июнь",
    ]);
    expect(said).toContain("10");
    expect(said).toContain("отчёт-март");
    expect(said).toContain(`ещё ${10 - SHOW}`);
    expect(said).not.toContain("отчёт-июнь");
  });

  it("одно совпадение при родовом объекте — вопрос именем, а не «да/нет»", () => {
    const said = question(plan({ irreversible: true, exact: false, matches: 1 }), ["отчёт-март"]);
    expect(said).toContain("отчёт-март");
    expect(said).toContain("необратимо");
  });

  it("ничего не подошло — не вопрос, а честное «не нашлось»", () => {
    // Спрашивать «удалить?» про пустое — это издевательство.
    expect(need(plan({ irreversible: true, exact: false, matches: 0 })).ask).toBe(false);
    expect(need(plan({ irreversible: true, exact: false, matches: 0 })).why).toContain("не нашлось");
  });
});

describe("лишний вопрос — дефект, а не осторожность", () => {
  it("вопрос без нужды назван ошибкой", () => {
    // Он обучает человека отвечать не читая — и тогда настоящий вопрос пропустят.
    expect(wasted(plan({ irreversible: false }))).toBe(true);
    expect(need(plan({ irreversible: false })).ask).toBe(false);
  });

  it("трата — любой вопрос там, где решение «не спрашивать»", () => {
    // Обе ветки «не спрашивать»: обратимое и точное необратимое.
    expect(wasted(plan({ irreversible: false }))).toBe(true);
    expect(wasted(plan({ irreversible: true, exact: true, matches: 1 }))).toBe(true);
    expect(wasted(plan({ irreversible: true, exact: false, matches: 5 }))).toBe(false);
  });

  it("правило названо человеку одной строкой", () => {
    expect(rule()).toContain("необратимо");
    expect(rule()).toContain("иначе делаю");
  });
});
