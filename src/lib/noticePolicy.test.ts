import { describe, expect, it } from "vitest";
import { cannotDisable, levels, roles, show, summary, type Settings, whyAlways } from "./noticePolicy";

/**
 * Шаг 337: уведомление об успехе — настраиваемо, об ошибке — всегда.
 */

const settings = (over: Partial<Settings> = {}): Settings => ({ success: "away", atDesk: false, ...over });

describe("ошибка — всегда и не отключается", () => {
  it("ошибка показывается при любых настройках", () => {
    for (const level of ["none", "away", "always"] as const) {
      expect(show("failed", settings({ success: level })).show).toBe(true);
    }
  });

  it("«не сообщать об ошибках» значит «сломался тихо»", () => {
    expect(show("failed", settings()).said).toContain("сломайся тихо");
  });

  it("в списке неотключаемого три вещи", () => {
    const got = cannotDisable();
    expect(got.length).toBe(3);
    expect(got.join()).toContain("петле");
    expect(got.join()).toContain("безопасности");
  });
});

describe("успех — три уровня", () => {
  it("«не сообщать»", () => {
    const got = show("done", settings({ success: "none" }));
    expect(got.show).toBe(false);
    expect(got.said).toContain("журнал");
  });

  it("«только если не у экрана» — у экрана молчим", () => {
    expect(show("done", settings({ atDesk: true })).show).toBe(false);
  });

  it("«только если не у экрана» — не у экрана сообщаем", () => {
    expect(show("done", settings({ atDesk: false })).show).toBe(true);
  });

  it("«всегда» — даже у экрана", () => {
    expect(show("done", settings({ success: "always", atDesk: true })).show).toBe(true);
  });

  it("три уровня названы словами, а не all/none", () => {
    const got = levels();
    expect(got.length).toBe(3);
    expect(got[0]!.label).toContain("журнале");
  });
});

describe("пропуск — не успех и не ошибка", () => {
  it("показывается: если ждали отчёт, знать надо", () => {
    expect(show("skipped", settings({ success: "none" })).show).toBe(true);
  });
});

describe("в настройках видно, что ошибки придут", () => {
  it("одна строка с двумя фактами", () => {
    expect(summary(settings())).toBe("успехи — только когда вас нет; ошибки сообщаются всегда");
  });

  it("почему у ошибки нет настройки", () => {
    expect(whyAlways()).toContain("нарушено незаметно");
  });
});

/**
 * Сведение с `resultNotice` (фаза 1, шаг 41): одна правда о «показывать ли».
 */
describe("роли разведены, дубль снят", () => {
  it("три роли названы, и решение — одно", () => {
    const got = roles();
    expect(got).toHaveLength(3);
    expect(got[0]).toContain("один ответ на два вопроса");
  });

  it("`show` учитывает и настройку, и «у экрана»", () => {
    expect(show("done", { success: "away", atDesk: true }).show).toBe(false);
    expect(show("done", { success: "away", atDesk: false }).show).toBe(true);
  });

  it("ошибка не выключается настройкой", () => {
    expect(show("failed", { success: "none", atDesk: true }).show).toBe(true);
  });
});
