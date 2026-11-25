import { describe, expect, it } from "vitest";
import { fromDeed, notRepeatable, preview, whereButton, type Done } from "./fromOneDeed";

/**
 * Шаг 332: автоматизация создаётся из уже сделанного дела одной кнопкой «каждый день».
 *
 * Человек не программирует расписание: он только что сделал дело руками.
 */

const AT = new Date(2026, 10, 20, 9, 12).getTime(); // 09:12 по местным часам

const deed = (over: Partial<Done> = {}): Done => ({
  what: "уборка загрузок",
  at: AT,
  steps: [{ kind: "delete", target: "загрузки" }],
  confirmed: true,
  ...over,
});

describe("кнопка берёт дело, а не открывает форму", () => {
  it("время из дела по местным часам, а не «09:00 по умолчанию»", () => {
    const got = fromDeed(deed());
    expect(got.ok).toBe(true);
    expect(got.label).toBe("Каждый день в 09:12");
    expect(got.said).toContain("каждый день в 09:12: уборка загрузок");
  });

  it("неподтверждённое дело автоматизировать нельзя", () => {
    const got = fromDeed(deed({ confirmed: false }));
    expect(got.ok).toBe(false);
    expect(got.said).toContain("не подтверждено");
  });

  it("дело без шагов повторять нечего", () => {
    expect(fromDeed(deed({ steps: [] })).said).toContain("повторять нечего");
  });

  it("кнопка — после дела, а не в настройках", () => {
    expect(whereButton()).toContain("после выполненного дела");
  });
});

describe("что сломается со временем — сказано сразу", () => {
  it("конкретный файл завтра может не существовать", () => {
    const got = fromDeed(deed({ steps: [{ kind: "delete", target: "C:\\Temp\\отчёт.pdf" }] }));
    expect(got.warning).toContain("если его не будет");
    expect(got.warning).toContain("пропустится с причиной");
  });

  it("дело без конкретных файлов — без предупреждения", () => {
    expect(fromDeed(deed()).warning).toBeNull();
  });

  it("предупреждение видно до создания", () => {
    const got = preview(fromDeed(deed({ steps: [{ kind: "delete", target: "C:\\Temp\\a.pdf" }] })));
    expect(got.split("\n").length).toBe(3);
  });
});

describe("что показывается до создания — три строки", () => {
  it("когда, что и что будет с пропуском", () => {
    const lines = preview(fromDeed(deed())).split("\n");
    expect(lines.length).toBe(2);
    expect(lines[1]).toContain("если компьютер спал");
  });

  it("отказ показывается причиной", () => {
    expect(preview(fromDeed(deed({ confirmed: false })))).toContain("не подтверждено");
  });
});

describe("не всё повторяется", () => {
  it("отказ предлагает другой триггер, а не пустоту", () => {
    const got = notRepeatable("этих файлов больше нет");
    expect(got).toContain("когда появляется файл");
    expect(got).toContain("не зависит от конкретных имён");
  });
});
