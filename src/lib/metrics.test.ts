import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  FLOORS,
  all,
  compared,
  failed,
  finishedOf,
  passes,
  report,
  understoodOf,
  type Line,
} from "./metrics";

/**
 * Шаг 244: метрики в CI — сколько фраз понято, сколько дел дошло до конца.
 *
 * Дефект: у продукта не было **ни одного числа, которое меняется от правки**.
 * «Стало лучше» проверить нельзя, и регрессия понимания видна только по жалобе
 * через месяц. Две метрики закрывают это, и обе — из журнала, а не из ощущения.
 */

const line = (understood: boolean, started: boolean, finished: boolean): Line => ({
  understood,
  started,
  finished,
});

describe("две метрики, и обе с названным знаменателем (шаг 244)", () => {
  it("понимание считается от всех фраз, доведение — от начатых дел", () => {
    // Строки: 4 фразы, из них 3 поняты, 2 дела начаты, 1 доведено.
    const lines = [
      line(true, true, true),
      line(true, true, false),
      line(true, false, false),
      line(false, false, false),
    ];
    const understood = understoodOf(lines);
    const finished = finishedOf(lines);
    expect(understood.value).toBeCloseTo(0.75, 5);
    expect(understood.of).toBe(4);
    // Знаменатель — **начатые** (2), а не все строки (4): фраза, на которую
    // человек передумал, не «брошенное дело».
    expect(finished.of).toBe(2);
    expect(finished.value).toBeCloseTo(0.5, 5);
  });

  it("пороги названы в коде, а не «смотрим глазами»", () => {
    expect(FLOORS.understood).toBe(0.85);
    expect(FLOORS.finished).toBe(0.7);
    expect(understoodOf([]).floor).toBe(0.85);
  });

  it("числа идут из журнала, а не из обещаний", () => {
    const good = Array.from({ length: 10 }, () => line(true, true, true));
    expect(understoodOf(good).value).toBe(1);
    expect(finishedOf(good).value).toBe(1);
    const bad = Array.from({ length: 10 }, () => line(false, false, false));
    expect(understoodOf(bad).value).toBe(0);
    expect(finishedOf(bad).value).toBeNull();
  });
});

describe("ноль и «не измеряли» — разные вещи", () => {
  it("пустой журнал даёт null, а не 0%", () => {
    // Ноль — это «перестали понимать». Пустая неделя — «нечего считать».
    // Путать их значит поднимать тревогу на пустом месте и молчать на поломке.
    const got = understoodOf([]);
    expect(got.value).toBeNull();
    expect(got.of).toBe(0);
    expect(passes(got)).toBe(true);
  });

  it("и в строке это сказано словами", () => {
    const [text] = report([understoodOf([])]);
    expect(text).toContain("не измеряли");
    expect(text).toContain("не 0%");
  });

  it("ноль понимания — провал, а не «нечего считать»", () => {
    const zero = understoodOf([line(false, false, false)]);
    expect(zero.value).toBe(0);
    expect(passes(zero)).toBe(false);
  });
});

describe("ниже порога — краснеет, на пороге — нет", () => {
  it("84% ниже 85 — провал, 85 — нет", () => {
    // Граница проверена отдельно: `>=`, а не `>`, иначе ровно 85% считалось бы
    // поломкой и CI краснел бы на исправном прогоне.
    const below = understoodOf([
      ...Array.from({ length: 84 }, () => line(true, true, true)),
      ...Array.from({ length: 16 }, () => line(false, false, false)),
    ]);
    expect(below.value).toBeCloseTo(0.84, 5);
    expect(passes(below)).toBe(false);

    const at = understoodOf([
      ...Array.from({ length: 85 }, () => line(true, true, true)),
      ...Array.from({ length: 15 }, () => line(false, false, false)),
    ]);
    expect(at.value).toBeCloseTo(0.85, 5);
    expect(passes(at)).toBe(true);
  });

  it("провал называет, что он значит, а не только число", () => {
    const bad = understoodOf(Array.from({ length: 10 }, () => line(false, false, false)));
    const [text] = report([bad]);
    expect(text).toContain("ниже порога 85%");
    expect(text).toContain("повторяет просьбу дважды");
  });

  it("`failed` — по любой из метрик, и пустая не считается провалом", () => {
    const ok = all(Array.from({ length: 10 }, () => line(true, true, true)));
    expect(failed(ok)).toBe(false);
    expect(failed(all([]))).toBe(false);
    const bad = all(Array.from({ length: 10 }, () => line(true, true, false)));
    expect(failed(bad)).toBe(true);
  });
});

describe("отчёт для CI: число, знаменатель, вердикт", () => {
  it("каждая строка содержит долю и знаменатель", () => {
    const lines = Array.from({ length: 10 }, () => line(true, true, true));
    const text = report(all(lines));
    expect(text.length).toBe(2);
    expect(text[0]).toContain("фраз понято: 100% из 10");
    expect(text[1]).toContain("дел доведено: 100% из 10");
  });
});

describe("сравнение с прошлым прогоном", () => {
  it("падение названо в пунктах, а не «хуже»", () => {
    const now = understoodOf([
      ...Array.from({ length: 80 }, () => line(true, true, true)),
      ...Array.from({ length: 20 }, () => line(false, false, false)),
    ]);
    expect(compared(now, 0.9)).toBe("-10 п.п. к прошлому прогону");
  });

  it("рост с 60 до 84 — движение в верную сторону, и это видно", () => {
    // Ниже порога, но не регресс: сравнение отвечает на «стало хуже», а порог —
    // на «достаточно ли». Два разных вопроса, два разных ответа.
    const now = understoodOf([
      ...Array.from({ length: 84 }, () => line(true, true, true)),
      ...Array.from({ length: 16 }, () => line(false, false, false)),
    ]);
    expect(compared(now, 0.6)).toBe("+24 п.п. к прошлому прогону");
  });

  it("нечего сравнивать — сказано, а не «0 п.п.»", () => {
    const now = understoodOf([line(true, true, true)]);
    expect(compared(now, null)).toContain("прошлого прогона нет");
    expect(compared(understoodOf([]), 0.9)).toContain("нечего считать");
  });
});

/**
 * Метрика, которую никто не прогоняет, не существует (шаг 244).
 *
 * Тест выше проверяет формулу. Здесь — что число **считается в CI каждый раз** и
 * что провал возвращает код 1: иначе о регрессе узнают по жалобе, а не по сборке.
 */
describe("метрики стоят в CI и падают по-настоящему", () => {
  const root = new URL("../../", import.meta.url);

  it("шаг добавлен в check_all, а не только в тесты", () => {
    const check = readFileSync(new URL("tools/check_all.py", root), "utf8");
    expect(check).toContain("metrics_ci.py");
    expect(check).toContain("phrases understood and deeds finished");
  });

  it("пороги в питоне совпадают с порогами в коде", () => {
    // Две правды об одном разойдутся молча: тест проверяет порог 85%, а CI —
    // свой. Читаем оба числа и сверяем.
    const source = readFileSync(new URL("tools/metrics_ci.py", root), "utf8");
    expect(source).toContain(`"understood": ${FLOORS.understood.toFixed(2)}`);
    expect(source).toContain(`"finished": ${FLOORS.finished.toFixed(2)}`);
  });

  it("ниже порогов CI краснеет и называет причину", () => {
    // Живой прогон на подставном журнале: 80% понимания, 50% доведения.
    const script = `
import json, os, subprocess, sys
path = "data/metrics.jsonl"
rows = [{"understood": i < 8, "started": i < 4, "finished": i < 2} for i in range(10)]
open(path, "w", encoding="utf-8").write("\\n".join(json.dumps(r) for r in rows) + "\\n")
try:
    run = subprocess.run([sys.executable, "tools/metrics_ci.py"], capture_output=True, text=True)
finally:
    os.remove(path)
print("КОД:", run.returncode)
print(run.stdout)
`;
    const out = execFileSync("python3", ["-c", script], {
      cwd: new URL(".", root).pathname,
      encoding: "utf8",
    });
    expect(out).toContain("КОД: 1");
    expect(out).toContain("ниже порога 85%");
    expect(out).toContain("ниже порога 70%");
    expect(out).toContain("повторяет просьбу дважды");
  });

  it("пустой журнал не роняет CI и говорит «не измеряли»", () => {
    // Ноль и «нечего считать» — разные вещи: иначе первый же прогон на чистой
    // машине краснел бы без причины.
    const out = execFileSync("python3", ["tools/metrics_ci.py"], {
      cwd: new URL(".", root).pathname,
      encoding: "utf8",
    });
    expect(out).toContain("не измеряли");
    expect(out).toContain("2 из 2 в порядке");
  });
});
