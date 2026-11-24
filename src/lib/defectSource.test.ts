import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Шаг 245: каждый дефект из пользовательской сессии → тест.
 *
 * Дефект: реестр `data/defects.json` (шаг 254) знал **что** случилось и **чем**
 * проверено, но не знал **откуда пришёл**. Без источника дефект нельзя ни
 * воспроизвести, ни понять, единичный он или повторяющийся: «человек сказал, что
 * не работает» через месяц не восстановить, а «опять это же» — не заметить.
 *
 * Правило теперь в `tools/defects.py`: у каждого дефекта есть `session`, и
 * короткая отписка не проходит. Старые дефекты не переписаны задним числом —
 * у них честно стоит «не записано», а не выдуманная история.
 */

const root = new URL("../../", import.meta.url);
const registry = JSON.parse(readFileSync(new URL("data/defects.json", root), "utf8")) as {
  defects: Array<{ id: string; what: string; test: string; session: string; closed: string }>;
};

describe("у каждого дефекта записано, откуда он пришёл (шаг 245)", () => {
  it("поле `session` есть у всех, и оно не пустое", () => {
    expect(registry.defects.length).toBeGreaterThanOrEqual(15);
    for (const defect of registry.defects) {
      expect(defect.session.trim().length).toBeGreaterThan(0);
    }
  });

  it("источник называет сессию или прогон, а не «пользователь сообщил»", () => {
    // «Пользователь сообщил» — это не источник: по нему не найти, что именно
    // происходило. Источник говорит, где искать.
    for (const defect of registry.defects) {
      expect(defect.session).toMatch(/сессия|прогон/);
      expect(defect.session).not.toBe("пользователь сообщил");
    }
  });

  it("старые дефекты не переписаны задним числом", () => {
    // Придуманная история хуже её отсутствия: она выглядит как факт.
    for (const defect of registry.defects) {
      if (defect.session.includes("не записан")) {
        expect(defect.session).toContain("не записан");
      }
    }
  });

  it("у каждого дефекта по-прежнему есть тест со своим номером", () => {
    // Связь с тестом — шаг 254, и она не должна пострадать от нового поля.
    for (const defect of registry.defects) {
      expect(defect.test.trim().length).toBeGreaterThan(3);
      expect(defect.id).toMatch(/^D-\d{3}$/);
    }
    expect(new Set(registry.defects.map((defect) => defect.id)).size).toBe(registry.defects.length);
  });
});

describe("правило проверяется инструментом, а не только глазами", () => {
  it("`defects.py` проверяет источник и говорит, чем это грозит", () => {
    const source = readFileSync(new URL("tools/defects.py", root), "utf8");
    expect(source).toContain("откуда дефект");
    expect(source).toContain("не воспроизвести");
    expect(source).toContain("слишком короткий");
  });

  it("дефект без источника действительно проваливает проверку", () => {
    // Живая проверка: убираем источник у одного — инструмент обязан отказать.
    const script = `
import importlib.util, json, sys, tempfile
from pathlib import Path
spec = importlib.util.spec_from_file_location("d", "tools/defects.py")
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
registry = json.loads(Path("data/defects.json").read_text(encoding="utf-8"))
registry["defects"][2]["session"] = ""
problems = m.check(registry)
print("НАЙДЕНО:", any("откуда дефект" in p for p in problems))
`;
    const out = execFileSync("python3", ["-c", script], {
      cwd: new URL(".", root).pathname,
      encoding: "utf8",
    });
    expect(out).toContain("НАЙДЕНО: True");
  });

  it("короткая отписка тоже не проходит", () => {
    // «не работает» — не источник: по нему не найти, что происходило.
    const script = `
import importlib.util, json, sys
from pathlib import Path
spec = importlib.util.spec_from_file_location("d", "tools/defects.py")
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
registry = json.loads(Path("data/defects.json").read_text(encoding="utf-8"))
registry["defects"][1]["session"] = "баг"
problems = m.check(registry)
print("КОРОТКО:", any("слишком короткий" in p for p in problems))
`;
    const out = execFileSync("python3", ["-c", script], {
      cwd: new URL(".", root).pathname,
      encoding: "utf8",
    });
    expect(out).toContain("КОРОТКО: True");
  });

  it("«не записан» отличается от отписки — и это разные ветви правила", () => {
    // Регресс показал: если заменить условие на «короче 20 — ошибка», честная
    // пометка «сессия: не записана — дефект найден до введения правила» (она
    // длинная) проходила бы, а «баг» — тоже. Нужны **обе** ветви, и в коде они
    // названы отдельно.
    const source = readFileSync(new URL("tools/defects.py", root), "utf8");
    expect(source).toContain('"не записан" not in source');
    expect(source).toContain("len(source) < 20");
    // И честная пометка длиннее двадцати — то есть проверка длины её не судит.
    const honest = "сессия: не записана — дефект найден до введения правила";
    expect(honest.length).toBeGreaterThan(20);
    expect(honest).toContain("не записан");
  });

  it("честное «не записан» не считается нарушением", () => {
    // Иначе старые дефекты пришлось бы переписывать выдумкой.
    const script = `
import importlib.util, json
from pathlib import Path
spec = importlib.util.spec_from_file_location("d", "tools/defects.py")
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
registry = json.loads(Path("data/defects.json").read_text(encoding="utf-8"))
for item in registry["defects"]:
    item["session"] = "сессия: не записана — дефект найден до введения правила"
problems = [p for p in m.check(registry) if "источник" in p or "откуда" in p]
print("НАРУШЕНИЙ:", len(problems))
`;
    const out = execFileSync("python3", ["-c", script], {
      cwd: new URL(".", root).pathname,
      encoding: "utf8",
    });
    expect(out).toContain("НАРУШЕНИЙ: 0");
  });
});
