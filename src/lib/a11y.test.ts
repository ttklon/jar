import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Ошибка на экране — это не только цвет. Для человека с экранным диктором ошибка
 * существует, только если она объявлена: `role="alert"` (и `aria-live`, чтобы не
 * вырывать управление у говорящего). Проверка читает исходники экранов: если
 * кто-то добавит `styles.error` без роли, молча это не пройдёт.
 *
 * Исключение одно и названо: `role` может быть условным (`status`/`alert`), но
 * безусловно-текстовых ошибок без роли быть не должно.
 */

const SCREENS = join(process.cwd(), "src", "screens");
const files = readdirSync(SCREENS).filter((name) => name.endsWith(".tsx") && !name.includes(".test."));

function offenders(): string[] {
  const bad: string[] = [];
  for (const file of files) {
    const lines = readFileSync(join(SCREENS, file), "utf8").split("\n");
    lines.forEach((line, index) => {
      // Ищем тег Text, у которого в этой же строке есть стиль ошибки.
      if (!line.includes("styles.error}")) return;
      if (!line.includes("<Text")) return;
      if (line.includes('role="alert"') || line.includes("role={")) return;
      bad.push(`${file}:${index + 1}`);
    });
  }
  return bad;
}

describe("ошибки объявляются экранному диктору", () => {
  it("нет текста ошибки без роли alert/status", () => {
    // Падение здесь значит: сообщение видно, но не слышно.
    expect(offenders()).toEqual([]);
  });

  it("успех не объявляется как тревога", () => {
    const voice = readFileSync(join(SCREENS, "Voice.tsx"), "utf8");
    // Роль должна зависеть от исхода, а не быть всегда alert.
    expect(voice).toContain('role={typed.verified ? "status" : "alert"}');
    expect(voice).toContain('role={pressResult.changed ? "status" : "alert"}');
  });
});
