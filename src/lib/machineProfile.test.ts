import { describe, expect, it } from "vitest";
import {
  approximate,
  forModel,
  grade,
  gpuUsable,
  loadSeconds,
  measure,
  say,
  stale,
  STALE_MS,
  type Profile,
} from "./machineProfile";

/**
 * Шаг 61: профиль машины за 3–8 секунд.
 *
 * Без профиля остаётся «попробуем 7B» — и на слабом ноутбуке она думает по
 * тридцать секунд на фразу. Человек решит, что приложение медленное.
 */
const profile = (over: Partial<Profile> = {}): Profile => ({
  cores: 8,
  ramMb: 16 * 1024,
  gpu: { found: false, vramMb: 0, name: null },
  disk: "ssd",
  at: 0,
  ...over,
});

describe("четыре факта решают выбор модели", () => {
  it("память для модели — половина минус система, а не «вся»", () => {
    // Модель, занявшая всю память, заставит систему свопиться, и это медленнее
    // любой маленькой модели.
    expect(forModel(profile({ ramMb: 16 * 1024 }))).toBe(7 * 1024);
    expect(forModel(profile({ ramMb: 4 * 1024 }))).toBe(1024);
  });

  it("мало памяти — не отрицательное число", () => {
    expect(forModel(profile({ ramMb: 512 }))).toBe(0);
  });

  it("видеокарта ниже 2 ГБ — не ускоритель", () => {
    // Туда не влезет даже 0.5B в Q4; обещать её человеку нельзя.
    expect(gpuUsable(profile({ gpu: { found: true, vramMb: 1024, name: "слабая" } }))).toBe(false);
    expect(gpuUsable(profile({ gpu: { found: true, vramMb: 4096, name: "своя" } }))).toBe(true);
    expect(gpuUsable(profile())).toBe(false);
  });

  it("медленный диск — дольше первый запуск, и это сказано", () => {
    expect(loadSeconds(profile({ disk: "hdd" }), 4000)).toBeGreaterThan(
      loadSeconds(profile({ disk: "ssd" }), 4000),
    );
  });

  it("диск неизвестен — не пугаем зря", () => {
    // Ошибиться в оптимистичную сторону дешевле.
    expect(loadSeconds(profile({ disk: "unknown" }), 4000)).toBe(
      loadSeconds(profile({ disk: "ssd" }), 4000),
    );
  });
});

describe("класс машины — слово, а не число", () => {
  it("сильная: много памяти и видеокарта от 8 ГБ", () => {
    expect(
      grade(profile({ ramMb: 32 * 1024, gpu: { found: true, vramMb: 8192, name: "своя" } })),
    ).toBe("strong");
  });

  it("средняя: память или ядра, но без большой видеокарты", () => {
    // «Средняя» — это честно: 7B пойдёт, но не быстро.
    expect(grade(profile({ ramMb: 16 * 1024 }))).toBe("medium");
    expect(grade(profile({ ramMb: 8 * 1024, cores: 16 }))).toBe("medium");
  });

  it("слабая: мало и памяти, и ядер", () => {
    expect(grade(profile({ ramMb: 4 * 1024, cores: 2 }))).toBe("weak");
  });
});

describe("человеку сказано, чего ждать", () => {
  it("названы не только цифры, но и следствие", () => {
    // Голые цифры человек не переведёт в ожидание.
    const said = say(profile());
    expect(said).toContain("8 ядер");
    expect(said).toContain("16 ГБ");
    expect(said).toContain("процессоре");
  });

  it("с видеокартой — сказано, что она есть", () => {
    expect(
      say(profile({ gpu: { found: true, vramMb: 8192, name: "RTX 4060" } })),
    ).toContain("RTX 4060");
  });

  it("медленный диск назван, а не подразумевается", () => {
    expect(say(profile({ disk: "hdd" }))).toContain("первый запуск дольше");
  });

  it("оценка называется оценкой", () => {
    // Диск определён по типу, а не замером: выдавать его за измерение нечестно.
    expect(approximate()).toContain("оценка");
  });
});

describe("профиль не живёт вечно", () => {
  it("старше суток — пересчитать", () => {
    // Железо меняют: поставили память, подключили внешнюю видеокарту.
    const old = profile({ at: 0 });
    expect(stale(old, STALE_MS + 1)).toBe(true);
    expect(stale(old, STALE_MS - 1)).toBe(false);
  });

describe("измерение не бросает и не врёт", () => {
  it("профиль собирается даже там, где браузера нет", () => {
    // В тестах (jsdom) и на сервере: неизвестный факт — это 0 или unknown, а не
    // повод не запускаться.
    const measured = measure(1000);
    expect(measured.cores).toBeGreaterThanOrEqual(1);
    expect(measured.ramMb).toBeGreaterThan(0);
    expect(measured.disk).toBe("unknown");
    expect(measured.at).toBe(1000);
  });

  it("встроенная видеокарта не обещается как ускоритель", () => {
    // Она делит память с системой, и 7B на ней не поедет.
    const measured = measure(0);
    expect(gpuUsable(measured)).toBe(false);
  });
});
});
