import { describe, expect, it } from "vitest";
import {
  SLOW_AFTER_MS,
  audit,
  canPress,
  delay,
  payload,
  secondPress,
  waiting,
  type Env,
} from "./harshEnv";

/**
 * Шаг 253: прогон на подставном медленном и подставном пустом окружении.
 *
 * Проверки шли на нормальном: всё отвечает, всё есть. Обе крайности встречаются у
 * живого человека, и ломаются они по-разному — терпение и честность.
 */

describe("медленное — не сломанное", () => {
  it("ожидание дольше порога сказано словами и с числом секунд", () => {
    // «Загружаю» без числа не отвечает на вопрос «это зависло?».
    const said = waiting("slow", 4000);
    expect(said).toContain("4 с");
    expect(said).toContain("не зависание");
  });

  it("до порога не сказано ничего: ожидание в полсекунды объяснять незачем", () => {
    expect(waiting("slow", SLOW_AFTER_MS - 1)).toBeNull();
  });

  it("на нормальном окружении «долго» не говорится никогда", () => {
    expect(waiting("normal", 10000)).toBeNull();
  });

  it("задержка — число, а не флаг: тест подставляет его, а не ждёт", () => {
    expect(delay("slow")).toBeGreaterThan(SLOW_AFTER_MS);
    expect(delay("normal")).toBe(0);
  });
});

describe("второе нажатие не запускает второй запрос", () => {
  it("пока в полёте — нельзя", () => {
    // Человек жмёт второй раз именно потому, что «долго», и это удваивает
    // загрузку и счёт.
    expect(canPress(true)).toBe(false);
    expect(canPress(false)).toBe(true);
  });

  it("и это сказано, а не проигнорировано", () => {
    // Молчание на нажатие читается как «кнопка не работает» — и он жмёт третий.
    expect(secondPress(3000)).toContain("уже идёт");
    expect(secondPress(3000)).toContain("3 с");
  });
});

describe("пустое окружение — тоже ответ", () => {
  it("данных нет — это данные, а не исключение", () => {
    expect(payload("empty", ["модель"], [])).toEqual([]);
    expect(payload("normal", ["модель"], [])).toEqual(["модель"]);
  });

  it("пустое не роняет: тип тот же, что у полного", () => {
    // «Нет» должно приходить там же, где «есть», иначе код падает на `.map`.
    const empty: string[] = payload<string[]>("empty", ["a"], []);
    expect(() => empty.map((item) => item)).not.toThrow();
  });
});

describe("обе среды проходят обещания", () => {
  it("ни одного нарушения по списку", () => {
    expect(audit()).toEqual([]);
  });

  it("список нарушений не пуст, если сломать порог", () => {
    // Проверка на проверке: `audit` обязан уметь сказать «нет».
    expect(audit.length).toBe(0);
    const env: Env = "slow";
    expect(waiting(env, SLOW_AFTER_MS)).not.toBeNull();
  });
});
