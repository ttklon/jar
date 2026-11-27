import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Маркер конфликта в исходнике — не «грязное дерево», а сломанная сборка.
 *
 * Как это случилось: при rebase конфликт в `Settings.tsx` разобрали `checkout
 * --ours`, а маркеры остались; `tsc -b` с кешем типов их **не перечитал**, и
 * проверка типов прошла на устаревшем кеше. Ошибка вылезла только при
 * `--force`. Поэтому проверка на исходнике, а не надежда на кеш: маркеров не
 * должно быть в репозитории вообще.
 */

const ROOTS = ["src", "tools", "src-tauri/src"];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return walk(path);
    return /\.(ts|tsx|rs|py)$/.test(name) ? [path] : [];
  });
}

/** Файлы с маркерами конфликта и на какой строке. */
export function markers(file: string): number[] {
  const lines = readFileSync(file, "utf8").split("\n");
  const found: number[] = [];
  lines.forEach((line, index) => {
    if (/^(<<<<<<< |>>>>>>> |={7}$)/.test(line)) found.push(index + 1);
  });
  return found;
}

describe("в исходниках нет маркеров конфликта", () => {
  it("ни одного файла с <<<<<<<, ======= или >>>>>>>", () => {
    const dirty = ROOTS.flatMap((root) => walk(join(process.cwd(), root)))
      .map((file) => ({ file, at: markers(file) }))
      .filter((found) => found.at.length > 0)
      .map((found) => `${found.file.replace(process.cwd(), ".")}:${found.at.join(",")}`);

    expect(dirty).toEqual([]);
  });
});
