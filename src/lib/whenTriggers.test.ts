import { describe, expect, it } from "vitest";
import { WATCHABLE, atSignIn, check, describe as describeTrigger, limits } from "./whenTriggers";

/**
 * Шаг 322: триггеры — время, событие, вход в систему.
 *
 * Событие, которое нельзя проверить, не предлагается.
 */

describe("три вида, и все проверяемы", () => {
  it("время внутри суток — проходит", () => {
    expect(check({ kind: "time", at: 540 })).toEqual([]);
  });

  it("время вне суток — ошибка", () => {
    expect(check({ kind: "time", at: 1440 }).join()).toContain("0–1439");
  });

  it("наблюдение только за разрешёнными папками", () => {
    expect(WATCHABLE).toEqual(["downloads", "desktop", "documents", "custom"]);
    expect(check({ kind: "fileAppeared", folder: "downloads" })).toEqual([]);
  });

  it("чужая папка — права и батарея", () => {
    const got = check({ kind: "fileAppeared", folder: "system32" as never });
    expect(got.join()).toContain("не в списке наблюдения");
  });

  it("порог диска 3 % — уже поздно", () => {
    const got = check({ kind: "diskFull", percent: 3 });
    expect(got.join()).toContain("уже поздно");
  });

  it("порог 100 % — не порог", () => {
    expect(check({ kind: "diskFull", percent: 100 }).join()).toContain("между 1 и 99");
  });
});

describe("человеку триггер называется словами", () => {
  it("время с ведущим нулём", () => {
    expect(describeTrigger({ kind: "time", at: 540 })).toBe("каждый день в 09:00");
  });

  it("файл — с названием папки, а не «downloads»", () => {
    expect(describeTrigger({ kind: "fileAppeared", folder: "downloads" })).toBe("когда в «Загрузках» появляется файл");
  });

  it("диск — с порогом", () => {
    expect(describeTrigger({ kind: "diskFull", percent: 10 })).toContain("меньше 10 %");
  });

  it("вход в систему — по-человечески", () => {
    expect(describeTrigger({ kind: "signIn" })).toBe("когда вы входите в систему");
  });
});

describe("пределы называются до создания правила", () => {
  it("файл может появиться недокачанным", () => {
    const got = limits({ kind: "fileAppeared", folder: "downloads" });
    expect(got.join()).toContain("недокачанным");
  });

  it("диск срабатывает один раз, а не спамит", () => {
    expect(limits({ kind: "diskFull", percent: 10 }).join()).toContain("спам");
  });

  it("вход в систему — автозагрузка и задержка", () => {
    const got = limits({ kind: "signIn" }).join();
    expect(got).toContain("автозагрузку");
    expect(got).toContain("10–20 секунд");
  });

  it("сон не съедает дело", () => {
    expect(limits({ kind: "time", at: 540 }).join()).toContain("спросим");
  });

  it("про вход отдельно: дела идут после того, как всё успокоится", () => {
    expect(atSignIn()).toContain("а не сразу");
  });
});
