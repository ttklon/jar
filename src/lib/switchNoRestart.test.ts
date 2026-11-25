import { describe, expect, it } from "vitest";
import type { Profile } from "./peopleProfiles";
import { changes, cost, switchTo, verify, type Live } from "./switchNoRestart";

/**
 * Шаг 412: переключение профиля не перезапускает приложение.
 */

const anna: Profile = { person: { id: "anna", name: "Анна" }, facts: [], allowed: [], guest: false };
const son: Profile = { person: { id: "son", name: "Сын" }, facts: [], allowed: [], guest: false };

const live = (over: Partial<Live> = {}): Live => ({ who: anna, draft: "", stepsDone: 0, modelReady: false, window: true, ...over });

describe("переключение — смена ссылок, не перезапуск", () => {
  it("ноль перезапусков", () => {
    expect(cost().restarts).toBe(0);
  });

  it("человек сменился", () => {
    const got = switchTo(live(), [anna, son], "son");
    expect(got.live.who.person.name).toBe("Сын");
  });

  it("набранная фраза, дело и модель остаются", () => {
    const got = switchTo(live({ draft: "почисти загруз", stepsDone: 3, modelReady: true }), [anna, son], "Сын");
    expect(got.kept).toContain("набранная фраза");
    expect(got.kept).toContain("идущее дело");
    expect(got.kept).toContain("загруженная модель");
    expect(verify(live({ draft: "почисти загруз", stepsDone: 3, modelReady: true }), got.live)).toEqual([]);
  });

  it("нет такого человека — ничего не меняется", () => {
    const got = switchTo(live(), [anna], "Гость");
    expect(got.live.who.person.name).toBe("Анна");
    expect(got.said).toContain("не переключился");
  });

  it("поиск и по имени, и по id", () => {
    expect(switchTo(live(), [anna, son], "anna").live.who.person.name).toBe("Анна");
  });
});

describe("что считается поломкой", () => {
  it("потерянная фраза", () => {
    const got = verify(live({ draft: "привет" }), live({ draft: "" }));
    expect(got.join()).toContain("потерялась");
  });

  it("потерянные шаги", () => {
    expect(verify(live({ stepsDone: 3 }), live({ stepsDone: 0 })).join()).toContain("потеряло выполненные шаги");
  });

  it("выгруженная модель", () => {
    expect(verify(live({ modelReady: true }), live({ modelReady: false })).join()).toContain("десятки секунд");
  });
});

describe("что переключение меняет", () => {
  it("три вещи и ни одной лишней", () => {
    expect(changes().length).toBe(3);
    expect(changes().join()).toContain("снова спрашивается");
  });
});
