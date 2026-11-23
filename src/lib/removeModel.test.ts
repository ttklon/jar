import { describe, expect, it } from "vitest";
import { breaks, confirm, done, enoughFor, lastOne, size, willFree, type Space } from "./removeModel";

/**
 * Шаг 80: удаление модели освобождает место, и это видно сразу.
 *
 * «Удалить модель» не говорит, 400 МБ это или 4.7 ГБ, — а от этого зависит,
 * поможет ли вообще.
 */
const space = (modelMb: number, freeMb: number): Space => ({ modelMb, freeMb });

describe("до нажатия — сколько освободится", () => {
  it("названо число на кнопке, а не «удалить модель»", () => {
    // От числа зависит, поможет ли удаление вообще.
    const said = willFree(space(4600, 2048));
    expect(said).toContain("4.5 ГБ");
    expect(said).toContain("свободно станет");
  });

  it("и сколько станет — второе число", () => {
    expect(willFree(space(400, 1024))).toContain("освободится 400 МБ");
  });

  it("размер по-человечески", () => {
    expect(size(4600)).toBe("4.5 ГБ");
    expect(size(400)).toBe("400 МБ");
  });
});

describe("до нажатия — что перестанет работать", () => {
  it("названо следствие, а не «модель будет удалена»", () => {
    // Удаление человек и так знает; последствие — нет.
    const said = breaks("Qwen 1.5B");
    expect(said).toContain("не запустится");
    expect(said).toContain("скачаете");
    expect(said).toContain("Qwen 1.5B");
  });

  it("подтверждение — числа и следствие, а не выбор из трёх кнопок", () => {
    const said = confirm(space(4600, 2048), "7B");
    expect(said).toContain("4.5 ГБ");
    expect(said).toContain("не запустится");
  });
});

describe("после удаления — три числа, чтобы сверить", () => {
  it("сказано, сколько освободилось, сколько стало и сколько было", () => {
    // Расхождение с проводником означает, что удалилось не то.
    const said = done(space(4600, 2048));
    expect(said).toContain("освободилось 4.5 ГБ");
    expect(said).toContain("свободно 6.5 ГБ");
    expect(said).toContain("было 2 ГБ");
  });
});

describe("удаляет одну, чтобы скачать другую", () => {
  it("сказано, хватит ли на новую модель, — до удаления", () => {
    // Иначе человек удаляет, скачивает и снова упирается в место.
    expect(enoughFor(space(1100, 1024), 2200)).toContain("хватит");
    expect(enoughFor(space(400, 1024), 4600)).toContain("всё равно не хватит");
  });
});

describe("последняя модель не удаляется молча", () => {
  it("сказано, что после удаления не работает ничего", () => {
    // «Модель удалена» скрывает, что приложение теперь не отвечает.
    const said = lastOne("1.5B");
    expect(said).toContain("последняя");
    expect(said).toContain("не сможет отвечать");
  });
});
