import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { icon, mustHave, tooltip } from "./trayNative";

/**
 * Шаг 82: значок трея показывает состояние, а не просто «приложение запущено».
 *
 * Правило `trayNative.icon` обещало пять различимых значков и прямо называло
 * дефект: «не больше четырёх — больше человек не различает». А Rust ставил
 * значок **один раз при установке** и больше не менял никогда. То есть пауза,
 * сбой и идущее дело выглядели одинаково, и узнать о них можно было, только
 * наведя мышь — а на трей смотрят краем глаза, без наведения.
 *
 * `cargo` в песочнице нет, поэтому здесь читается исходник: проверка ловит
 * расхождение за секунду вместо пяти минут сборки.
 */

const source = readFileSync(new URL("../../src-tauri/src/tray.rs", import.meta.url), "utf8");

describe("значок трея (шаг 82)", () => {
  it("Rust умеет ставить значок, а не только подсказку", () => {
    expect(source).toContain("fn set_state_icon");
    expect(source).toContain("set_icon(Some(badge(");
  });

  it("каждое состояние правила имеет свою картинку", () => {
    const shapes = ["Ring", "Dot", "Bang", "Bars", "Cross"];
    shapes.forEach((shape) => expect(source).toContain(`Shape::${shape}`));
    // Правило называет пять состояний — и в Rust их тоже пять разных форм.
    const states = ["idle", "running", "waiting", "paused", "failed"] as const;
    const marks = states.map((state) => icon(state).mark);
    expect(new Set(marks).size).toBe(5);
  });

  it("значок ставится по состоянию паузы при установке", () => {
    // Запуск в паузе: первый же взгляд на трей не должен врать.
    expect(source).toMatch(/builder\.icon\(badge\(if paused_now/);
    expect(tooltip("paused")).toBe("на паузе");
  });

  it("пауза из трея сразу меняет значок, а не ждёт открытия окна", () => {
    // Окно может быть закрыто: пауза, поставленная из меню трея, иначе
    // осталась бы невидимой.
    const pauseBranch = source.slice(source.indexOf('"pause" =>'), source.indexOf('"stop-voice" =>'));
    expect(pauseBranch).toContain("mark_state");
    expect(pauseBranch).toContain('"paused"');
  });

  it("подсказка и значок меняются вместе", () => {
    // Две разные правды об одном состоянии — человек верит той, что видит.
    const body = source.slice(source.indexOf("pub fn set_voice_status"));
    expect(body).toContain("set_state_icon(app, icon_for(status))");
  });

  it("каждый голосовой статус окна попадает в известный значок", () => {
    const statuses = [
      "ready",
      "key-down",
      "key-up",
      "listening",
      "working",
      "awaiting-confirmation",
      "executing",
      "error",
      "deed-running",
      "deed-waiting",
    ];
    statuses.forEach((status) => {
      expect(source).toContain(`"${status}"`);
    });
  });

  it("подсказка паузы есть у обеих сторон", () => {
    // Раньше «paused» в `voice_tooltip` не было вовсе: статус из окна давал
    // ошибку «неизвестное состояние», и трей молча оставался прежним.
    expect(source).toContain('"paused" => Ok("на паузе: дела не запускаются")');
    expect(mustHave().join(" ")).toContain("пауза");
  });
});
