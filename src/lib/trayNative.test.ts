import { describe, expect, it } from "vitest";
import { exitWarn, icon, matchesRust, menu, mustHave, notDo, tooltip, type State } from "./trayNative";

/**
 * Шаг 441: трей — состояние, пауза, выход.
 */

describe("подсказка говорит состояние, а не название", () => {
  it("идёт дело — что именно", () => {
    expect(tooltip("running", "уборка загрузок")).toBe("делаю «уборка загрузок»");
  });

  it("ждёт ответа — так и сказано", () => {
    expect(tooltip("waiting", "уборка")).toContain("жду вашего ответа");
  });

  it("на паузе, сбой, простой — у каждого свой текст", () => {
    expect(tooltip("paused")).toContain("на паузе");
    expect(tooltip("failed")).toContain("не получилось");
    expect(tooltip("idle")).toContain("жду вашу фразу");
  });
});

describe("меню в привычном порядке", () => {
  it("выход последним всегда", () => {
    for (const state of ["idle", "running", "waiting", "paused", "failed"] as State[]) {
      expect(menu(state).at(-1)!.id).toBe("quit");
    }
  });

  it("идёт дело — пункт «что сейчас делаю»", () => {
    expect(menu("running").map((i) => i.id)).toContain("now");
    expect(menu("idle").map((i) => i.id)).not.toContain("now");
  });

  it("пауза меняется на «Продолжить», а не обе сразу", () => {
    const paused = menu("paused").map((i) => i.id);
    expect(paused).toContain("resume");
    expect(paused).not.toContain("pause");
  });
});

describe("выход во время дела — с предупреждением", () => {
  it("простой — молча", () => {
    expect(exitWarn("idle", 0, 0)).toBeNull();
  });

  it("идёт дело — с прогрессом и обещанием продолжить", () => {
    const got = exitWarn("running", 2, 7);
    expect(got).toContain("выполнено 2 из 7 шагов");
    expect(got).toContain("продолжить можно будет с этого шага");
  });

  it("шагов нет — коротко", () => {
    expect(exitWarn("waiting", 0, 0)).toContain("не закончится");
  });
});

describe("иконка отражает состояние", () => {
  it("четыре значка различаются", () => {
    const marks = (["idle", "running", "waiting", "paused"] as State[]).map((s) => icon(s).mark);
    expect(new Set(marks).size).toBe(4);
  });

  it("жду ответа — важнее всего прочего", () => {
    expect(icon("waiting").said).toContain("без вас дело стоит");
  });
});

describe("что трей не делает", () => {
  it("три запрета, включая порядок пунктов", () => {
    const got = notDo().join();
    expect(got).toContain("обрывается молча");
    expect(got).toContain("мышца помнит место");
  });
});

/**
 * Сведение с Rust (фаза 1, шаг 41).
 *
 * Проверка нашла расхождение: подсказка в Rust повторяла имя, а меню было короче
 * правила. Теперь правило перечисляет обязательное, и тест держит Rust рядом.
 */
describe("правило и Rust сходятся", () => {
  it("три требования названы", () => {
    expect(mustHave()).toHaveLength(3);
    expect(mustHave()[0]).toContain("без имени");
  });

  it("меню Rust с «выход» последним — сходится", () => {
    expect(matchesRust(["show", "stop-voice", "quit"])).toEqual([]);
  });

  it("без «выход» или не последним — расхождение", () => {
    expect(matchesRust(["show", "stop-voice"]).join()).toContain("нет пункта «выход»");
    expect(matchesRust(["quit", "show"]).join()).toContain("«выход» не последний");
  });

  it("без разговора — расхождение", () => {
    expect(matchesRust(["show", "quit"]).join()).toContain("нет пункта разговора");
  });

  it("правило требует состояние, а не имя", () => {
    // Подсказка с именем — это повтор, а не состояние.
    expect(tooltip("idle")).not.toContain("ZShelper");
    expect(tooltip("idle")).toBe("жду вашу фразу");
  });
});
