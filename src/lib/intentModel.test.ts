import { describe, expect, it } from "vitest";
import { accept, needsBig, say, share, SURE_AT, worthTwo } from "./intentModel";

/**
 * Шаг 66: отдельная дешёвая модель для «понять фразу».
 *
 * «Открой блокнот» ждёт семь секунд, пока 7B разберётся, что это две команды.
 * Семь секунд на простую фразу — не медлительность, а неверный выбор модели.
 */
const KNOWN = ["открыть", "закрыть", "найти", "архивировать"];

describe("разбор намерения — классификация, а не рассуждение", () => {
  it("уверенная дешёвая модель закрывает фразу сама", () => {
    // 7B не просыпается — это и есть выигрыш шага.
    const verdict = accept("открыть", 0.9, KNOWN);
    expect(verdict.ok).toBe(true);
    expect(needsBig(verdict)).toBe(false);
  });

  it("большая модель нужна, когда дешёвая не уверена", () => {
    // Дешёвая ошибается чаще, и ошибка её незаметна: «архивировать» вместо
    // «опубликовать» — это выполненное не то действие.
    const verdict = accept("открыть", SURE_AT - 0.05, KNOWN);
    expect(verdict.ok).toBe(false);
    expect(needsBig(verdict)).toBe(true);
  });

  it("порог назван числом, а не «на глаз»", () => {
    expect(SURE_AT).toBe(0.6);
    expect(accept("открыть", SURE_AT, KNOWN).ok).toBe(true);
  });
});

describe("не поняла — не врёт", () => {
  it("команда не названа — разбирается большая", () => {
    expect(needsBig(accept(null, 0.99, KNOWN))).toBe(true);
    expect(needsBig(accept("   ", 0.99, KNOWN))).toBe(true);
  });

  it("«вспомнила» несуществующую команду — самый худший вид ошибки", () => {
    // Уверенно и неверно; такая ошибка не видна ни человеку, ни проверке.
    const verdict = accept("опубликовать", 0.95, KNOWN);
    expect(verdict.ok).toBe(false);
    expect(verdict.ok === false ? verdict.why : "").toContain("нет");
  });
});

describe("две модели стоят памяти только если помогают", () => {
  it("доля считается по живым фразам", () => {
    expect(share({ cheap: 8, big: 2 })).toBe(0.8);
    expect(share({ cheap: 0, big: 0 })).toBe(0);
  });

  it("меньше половины — вторая модель только занимает память", () => {
    // Она нужна не бесплатно (шаг 63).
    expect(worthTwo({ cheap: 3, big: 7 })).toBe(false);
    expect(worthTwo({ cheap: 5, big: 5 })).toBe(true);
  });
});

describe("человеку сказано, что происходит", () => {
  it("быстрый разбор назван быстрым", () => {
    // Иначе быстрый ответ на простую фразу и медленный на сложную выглядят как
    // нестабильность.
    const said = say(accept("найти", 0.9, KNOWN));
    expect(said).toContain("быстрая модель");
  });

  it("передача большой модели объяснена причиной", () => {
    const said = say(accept("найти", 0.3, KNOWN));
    expect(said).toContain("подробнее");
    expect(said).toContain("%");
  });
});
