import { describe, expect, it } from "vitest";
import {
  build,
  FRAME_MS,
  instant,
  instantEnough,
  modelNeeded,
  provenance,
  refresh,
  save,
  store,
} from "./instantAnswers";

/**
 * Шаг 132: «что умеешь / где данные / как дела» — без модели и мгновенно.
 *
 * Ответ, известный заранее, всё равно собирался на месте и ждал чтения реестра.
 */
const numbers = { actions: 835, hands: 56, version: "835:12:56" };

describe("ответ готов до вопроса", () => {
  it("есть даже без чисел: ждать нечего", () => {
    const got = instant(store(), "skills");
    expect(got.said).toContain("полный список — в журнале");
    expect(got.numbers).toBe("none");
  });

  it("«где данные» — свойство приложения, числа не нужны вовсе", () => {
    expect(build("data", numbers).numbers).toBe("none");
    expect(build("data", numbers).said).toContain("наружу ничего не уходит");
  });

  it("модель не нужна ни для одного из трёх", () => {
    // Это условие, а не «повезло»: ответ не зависит от модели.
    expect(modelNeeded("skills")).toBe(false);
    expect(modelNeeded("data")).toBe(false);
    expect(modelNeeded("health")).toBe(false);
  });
});

describe("мгновенно — это в кадре, и это проверяется", () => {
  it("12 мс — мгновенно", () => {
    expect(instantEnough(12)).toEqual({ ok: true, said: "12 мс — в кадре" });
  });

  it("40 мс — уже задержка, и так и называется", () => {
    const got = instantEnough(40);
    expect(got.ok).toBe(false);
    expect(got.said).toContain(`дольше кадра (${FRAME_MS} мс)`);
  });

  it("ответ берётся синхронно — асинхронность была бы кадром на ровном месте", () => {
    // Синхронный результат: не Promise, и это часть условия.
    const got = instant(store(), "health");
    expect(typeof got.said).toBe("string");
  });
});

describe("прошлое названо прошлым, а не свежим", () => {
  it("числа прошлого запуска помечены", () => {
    const kept = store([build("skills", numbers, true)]);
    expect(provenance(instant(kept, "skills"))).toContain("из прошлого запуска — могли измениться");
  });

  it("свежие числа так и названы", () => {
    expect(provenance(build("skills", numbers))).toBe("числа из реестра этого запуска");
  });

  it("без чисел — без чисел", () => {
    expect(provenance(build("skills", null))).toContain("реестр ещё не прочитан");
  });
});

describe("кэш переживает перезапуск", () => {
  it("сохранённое возвращается готовым", () => {
    const live = store();
    refresh(live, "skills", numbers, false);
    const next = store(save(live));
    expect(instant(next, "skills").said).toContain("835");
  });

  it("свойство не портится числом: старый ответ остаётся верным по смыслу", () => {
    const old = build("skills", { actions: 800, hands: 50, version: "800:12:50" }, true);
    expect(old.said).toContain("полный список — в журнале");
  });
});
