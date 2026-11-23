import { describe, expect, it } from "vitest";
import { blocked, finished, mayStart, say, start, stop } from "./cancelRun";

/**
 * Шаг 104: отмена обрывает текущий шаг и не запускает следующий.
 *
 * Три разные вещи назывались «отменить» молча: после конца, в середине и «пока
 * ждём текущий шаг».
 */
describe("следующий шаг не начинается", () => {
  it("после отмены новый шаг не начинается", () => {
    const run = stop({ ...start(7), done: 3 });
    expect(mayStart(run)).toBe(false);
  });

  it("проверка читается перед каждым шагом, а не один раз в начале", () => {
    // Именно это ломало отмену: флаг ставили, а смотрели на него раньше.
    let run = start(7);
    run = finished(run);
    run = stop(run);
    run = finished(run);
    expect(mayStart(run)).toBe(false);
  });

  it("до отмены шаги идут", () => {
    const run = { ...start(3), done: 1 };
    expect(mayStart(run)).toBe(true);
    expect(mayStart({ ...start(3), done: 3 })).toBe(false);
  });
});

describe("сделанное не отменяется молча", () => {
  it("отмена называет, сколько сделано и сколько осталось", () => {
    const said = say(stop({ ...start(7), done: 3 }));
    expect(said).toContain("3 из 7");
    expect(said).toContain("не запускаю");
    expect(said).toContain("осталось");
  });

  it("отмена до первого шага говорит «не начинал»", () => {
    expect(say(stop(start(7)))).toContain("не начинал");
  });

  it("после конца отмена честно говорит, что отменять нечего", () => {
    // Кнопка, которая делает вид, что вернула, — хуже, чем её отсутствие.
    expect(say(stop({ ...start(3), done: 3 }))).toContain("отменять нечего");
    expect(say({ ...start(3), done: 3 })).toContain("нечего");
  });

  it("сделанное остаётся: счёт не уменьшается", () => {
    const run = finished(stop({ ...start(7), done: 3 }));
    expect(run.done).toBe(4);
    expect(run.stopped).toBe(true);
  });
});

describe("«хватит» относится ко всему плану", () => {
  it("после отмены не запускается ничего, даже безопасного", () => {
    // «Но вот это же безобидное» — не его «хватит».
    expect(blocked(stop(start(7))).any).toBe(true);
    expect(blocked(stop(start(7))).why).toContain("дальше ничего");
  });

  it("без отмены ничего не заблокировано", () => {
    expect(blocked(start(7)).any).toBe(false);
  });

  it("отмена не отменяется повторным нажатием", () => {
    // Иначе отмена зависит от того, кто сколько раз нажал.
    const once = stop(start(7));
    expect(stop(once).stopped).toBe(true);
    expect(mayStart(stop(once))).toBe(false);
  });
});
