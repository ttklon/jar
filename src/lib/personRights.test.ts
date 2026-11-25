import { describe, expect, it } from "vitest";
import { burn, find, holds, may, revoke, whyPerPerson, type Grant } from "./personRights";

/**
 * Шаг 403: разрешения по человеку, а не по машине. Чужое согласие не считается моим.
 */

const now = 1_700_000_000_000;
const grant = (over: Partial<Grant> = {}): Grant => ({
  to: "anna", risk: "delete", scope: "C:\\Users\\anna\\Загрузки", at: now, forMs: 0, once: false, ...over,
});

describe("разрешение — кто, что и до каких пор", () => {
  it("своё действует", () => {
    expect(holds(grant(), "anna", "delete", "C:\\Users\\anna\\Загрузки", now)).toBe(true);
  });

  it("чужое не действует — даже на том же компьютере", () => {
    expect(holds(grant(), "son", "delete", "C:\\Users\\anna\\Загрузки", now)).toBe(false);
  });

  it("другое действие — не действует", () => {
    expect(holds(grant(), "anna", "send", "C:\\Users\\anna\\Загрузки", now)).toBe(false);
  });

  it("истекло — не действует", () => {
    const old = grant({ at: now - 10_000, forMs: 5000 });
    expect(holds(old, "anna", "delete", "C:\\Users\\anna\\Загрузки", now)).toBe(false);
  });

  it("вложенная папка покрыта, соседняя — нет", () => {
    expect(holds(grant(), "anna", "delete", "C:\\Users\\anna\\Загрузки\\музыка", now)).toBe(true);
    expect(holds(grant(), "anna", "delete", "C:\\Users\\anna\\Документы", now)).toBe(false);
  });

  it("«всё» покрывает всё", () => {
    expect(holds(grant({ scope: "всё" }), "anna", "delete", "D:\\что угодно", now)).toBe(true);
  });
});

describe("без разрешения — спрашиваем, чтение — не спрашиваем", () => {
  it("чтение не требует согласия", () => {
    expect(may([], "son", "read", "D:\\", now).ok).toBe(true);
  });

  it("опасное без разрешения — вопрос", () => {
    const got = may([grant()], "son", "delete", "C:\\Users\\anna\\Загрузки", now);
    expect(got.ok).toBe(false);
    expect(got.because).toContain("спрошу у него");
  });

  it("сказано, на сколько выдано", () => {
    expect(may([grant()], "anna", "delete", "C:\\Users\\anna\\Загрузки", now).because).toContain("до отзыва");
  });

  it("найдено — и чьё именно", () => {
    expect(find([grant()], "anna", "delete", "C:\\Users\\anna\\Загрузки", now)?.to).toBe("anna");
  });
});

describe("одноразовое сгорает", () => {
  it("после выполнения его больше нет", () => {
    const once = grant({ once: true });
    expect(burn([once], once)).toEqual([]);
  });

  it("постоянное не сгорает", () => {
    const g = grant();
    expect(burn([g], g)).toHaveLength(1);
  });
});

describe("отзыв по человеку и по действию", () => {
  it("всё у сына", () => {
    const grants = [grant(), grant({ to: "son" }), grant({ to: "son", risk: "send" })];
    expect(revoke(grants, "son", null).removed).toBe(2);
  });

  it("удаление у всех", () => {
    const grants = [grant(), grant({ to: "son" }), grant({ to: "son", risk: "send" })];
    const got = revoke(grants, null, "delete");
    expect(got.removed).toBe(2);
    expect(got.left).toHaveLength(1);
  });

  it("почему не «на компьютере» — сказано прямо", () => {
    expect(whyPerPerson()).toContain("включая гостя");
  });
});
