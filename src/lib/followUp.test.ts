import { describe, expect, it } from "vitest";
import { followUpQuery, isFollowUp } from "./followUp";

describe("продолжение фразы", () => {
  it("узнаёт короткое продолжение и не путает его с новой задачей", () => {
    expect(isFollowUp("Ещё")).toBe(true);
    expect(isFollowUp("повтори.")).toBe(true);
    expect(isFollowUp("дальше")).toBe(true);
    expect(isFollowUp("ещё тише")).toBe(false);
    expect(isFollowUp("да")).toBe(false);
    expect(isFollowUp("стоп")).toBe(false);
  });

  it("без прошлой фразы ничего не выдумывает", () => {
    expect(followUpQuery(null, "ещё")).toBe("ещё");
    expect(followUpQuery("  ", "повтори")).toBe("повтори");
  });

  it("повтор отдаёт ту же фразу, продолжение несёт её рядом", () => {
    expect(followUpQuery("сколько места", "повтори")).toBe("сколько места");
    expect(followUpQuery("сколько места", "ещё")).toBe("сколько места. ещё");
    expect(followUpQuery("сколько места", "удали a.txt")).toBe("удали a.txt");
  });
});