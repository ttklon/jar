// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ErrorLine } from "./ErrorLine";
import { t } from "../i18n/ru";

/**
 * Ошибка, которую слышит экранный диктор.
 *
 * Зачем тест. `role="alert"` на месте ошибки — это атрибут, который ничего не
 * ломает, если его забыть: текст виден, сборка зелёная, тесты проходят. Забыть
 * его легко, цена — человек, который не узнал об ошибке. Поэтому проверяется не
 * намерение («мы добавили компонент»), а то, что видит диктор.
 */

afterEach(cleanup);

describe("строка ошибки", () => {
  it("объявляется диктору сразу, а не когда дойдёт очередь", () => {
    render(<ErrorLine text="не хватило места на диске" />);

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("не хватило места на диске");
    // assertive, а не polite: об ошибке сообщают перед остальным текстом.
    expect(alert.getAttribute("aria-live")).toBe("assertive");
  });

  it("начинает с «Ошибка.», чтобы фраза не звучала с середины", () => {
    render(<ErrorLine text="сеть недоступна" />);

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain(t.errorPrefix);
  });

  it("пустой текст — это «ошибки нет», а не «неизвестная ошибка»", () => {
    const { container } = render(<ErrorLine text="" />);
    expect(container.textContent).toBe("");
    expect(screen.queryByRole("alert")).toBeNull();

    // И `null` тоже: вызывающий экран часто передаёт `error ?? null`.
    const second = render(<ErrorLine text={null} />);
    expect(second.container.textContent).toBe("");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("ошибка не исчезает сама по таймеру", async () => {
    render(<ErrorLine text="база повреждена" />);
    // Никакого setTimeout внутри: сообщение, пропавшее пока человек читал, —
    // сообщение, которого не было. Ждём дольше любого «умного» таймера.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.getByRole("alert").textContent).toContain("база повреждена");
  });

  it("рядом с ошибкой есть «что сделать» — и оно слышно диктору", async () => {
    // Шаг 351. Ошибка без совета — тупик: «не удалось» и дальше ничего.
    // Совет живёт в том же объявлении, чтобы диктор прочитал его сразу, а не
    // оставил человека искать глазами.
    render(<ErrorLine text="не хватило места на диске" />);

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Освободите место");
    // И прежнее поведение цело: ошибка названа.
    expect(alert.textContent).toContain("не хватило места");
  });

  it("совет не обещает того, чего приложение не сделает", async () => {
    // Для «файл занят» совет — закрыть программу, а не «подождите»: ждать
    // можно бесконечно и без результата.
    render(<ErrorLine text="файл занят другим процессом" />);
    const text = screen.getByRole("alert").textContent ?? "";
    expect(text).toContain("Закройте программу");
    expect(text.toLowerCase()).not.toContain("подождите");
  });

  it("совет можно отключить там, где он уже написан рядом", async () => {
    // Иначе один совет прозвучит дважды и превратится в шум.
    render(<ErrorLine text="нет сети" withHint={false} />);
    const text = screen.getByRole("alert").textContent ?? "";
    expect(text).toContain("нет сети");
    expect(text).not.toContain("Всё остальное работает без сети");
  });
});
