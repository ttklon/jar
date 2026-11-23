import { describe, expect, it } from "vitest";
import { BEHAVIOUR, behaviourFor, command, sayFor } from "./stopWords";

/**
 * Шаг 45: «стоп» и «подожди» — слова разные, и поведения разные.
 *
 * Стоп — отказ (замолчи и не начинай), перебивание — разговор (замолчи и слушай
 * дальше, потому что человек скажет ещё). Склеить их значит либо обрывать
 * разговор на «подожди», либо продолжать после «стоп».
 */
describe("что считается командой", () => {
  it("«стоп» — отказ, «подожди» — перебивание", () => {
    expect(command("стоп")).toBe("stop");
    expect(command("Стоп.")).toBe("stop");
    expect(command("подожди")).toBe("interrupt");
    expect(command("Погоди!")).toBe("interrupt");
  });

  it("вежливость не меняет смысла", () => {
    // «Стоп, пожалуйста» — всё ещё стоп. Отказ, сказанный вежливо, — отказ.
    expect(command("стоп, пожалуйста")).toBe("stop");
  });

  it("слово посреди фразы — не команда", () => {
    // «Стоп, где мой файл» — просьба. Съесть её значит не услышать человека.
    expect(command("стоп, где мой файл")).toBeNull();
    expect(command("не надо стоп")).toBeNull();
    expect(command("подожди, пока я подумаю")).toBeNull();
  });

  it("незнакомое слово — не команда", () => {
    // Угадывать здесь дорого: человек просит остановиться, а приложение делает
    // вид, что не поняло.
    expect(command("остановись")).toBeNull();
    expect(command("прекрати")).toBeNull();
    expect(command("создай папку")).toBeNull();
    expect(command("")).toBeNull();
  });
});

describe("поведение", () => {
  it("стоп прекращает всё и не спрашивает", () => {
    // Подтверждение было бы издевательством: человек уже сказал «нет».
    expect(BEHAVIOUR.stop.halt).toBe(true);
    expect(BEHAVIOUR.stop.listenOn).toBe(false);
    expect(BEHAVIOUR.stop.confirm).toBe(false);
  });

  it("перебивание замолкает, но слушает дальше", () => {
    // Ответ на «подожди» — не тишина, а внимание: человек собирается сказать ещё.
    expect(BEHAVIOUR.interrupt.halt).toBe(false);
    expect(BEHAVIOUR.interrupt.listenOn).toBe(true);
  });

  it("два поведения различаются — иначе зачем их различать", () => {
    // Если бы поведения совпадали, шаг был бы выполнен формально.
    expect(BEHAVIOUR.stop.halt).not.toBe(BEHAVIOUR.interrupt.halt);
    expect(BEHAVIOUR.stop.listenOn).not.toBe(BEHAVIOUR.interrupt.listenOn);
  });

  it("по фразе сразу видно, что делать", () => {
    expect(behaviourFor("стоп")?.halt).toBe(true);
    expect(behaviourFor("подожди")?.listenOn).toBe(true);
    // Обычная фраза — не команда: пусть идёт своим путём.
    expect(behaviourFor("создай папку")).toBeNull();
  });

  it("человеку сказано, что произойдёт, — до того, как он скажет", () => {
    // Последствия разные, и знать их надо заранее.
    expect(sayFor("stop")).toContain("прекращает");
    expect(sayFor("interrupt")).toContain("слушает");
    expect(sayFor("stop")).not.toBe(sayFor("interrupt"));
  });
});
