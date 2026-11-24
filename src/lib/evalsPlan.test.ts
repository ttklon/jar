import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Шаг 241: 15 обязательных evals с входом, ожидаемым результатом **и отказом**.
 *
 * Дефект: сценариев действительно было 15, и у каждого были «дано» и «тогда».
 * Отказа не было ни у одного — слово «отказ» встречалось только в названии
 * одного сценария. Сценарий без отказа проверяет **только удачный путь**:
 * приложение, которое делает, и приложение, которое делает или честно
 * отказывается, проходят его одинаково. Половина обещания не проверялась, а
 * таблица выглядела полной.
 *
 * Проверка идёт по сгенерированному `data/evals.json`: важно то, что дошло до
 * человека, а не то, что написано в питоне.
 */

const root = new URL("../../", import.meta.url);
const plan = JSON.parse(readFileSync(new URL("data/evals.json", root), "utf8")) as {
  curated: Array<{
    priority: string;
    name: string;
    given: string;
    then: string;
    risk: string;
    must_not: string;
    owner: string;
    checked: string;
  }>;
};

const curated = plan.curated;

describe("15 обязательных сценариев — и все 15 (шаг 241)", () => {
  it("их ровно пятнадцать, как написано в плане", () => {
    expect(curated.length).toBe(15);
  });

  it("каждый назван по имени и с приоритетом", () => {
    for (const row of curated) {
      expect(row.name.length).toBeGreaterThan(3);
      expect(["P0", "P1", "P2"]).toContain(row.priority);
    }
    expect(new Set(curated.map((row) => row.name)).size).toBe(15);
  });

  it("P0 — большинство: до релиза важнее то, что ломает доверие", () => {
    expect(curated.filter((row) => row.priority === "P0").length).toBeGreaterThanOrEqual(6);
  });
});

describe("у каждого сценария три части, а не две (шаг 241)", () => {
  it("вход назван входом, а не описанием функции", () => {
    for (const row of curated) {
      expect(row.given.trim().length).toBeGreaterThan(5);
      expect(row.given).not.toBe("работает");
    }
  });

  it("ожидаемый результат — проверяемое утверждение, а не «работает»", () => {
    for (const row of curated) {
      expect(row.then.trim().length).toBeGreaterThan(20);
      expect(row.then).not.toBe("работает");
    }
  });

  it("отказ назван у каждого — и назван словами «не …»", () => {
    // Вот это и было дефектом: ни у одного сценария отказа не было вовсе, и
    // таблица при этом выглядела полной.
    for (const row of curated) {
      expect(row.must_not.trim().length).toBeGreaterThan(20);
      expect(row.must_not).toMatch(/не /);
    }
  });

  it("отказы не повторяются: общая фраза на всех — не отказ сценария", () => {
    // «Не делать плохого» подходит к любому сценарию и не проверяет ничего.
    expect(new Set(curated.map((row) => row.must_not)).size).toBe(15);
  });

  it("и отказ конкретен: назван предмет, а не только «неправильно»", () => {
    for (const row of curated) {
      for (const vague of ["неправильно", "не то", "плохо", "нельзя"]) {
        expect(row.must_not.trim()).not.toBe(vague);
      }
      expect(row.must_not.length).toBeGreaterThan(40);
    }
  });

  it("владелец и дата на месте — шаг 260 не сломан этой правкой", () => {
    // Третья часть добавилась в ту же строку, где живут владелец и дата, и
    // первая попытка правки их потеряла. Теперь это ловится.
    for (const row of curated) {
      expect(row.owner).not.toBe("не назначен");
      expect(row.owner.length).toBeGreaterThan(3);
      expect(row.checked).toMatch(/\d{4}-\d{2}-\d{2}/);
    }
  });
});

describe("отказ не спорит с ожидаемым результатом", () => {
  it("ни в одном сценарии «тогда» не разрешает то, что запрещено", () => {
    // Разбор по словам, а не по кускам: первая версия искала `удал` в «тогда» и
    // находила его в «ничего **не** удаляется» — то есть ловила запрет как
    // разрешение. Правильно — смотреть, стоит ли перед глаголом «не».
    for (const row of curated) {
      for (const pair of ["удалять", "отправлять", "подписывать"]) {
        if (!row.must_not.includes(pair)) continue;
        const found = new RegExp(`(^|[^а-яё])(не\\s+)?${pair.slice(0, -2)}`).exec(row.then);
        if (!found) continue;
        expect(
          found[2],
          `${row.name}: «тогда» разрешает «${pair}», а отказ его запрещает`,
        ).toBe("не ");
      }
    }
  });
});

describe("ни генератор, ни раннер не выпустят сценарий без отказа", () => {
  it("проверка стоит в генераторе, а не только в тесте", () => {
    const source = readFileSync(new URL("tools/evals.py", root), "utf8");
    expect(source).toContain("REQUIRED = 15");
    expect(source).toContain("не назван отказ");
  });

  it("генератор падает на сценарии без отказа", () => {
    // Живая проверка: подкладываем пустой шестой элемент — и он **не**
    // соглашается. Иначе «проверка есть» значит лишь «строка есть».
    const script = `
import importlib.util, sys
spec = importlib.util.spec_from_file_location("ev", "${new URL("tools/evals.py", root).pathname}")
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
m.CURATED = list(m.CURATED)
m.CURATED[3] = m.CURATED[3][:5] + ("",)
try:
    m.main()
except SystemExit as e:
    print("ОТКАЗ:", "не назван отказ" in str(e))
    sys.exit(0)
print("ОТКАЗ: False")
sys.exit(1)
`;
    const out = execFileSync("python3", ["-c", script], { encoding: "utf8" });
    expect(out).toContain("ОТКАЗ: True");
  });

  it("раннер тоже отказывает: сценарий без отказа не пройден", () => {
    // Два инструмента об одном: генератор не выпускает, раннер не пропускает.
    const source = readFileSync(new URL("tools/run_evals.py", root), "utf8");
    expect(source).toContain("must_not");
    expect(source).toContain("проверяется только удачный путь");
  });
});
