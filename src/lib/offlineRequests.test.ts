import { describe, expect, it } from "vitest";
import {
  atStart,
  lines,
  promise,
  verdict,
  type Attempt,
} from "./offlineRequests";

/**
 * Шаг 220: без сети нет ни одного неуспешного запроса, кроме названного.
 *
 * Проверяется не «функция отработала», а точность обещания: тихий провал и
 * запрос без нажатия — разные дефекты, и оба должны быть видны по имени.
 */

const start: Attempt = { where: "https://api.example.com/v1", by: "start", result: "offline", what: "проверка обновлений" };
const press: Attempt = { where: "https://huggingface.co/model.gguf", by: "press", result: "offline", what: "скачивание модели" };
const local: Attempt = { where: "http://127.0.0.1:8080/health", by: "background", result: "failed", what: "проверка движка" };

describe("без сети приложение не стучится вовсе", () => {
  it("ноль запросов при запуске — это и есть обещание", () => {
    expect(atStart([press, local])).toBe(0);
    expect(verdict([press, local], [{ where: press.where, how: "кнопка «Скачать»" }]).ok).toBe(true);
  });

  it("запрос при запуске — назван отдельно от тихого провала", () => {
    const got = verdict([start], [{ where: start.where, how: "строка на экране" }]);
    expect(got.ok).toBe(false);
    // Это не «мелкий провал»: нарушено обещание «при запуске никуда не ходим».
    expect(got.unasked.map((item) => item.where)).toEqual([start.where]);
    expect(got.said).toContain("без нажатия");
  });

  it("локальный запрос не считается выходом наружу", () => {
    // Иначе список утонет в локальных пингах и перестанет читаться.
    expect(verdict([local], []).ok).toBe(true);
  });
});

describe("провал обязан быть назван", () => {
  it("названный провал — не дефект", () => {
    const got = verdict([press], [{ where: press.where, how: "кнопка «Скачать»" }]);
    expect(got.ok).toBe(true);
    expect(got.said).toContain("назван человеку до нажатия");
  });

  it("неназванный провал — дефект, и он назван адресом", () => {
    const got = verdict([press], []);
    expect(got.ok).toBe(false);
    expect(got.said).toContain("huggingface.co");
    // Тихий провал читается как «всё хорошо» — это и есть тихая ошибка.
    expect(got.said).toContain("тихая ошибка");
  });

  it("назван один, провалились два — виден второй, а не «все названы»", () => {
    const other: Attempt = { where: "https://cdn.example.com/x", by: "press", result: "failed", what: "скачивание движка" };
    const got = verdict([press, other], [{ where: press.where, how: "кнопка" }]);
    expect(got.silent.map((item) => item.where)).toEqual([other.where]);
  });
});

describe("«нет сети» — состояние, а не ошибка", () => {
  it("успешных нет, все провалы названы — обещание сбылось", () => {
    expect(verdict([press], [{ where: press.where, how: "кнопка" }]).ok).toBe(true);
  });

  it("когда всё чисто — сказано «ни одного запроса наружу»", () => {
    expect(verdict([local], []).said).toContain("не стучалось вовсе");
  });

  it("promise молчит, если обещание нарушено", () => {
    // Показывать «всё хорошо» рядом с нарушением — учить не читать его.
    expect(promise([press], [])).toBeNull();
    expect(promise([press], [{ where: press.where, how: "кнопка" }])).toContain("назван");
  });
});

describe("список для человека", () => {
  it("по чьей воле и чем кончилось — в каждой строке", () => {
    const shown = lines([start, press, local]);
    expect(shown[0]).toContain("при запуске");
    expect(shown[1]).toContain("по нажатию");
    expect(shown[1]).toContain("нет сети");
    expect(shown[2]).toContain("в фоне");
  });

  it("порядок — порядок случившегося, а не алфавит", () => {
    // Перестановка спрятала бы первое, что стукнулось при запуске.
    const shown = lines([start, press]);
    expect(shown[0]).toContain("проверка обновлений");
  });
});
