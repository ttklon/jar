import { existsSync, readFileSync, rmSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Шаг 256: прогон живого сценария на Windows по расписанию, с сохранением
 * результата.
 *
 * Дефект: ночной прогон вызывал `app.yml` (а в нём есть живой Windows-сценарий с
 * виртуальным микрофоном), но результат жил 14 дней как артефакт и **никуда не
 * копился**. «Упало сегодня» видно, а «стало падать, а раньше проходило» — нет.
 * Артефакт без истории отвечает на вопрос «прошло ли», а спрашивают другое:
 * **когда перестало**.
 *
 * Главное правило, без которого история хуже её отсутствия: упавшая ночь тоже
 * записывается. Иначе в ряду остаются только успешные ночи, и «когда перестало»
 * превращается в «никогда».
 */

const root = new URL("../../", import.meta.url);
const cwd = new URL(".", root).pathname;
const history = new URL("data/nightly.jsonl", root);

/** Прогон инструмента: возвращает вывод **и** код, не бросая на ненулевом. */
function run(args: string[]): { out: string; code: number } {
  const { spawnSync } = require("node:child_process") as typeof import("node:child_process");
  const got = spawnSync("python3", ["tools/nightly_history.py", ...args], { cwd, encoding: "utf8" });
  return { out: `${got.stdout ?? ""}${got.stderr ?? ""}`, code: got.status ?? -1 };
}

describe("история ночей пишется, а не только показывается (шаг 256)", () => {
  it("ночью пишется строка: дата, коммит, оба итога", () => {
    // Начинаем с чистой истории: иначе код возврата зависит от прошлых ночей,
    // записанных прошлыми прогонами теста, и проверка становится неповторяемой.
    rmSync(history, { force: true });
    // Живой прогон в настоящий файл истории, как это делает CI.
    const { out, code } = run(["--app", "success", "--validate", "success", "--night", "2026-11-24", "--commit", "abc1234def56"]);
    expect(code).toBe(0);
    expect(out).toContain("записано 2026-11-24");
    expect(existsSync(history)).toBe(true);
    const rows = readFileSync(history, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Record<string, string>);
    const last = rows[rows.length - 1]!;
    expect(last.night).toBe("2026-11-24");
    expect(last.commit).toBe("abc1234def56");
    expect(last.app).toBe("success");
    expect(last.validate).toBe("success");
  });

  it("упавшая ночь записывается тоже — иначе «когда перестало» станет «никогда»", () => {
    const { out, code } = run(["--app", "failure", "--validate", "success", "--night", "2026-11-25"]);
    // Код 1 — падение ночи; строка при этом записана. Обе части важны: без
    // записи история соврёт, без кода падение спрячется за записью.
    expect(code).toBe(1);
    expect(out).toContain("записано 2026-11-25 (failure/success)");
    // И код возврата — по сегодняшней ночи: история пишется и при падении, но
    // прогон всё равно краснеет, иначе падение спрячется за записью.
    expect(out).toContain("подряд проходят 0");
  });

  it("«подряд проходят» считается по последним ночам, а не по всем", () => {
    const { out, code } = run(["--app", "success", "--validate", "success", "--night", "2026-11-26"]);
    expect(code).toBe(1);
    // Две ночи назад было падение (2026-11-25), значит лучшая серия — 1, а не 3.
    expect(out).toContain("подряд проходят 1");
  });
});

describe("ночной workflow пишет историю, а не только гоняет проверки", () => {
  const workflow = readFileSync(new URL(".github/workflows/nightly.yml", root), "utf8");

  it("шаг истории зависит от обоих прогонов и срабатывает всегда", () => {
    // `always()` — суть: строка нужна и тогда, когда прогон упал. Особенно
    // тогда.
    //
    // Проверять `toContain("if: always()")` по всему файлу мало: `always()` есть
    // ещё у шага артефактов, и регресс «убрать `always()` из job» проходил
    // зелёным. Смотрим **блок job** `history` до следующего job.
    // Граница job — строка с отступом ровно два пробела и именем: следующая
    // секция `  имя:`. Разрез по комментарию не годится: комментарии есть и
    // внутри самого job, и блок получался пустым (регресс проходил зелёным).
    const start = workflow.indexOf("\n  history:");
    expect(start).toBeGreaterThan(-1);
    const rest = workflow.slice(start + 1);
    const boundary = /\n  [a-z][a-z0-9-]*:\n/.exec(rest.slice(1));
    const block = boundary === null ? rest : rest.slice(0, boundary.index + 1);
    expect(block).toContain("needs: [app, validate]");
    // Проверяется **строка кода**, а не упоминание: `always()` есть и в
    // комментарии рядом, и `toContain` на него соглашался, пока условие убрали
    // (регресс проходил зелёным).
    const code = block
      .split("\n")
      .filter((line) => !line.trim().startsWith("#"))
      .join("\n");
    // Отступ ровно четыре пробела — уровень **job**. Восемь — это шаг
    // артефактов, у него `always()` свой и не заменяет job-овский: регресс
    // «убрать условие у job» проходил зелёным именно из-за этого.
    // Условие job стоит **до** `steps:` — у шага оно своё и job-овское не
    // заменяет.
    const jobPart = code.slice(0, code.indexOf("steps:"));
    expect(jobPart).toMatch(/^ {4}if: always\(\)$/m);
    // И это действительно блок, а не весь файл: в нём не должно быть job `app`.
    expect(block).not.toContain("uses: ./.github/workflows/app.yml");
  });

  it("итоги передаются из прогонов, а не выдумываются", () => {
    expect(workflow).toContain("needs.app.result");
    expect(workflow).toContain("needs.validate.result");
    expect(workflow).toContain("tools/nightly_history.py");
  });

  it("история сохраняется надолго — дольше, чем сам прогон", () => {
    // История нужна, чтобы сравнивать версии, а не разбирать одну ночь.
    expect(workflow).toContain("nightly-history");
    expect(workflow).toContain("retention-days: 90");
    // А сам живой прогон живёт 14 дней — и это правильно, это артефакт одной ночи.
    const app = readFileSync(new URL(".github/workflows/app.yml", root), "utf8");
    expect(app).toContain("retention-days: 14");
  });

  it("живой сценарий на Windows действительно есть в вызываемом workflow", () => {
    // Без этого «прогон на Windows по расписанию» — обещание без предмета.
    const app = readFileSync(new URL(".github/workflows/app.yml", root), "utf8");
    expect(workflow).toContain("uses: ./.github/workflows/app.yml");
    expect(app).toContain("runs-on: windows-latest");
    expect(app).toContain("voice-simulation");
  });
});
