import { describe, expect, it } from "vitest";
import { fire, off, on, parse, riskyAction, summary } from "./whenThen";

/**
 * Шаг 284: Home Assistant — автоматизации и триггеры описываются человеком.
 *
 * Взято: «когда — тогда» словами. Не взято: YAML, чужие готовые сценарии,
 * молчаливое срабатывание.
 */

describe("правило описывается так, как человек думает", () => {
  it("«когда … тогда …» разбирается", () => {
    const got = parse("когда я открою Chrome, тогда включи музыку", "r1");
    expect(got.rule).not.toBeNull();
    expect(got.rule!.then).toBe("включи музыку");
    expect(got.rule!.when.kind).toBe("app");
  });

  it("время узнаётся", () => {
    const got = parse("когда 18:00, то напомни про отчёт", "r1");
    expect(got.rule!.when).toEqual({ kind: "time", at: "18:00" });
  });

  it("без «когда» правило не создаётся", () => {
    const got = parse("включи музыку", "r1");
    expect(got.rule).toBeNull();
    expect(got.said).toContain("когда …");
  });

  it("«тогда» без действия ничего не делает — и это сказано", () => {
    const got = parse("когда 18:00, тогда ", "r1");
    expect(got.rule).toBeNull();
    expect(got.said).toContain("действие не названо");
  });

  it("непонятное условие называется, а не угадывается", () => {
    const got = parse("когда луна встанет, тогда погаси свет", "r1");
    expect(got.rule).toBeNull();
    expect(got.said).toContain("не понял условие");
    expect(got.said).toContain("луна встанет");
  });

  it("правило сразу говорит, что будет делать", () => {
    const got = parse("когда я скажу «дом», тогда включи свет", "r1");
    expect(got.said).toContain("включи свет");
  });
});

describe("опасное действие спрашивает даже в правиле", () => {
  it("«удали» требует подтверждения", () => {
    // «Когда прихожу — удали Temp» звучит удобно, и именно поэтому удаляет без человека.
    expect(riskyAction("удали временные файлы")).toBe(true);
    const got = parse("когда я открою Chrome, тогда удали Temp", "r1");
    expect(got.rule!.risky).toBe(true);
    expect(got.said).toContain("спрошу перед выполнением");
  });

  it("«включи музыку» не опасное", () => {
    expect(riskyAction("включи музыку")).toBe(false);
  });

  it("сработавшее опасное правило не выполняется само", () => {
    const rule = parse("когда 18:00, тогда очисти диск", "r1").rule!;
    const got = fire(rule);
    expect(got.run).toBe(false);
    expect(got.ask).toBe(true);
    expect(got.said).toContain("действие опасное");
  });

  it("безопасное правило выполняется и называется", () => {
    const rule = parse("когда 18:00, тогда включи музыку", "r1").rule!;
    const got = fire(rule);
    expect(got.run).toBe(true);
    expect(got.said).toBe("правило: включи музыку");
  });
});

describe("выключить — не значит удалить", () => {
  it("выключенное правило не срабатывает", () => {
    const rule = parse("когда 18:00, тогда включи музыку", "r1").rule!;
    const list = off([rule], "r1");
    expect(list[0]!.on).toBe(false);
    expect(fire(list[0]!)).toEqual({ run: false, ask: false, said: "правило «включи музыку» выключено — ничего не делаю" });
  });

  it("выключенное можно вернуть", () => {
    const rule = parse("когда 18:00, тогда включи музыку", "r1").rule!;
    expect(on(off([rule], "r1"), "r1")[0]!.on).toBe(true);
  });

  it("правило после выключения остаётся в списке", () => {
    const rule = parse("когда 18:00, тогда включи музыку", "r1").rule!;
    expect(off([rule], "r1").length).toBe(1);
  });
});

describe("сводка называет числа", () => {
  it("включено, выключено, спрашивают подтверждение", () => {
    const a = parse("когда 18:00, тогда включи музыку", "r1").rule!;
    const b = parse("когда 19:00, тогда удали Temp", "r2").rule!;
    const got = summary(off([a, b], "r1"));
    expect(got).toContain("правил 2");
    expect(got).toContain("включено 1");
    expect(got).toContain("выключено 1");
    expect(got).toContain("спрашивают подтверждение 1");
  });

  it("пустой список — не «всё хорошо»", () => {
    expect(summary([])).toContain("правил нет");
  });
});
