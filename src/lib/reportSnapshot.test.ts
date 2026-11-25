import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Шаг 257: снимок отчёта в артефактах CI, чтобы сравнивать версии.
 *
 * Дефект: в CI лежали сборка, снимки экрана и SBOM — а **отчёта** среди них не
 * было. На вопрос «что изменилось между 1.1.0 и 1.2.0» отвечал diff кода: он
 * говорит, что правили, и молчит о том, что изменилось **для человека**. Новый
 * домен, пропавшее действие, отключённый навык — всё это видно в отчёте и
 * невидимо в diff'е.
 *
 * Снимок обязан быть в репозитории, а не в `dist/`: `dist/` в `.gitignore`, и
 * снимок оттуда не попал бы ни в артефакты прошлых версий, ни в сверку.
 */

const root = new URL("../../", import.meta.url);
const cwd = new URL(".", root).pathname;
const snapshot = new URL("data/report.json", root);

interface Report {
  numbers: Record<string, number>;
  domains: Record<string, number>;
}

describe("снимок отчёта есть и он в репозитории (шаг 257)", () => {
  it("файл лежит в data/, а не в игнорируемом dist/", () => {
    expect(existsSync(snapshot)).toBe(true);
    const ignore = readFileSync(new URL(".gitignore", root), "utf8");
    expect(ignore).toContain("dist/");
    // Именно поэтому снимок живёт в `data/`: из `dist/` он не попал бы в
    // артефакты прошлых версий.
    expect(ignore.split("\n").some((line) => line.trim() === "data/")).toBe(false);
  });

  it("числа сняты с настоящих источников, а не написаны руками", () => {
    const got = JSON.parse(readFileSync(snapshot, "utf8")) as Report;
    // Действия и домены обязаны сходиться: сумма по доменам — это все действия.
    const total = Object.values(got.domains).reduce((sum, value) => sum + value, 0);
    expect(total).toBe(got.numbers.actions);
  });

  it("снимок не ломается от каждой новой проверки", () => {
    // Число тестовых **файлов** меняется вместе с новой темой, а не с каждой
    // строкой `it(...)`. Иначе сверку пришлось бы перегенерировать после
    // каждого нового теста — и её бы отключили.
    const source = readFileSync(new URL("tools/report_snapshot.py", root), "utf8");
    expect(source).toContain('*.test.*');
    expect(source).toContain("Число тестовых **файлов**");
  });

  it("пропавший источник — ошибка, а не ноль", () => {
    // Пропустить источник молча значит показать «0 действий» и не заметить,
    // что файл переименовали.
    const source = readFileSync(new URL("tools/report_snapshot.py", root), "utf8");
    expect(source).toContain("не найден — это не ноль");
  });

  it("снимок совпадает с репозиторием: устаревший снимок сравнивает не с тем", () => {
    const got = spawnSync("python3", ["tools/report_snapshot.py", "--check"], { cwd, encoding: "utf8" });
    expect(got.stdout).toContain("совпадает с репозиторием");
    expect(got.status).toBe(0);
  });
});

describe("сравнение версий называет, где изменилось (шаг 257)", () => {
  it("разница по числам и по доменам — с направлением", () => {
    const before: Report = { numbers: { actions: 10, tests: 20 }, domains: { audio: 6, files: 4 } };
    const after: Report = { numbers: { actions: 10, tests: 23 }, domains: { audio: 2, files: 4, voice: 4 } };
    const script = `
import importlib.util, json, sys
spec = importlib.util.spec_from_file_location("r", "tools/report_snapshot.py")
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
before = json.loads("""${JSON.stringify(before)}""")
after = json.loads("""${JSON.stringify(after)}""")
for line in m.compare(before, after):
    print(line)
`;
    const got = spawnSync("python3", ["-c", script], { cwd, encoding: "utf8" });
    const lines = got.stdout.trim().split("\n");
    expect(lines).toContain("tests: 20 → 23 (+3)");
    // «Действий столько же» скрывает, что четыре ушли из `audio` и четыре
    // пришли в `voice`. Поэтому домены сравниваются отдельно.
    expect(lines).toContain("домен audio: 6 → 2 (-4)");
    expect(lines).toContain("домен voice: 0 → 4 (+4)");
    // Неизменившееся не печатается: в отчёте только разница.
    expect(lines.join("\n")).not.toContain("files");
  });

  it("пропавшее и появившееся названы словами", () => {
    const script = `
import importlib.util, json
spec = importlib.util.spec_from_file_location("r", "tools/report_snapshot.py")
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
print("\\n".join(m.compare({"numbers": {"actions": 5}, "domains": {}}, {"numbers": {"skills": 3}, "domains": {}})))
`;
    const got = spawnSync("python3", ["-c", script], { cwd, encoding: "utf8" });
    expect(got.stdout).toContain("actions: пропал (было 5)");
    expect(got.stdout).toContain("skills: появился (3)");
  });

  it("одинаковые снимки — «без изменений», а не пустой список строк", () => {
    const script = `
import importlib.util
spec = importlib.util.spec_from_file_location("r", "tools/report_snapshot.py")
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
same = {"numbers": {"actions": 5}, "domains": {"audio": 2}}
print("РАЗНИЦА:", m.compare(same, same))
`;
    const got = spawnSync("python3", ["-c", script], { cwd, encoding: "utf8" });
    expect(got.stdout).toContain("РАЗНИЦА: []");
  });
});

describe("снимок стоит в CI", () => {
  const workflow = readFileSync(new URL(".github/workflows/app.yml", root), "utf8");

  it("снимается и сохраняется как артефакт", () => {
    expect(workflow).toContain("report_snapshot.py --write");
    expect(workflow).toContain("report-snapshot");
    // Снимок должен пережить прогон и следующую ночь: его сравнивают между
    // версиями, а не разбирают сегодня.
    expect(workflow).toContain("retention-days: 90");
    expect(workflow).toContain("data/report.json");
  });

  it("и сверка стоит в check_all — устаревший снимок не проедет", () => {
    const check = readFileSync(new URL("tools/check_all.py", root), "utf8");
    expect(check).toContain("report_snapshot.py");
    expect(check).toContain("--check");
  });
});
