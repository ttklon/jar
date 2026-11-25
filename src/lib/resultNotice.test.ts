import { describe, expect, it } from "vitest";
import { AWAY_MS, bundle, forbidden, notify, onReturn, text, type AtDesk } from "./resultNotice";

/**
 * Шаг 324: уведомление о результате, если человек не у экрана.
 *
 * Дело, которое «сделалось» молча, — то же, что несделанное.
 */

const desk = (over: Partial<AtDesk> = {}): AtDesk => ({ idleMs: 60_000, foreground: true, ...over });

describe("у экрана или нет — один факт решает", () => {
  it("у экрана — уведомления нет, результат в окне", () => {
    const got = notify("done", desk());
    expect(got.show).toBe(false);
    expect(got.why).toContain("виден в окне");
  });

  it("ушёл больше десяти минут — уведомление", () => {
    const got = notify("done", desk({ foreground: false, idleMs: AWAY_MS + 1000 }));
    expect(got.show).toBe(true);
    expect(got.why).toContain("больше десяти минут");
  });

  it("отошёл на минуту — уведомления нет", () => {
    expect(notify("done", desk({ foreground: false, idleMs: 60_000 })).show).toBe(false);
  });

  it("ошибка — всегда, даже у экрана", () => {
    const got = notify("failed", desk());
    expect(got.show).toBe(true);
    expect(got.why).toContain("говорим всегда");
  });

  it("пропуск тоже уведомляет: человек мог ждать", () => {
    expect(notify("skipped", desk()).show).toBe(true);
  });
});

describe("текст — результат, а не «задача выполнена»", () => {
  it("успех: что стало видно", () => {
    expect(text("done", "Уборка загрузок", "удалено 12 файлов, освободилось 340 МБ")).toBe(
      "Уборка загрузок: удалено 12 файлов, освободилось 340 МБ",
    );
  });

  it("ошибка: что не получилось и что дальше", () => {
    const got = text("failed", "Уборка", "папка занята другой программой");
    expect(got).toContain("не получилось");
    expect(got).toContain("Открыть");
  });

  it("пропуск: «не запускалось», а не «выполнено»", () => {
    expect(text("skipped", "Отчёт о диске", "места было достаточно")).toContain("не запускалось");
  });
});

describe("три дела в минуту — одно уведомление", () => {
  it("одно остаётся как есть", () => {
    expect(bundle(["убрано 12 файлов"])).toBe("убрано 12 файлов");
  });

  it("три — списком внутри одного", () => {
    const got = bundle(["убрано 12 файлов", "отчёт о диске", "проверка обновлений"]);
    expect(got).toContain("Сделано 3 дела");
    expect(got.split("Сделано").length).toBe(2);
  });

  it("ничего — пустая строка, а не «0 дел»", () => {
    expect(bundle([])).toBe("");
  });
});

describe("чего уведомление не делает", () => {
  it("ни звука, ни поверх окон, ни повтора", () => {
    const got = forbidden().join();
    expect(got).toContain("звук");
    expect(got).toContain("поверх всех окон");
    expect(got).toContain("преследование");
  });
});

describe("вернулся — одно сообщение, а не очередь", () => {
  it("что было, пока не было", () => {
    expect(onReturn(["убрано 12 файлов", "отчёт о диске"])).toBe("пока вас не было: убрано 12 файлов; отчёт о диске");
  });

  it("ничего не было — так и говорим", () => {
    expect(onReturn([])).toBe("пока вас не было, автоматических дел не было");
  });
});
