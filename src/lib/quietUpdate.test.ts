import { describe, expect, it } from "vitest";
import { auditSetup, decide, notifyText, revoke, setting, type Consent } from "./quietUpdate";

/**
 * Шаг 318: тихое обновление только с согласия; иначе — уведомление.
 *
 * Тихо — только если человек согласился тихо обновляться.
 */

const yes: Consent = { quiet: true, at: 1_700_000_000_000 };
const no: Consent = { quiet: false, at: 1_700_000_000_000 };

describe("тихо — только с согласием", () => {
  it("исправления при согласии — тихо", () => {
    expect(decide("fix", yes, false).action).toBe("silent");
  });

  it("без согласия — уведомление, ставит человек", () => {
    const got = decide("fix", null, false);
    expect(got.action).toBe("notify");
    expect(got.said).toContain("поставит человек");
  });

  it("отказ тоже не разрешает тихо", () => {
    expect(decide("fix", no, false).action).toBe("notify");
  });
});

describe("безопасность говорим всегда", () => {
  it("даже при согласии — уведомление, а не тишина", () => {
    const got = decide("security", yes, false);
    expect(got.action).toBe("notify");
    expect(got.said).toContain("говорим всегда");
  });

  it("без согласия — спрашиваем сразу", () => {
    expect(decide("security", null, false).action).toBe("askNow");
  });
});

describe("новые функции и смена вида — никогда тихо", () => {
  it("новые возможности не ставятся тихо никогда", () => {
    expect(decide("feature", yes, false).said).toContain("никогда");
  });

  it("перемены в интерфейсе замечают все", () => {
    expect(decide("look", yes, false).said).toContain("замечают все");
  });
});

describe("во время дела — ждём, даже с согласием", () => {
  it("тихое обновление тоже рвёт работу", () => {
    const got = decide("fix", yes, true);
    expect(got.action).not.toBe("silent");
    expect(got.said).toContain("конца дела");
  });
});

describe("уведомление — одна строка без номеров сборки", () => {
  it("про безопасность сказано прямо", () => {
    expect(notifyText("security")).toContain("исправлением безопасности");
  });

  it("и спрашивается «поставить ли», а не «обновлено»", () => {
    expect(notifyText("fix")).toContain("Поставить");
  });
});

describe("настройки и отмена", () => {
  it("при согласии видно, что именно ставится само", () => {
    expect(setting(yes)).toContain("исправления ставятся сами");
  });

  it("без согласия — «спрашиваем перед каждой установкой»", () => {
    expect(setting(null)).toContain("спрашиваем перед каждой");
  });

  it("отмена действует сразу, а не после обновления", () => {
    const got = revoke(1_700_000_000_000);
    expect(got.quiet).toBe(false);
    expect(decide("fix", got, false).action).toBe("notify");
  });

  it("галочка в первом запуске — не согласие", () => {
    expect(auditSetup(true, false).join()).toContain("не согласие, а галочка");
    expect(auditSetup(true, true)).toEqual([]);
  });
});
