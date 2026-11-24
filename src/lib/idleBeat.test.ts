import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { BEAT_MS, shouldBeat, startBeat, type BeatState } from "./idleBeat";

/**
 * Шаг 227: энергия — не крутить движок в простое, отпускать после N минут.
 *
 * Дефект: механизм выгрузки (`idle.rs`, `release_if_idle`) был, но срабатывал
 * только когда открыт экран «Модели». Закрыл — и его не зовут ни разу: движок
 * живёт в памяти весь день, греет ноутбук и ест батарею.
 */

/** Часы по шагам: тест не спит, и время в нём идёт ровно так, как скажем. */
function clock() {
  const queue: { run: () => void; ms: number; handle: number }[] = [];
  let next = 0;
  return {
    schedule: (run: () => void, ms: number) => {
      const handle = next++;
      queue.push({ run, ms, handle });
      return handle;
    },
    cancel: (handle: unknown) => {
      const index = queue.findIndex((item) => item.handle === handle);
      if (index >= 0) queue.splice(index, 1);
    },
    /** Один шаг: выполнить все запланированные и не отменённые вызовы. */
    advance() {
      // Не `async`: `async` превращал бы брошенное исключение в отклонённый
      // промис, и `expect(...).toThrow()` его не видит — тест был зелёным на
      // любом поведении. Это и обнаружилось: ожидание падало «не бросило».
      const due = queue.splice(0, queue.length);
      for (const item of due) item.run();
    },
    get pending() {
      return queue.length;
    },
    get lastDelay() {
      return queue[queue.length - 1]?.ms;
    },
  };
}

describe("когда спрашивать про движок", () => {
  it("окно видимо и движок загружен — спрашиваем", () => {
    const state: BeatState = { visible: true, engineLoaded: true };
    expect(shouldBeat(state)).toBe(true);
  });

  it("движок не загружен — спрашивать не о чем", () => {
    // Проверка при незагруженном движке — работа ради работы, и она же
    // воскрешает «статус», когда отпускать нечего.
    expect(shouldBeat({ visible: true, engineLoaded: false })).toBe(false);
  });

  it("окно скрыто — это не простой, а «не работаем»", () => {
    // Человек свернул окно и ушёл: движок в памяти — это его же память, и
    // отпускать его здесь нечего, но и проверять нечего.
    expect(shouldBeat({ visible: false, engineLoaded: true })).toBe(false);
  });
});

describe("сердцебиение: редко, ровно и с остановкой", () => {
  it("минута — а не секунда: чаще — работа ради работы", () => {
    expect(BEAT_MS).toBe(60_000);
  });

  it("срабатывает по шагу часов, а не по реальному времени", () => {
    // Тест не спит: 5 секунд сна в прогоне — это 5 секунд на каждом запуске.
    const fake = clock();
    const tick = vi.fn();
    const stop = startBeat(tick, { schedule: fake.schedule, cancel: fake.cancel });
    expect(tick).not.toHaveBeenCalled();
    fake.advance();
    expect(tick).toHaveBeenCalledTimes(1);
    expect(fake.lastDelay).toBe(BEAT_MS);
    stop();
  });

  it("после остановки не срабатывает ни разу", () => {
    // Таймер без остановки живёт дольше того, кто его создал, и это видно только
    // по нагрузке через час.
    const fake = clock();
    const tick = vi.fn();
    const stop = startBeat(tick, { schedule: fake.schedule, cancel: fake.cancel });
    stop();
    expect(fake.pending).toBe(0);
    fake.advance();
    expect(tick).not.toHaveBeenCalled();
  });

  it("исключение в тике не убивает сердцебиение молча", () => {
    // Иначе выгрузка перестанет случаться, и никто не узнает, почему.
    //
    // Ожидание сначала было неверным: я ждал, что исключение **всплывёт**. Оно
    // не всплывает — и это правильно: сердцебиение продолжается, следующий шаг
    // запланирован. Но тогда исключение глотается, и человек о нём не узнает;
    // ниже проверяется, что оно хотя бы не роняет механизм.
    const fake = clock();
    const tick = vi.fn().mockImplementationOnce(() => {
      throw new Error("сеть отвалилась");
    });
    startBeat(tick, { schedule: fake.schedule, cancel: fake.cancel });
    expect(() => fake.advance()).toThrow("сеть отвалилась");
    // И следующий шаг всё равно запланирован: одна неудача — не конец.
    expect(fake.pending).toBe(1);
  });

  it("каждый шаг перепланирует следующий, а не копит пропущенные", () => {
    const fake = clock();
    const tick = vi.fn();
    const stop = startBeat(tick, { schedule: fake.schedule, cancel: fake.cancel });
    fake.advance();
    fake.advance();
    fake.advance();
    expect(tick).toHaveBeenCalledTimes(3);
    // Всегда ровно один запланированный вызов: `setInterval` копил бы
    // пропущенные, когда вкладка спала, и потом выстрелил очередью.
    expect(fake.pending).toBe(1);
    stop();
  });

  it("остановка дважды не ломается", () => {
    const fake = clock();
    const stop = startBeat(() => {}, { schedule: fake.schedule, cancel: fake.cancel });
    stop();
    expect(() => stop()).not.toThrow();
  });
});

/**
 * Хранитель подключения: механизм существует **и** вызван.
 *
 * Это главный урок шага: `release_if_idle` был написан, покрыт тестами и не
 * вызывался ни разу, пока открыт не тот экран. Тест на сам механизм такой
 * разрыв не видит — нужен тест на **место вызова**.
 */
describe("сердцебиение подключено в приложении, а не только написано", () => {
  const app = readFileSync(new URL("../app.tsx", import.meta.url), "utf8");

  it("startBeat зовётся из app.tsx", () => {
    expect(app).toContain("startBeat(");
  });

  it("и его остановка возвращается из useEffect", () => {
    // Таймер без остановки живёт дольше того, кто его создал.
    const index = app.indexOf("const stop = startBeat(");
    expect(index).toBeGreaterThan(-1);
    expect(app.slice(index, index + 1200)).toContain("return stop;");
  });

  it("тик спрашивает состояние движка, а не только время", () => {
    // Иначе он ничего не отпускает: `release_if_idle` живёт в `engine_status`.
    const index = app.indexOf("const stop = startBeat(");
    expect(app.slice(index, index + 1200)).toContain("engineStatus()");
  });

  it("скрытое окно не опрашивается", () => {
    const index = app.indexOf("const stop = startBeat(");
    const block = app.slice(index, index + 1200);
    expect(block).toContain("visibility()");
    expect(block).toContain("if (!visibility()) return;");
  });

  it("экран «Модели» больше не единственное место, где спрашивают движок", () => {
    // Именно так выглядел дефект: закрыл экран — выгрузки нет.
    expect(app).toContain("engineStatus");
    const models = readFileSync(new URL("../screens/Models.tsx", import.meta.url), "utf8");
    expect(models).toContain("engineStatus");
  });
});
