import { describe, expect, it } from "vitest";
import { cheapened, fallback, plan, say, yieldToHuman, type Start } from "./preload";

/**
 * Шаг 131: ядро поднимается в фоне при старте, а не по первой фразе.
 *
 * Первая фраза платила 3 секунды за старт, хотя окно было открыто давно.
 */
const start = (over: Partial<Start> = {}): Start => ({
  installed: true,
  weak: false,
  busy: false,
  refused: false,
  done: false,
  ...over,
});

describe("в фоне при старте, а не по фразе", () => {
  it("при старте окна подъём начинается", () => {
    const got = plan(start());
    expect(got.start).toBe(true);
    expect(got.said).toContain("первая фраза не платит за старт");
  });

  it("видно, что идёт фон — иначе быстрый ответ выглядит чудом", () => {
    expect(say(plan(start()))).toContain("в фоне");
  });
});

describe("предзагрузка не в ущерб человеку", () => {
  it("человек ждёт ответ — предзагрузка ждёт своей очереди", () => {
    const got = plan(start({ busy: true }));
    expect(got.start).toBe(false);
    expect(got.why).toContain("ждёт ответ");
  });

  it("на слабой машине не начинаем вовсе: отняла бы процессор у ответа", () => {
    const got = plan(start({ weak: true }));
    expect(got.start).toBe(false);
    expect(got.why).toContain("машина слабая");
  });

  it("человек заговорил — фон уступает", () => {
    const got = yieldToHuman(true, true);
    expect(got.keepGoing).toBe(false);
    expect(got.said).toContain("уступает");
  });
});

describe("поднимаем только то, что есть", () => {
  it("нет модели — поднимать нечего, и это сказано", () => {
    expect(plan(start({ installed: false })).why).toContain("поднимать нечего");
  });

  it("второй раз не поднимаем", () => {
    expect(plan(start({ done: true })).why).toContain("второе не нужно");
  });

  it("человек попросил не поднимать заранее — не поднимаем", () => {
    expect(plan(start({ refused: true })).why).toContain("попросил не поднимать");
  });
});

describe("неудача фона ничего не ломает", () => {
  it("фраза поднимет ядро как раньше", () => {
    const got = fallback(true);
    expect(got.stillWorks).toBe(true);
    expect(got.said).toContain("первая фраза поднимет ядро как раньше");
  });

  it("и об этом не молчат", () => {
    expect(say(plan(start()), false, true)).toContain("не поднялось в фоне");
  });
});

describe("стоило ли — два числа рядом", () => {
  it("первая фраза стала дешевле", () => {
    expect(cheapened(3400, 400).said).toBe("первая фраза: 400 мс вместо 3400 — сэкономлено 3000 мс");
  });

  it("не стала — так и сказано, без похвалы", () => {
    expect(cheapened(400, 420).said).toContain("не стала быстрее");
  });
});
