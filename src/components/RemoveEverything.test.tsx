// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RemoveEverything } from "./RemoveEverything";
import { models } from "../i18n/ru";

/**
 * «Удалить всё скачанное» — необратимое действие, и оно проверяется целиком:
 * спросили ли, сказали ли числом, назвали ли остаток.
 *
 * Каждое из этих трёх может пропасть незаметно: кнопка выглядит так же, а
 * последствия разные. Не спросили — стёрли полтора гигабайта по промаху. Не
 * сказали числом — человек не знает, помогло ли. Не назвали остаток — думает, что
 * удалил всё, а движок работает и занимает место.
 */

const mocks = vi.hoisted(() => ({
  desktop: true,
  removeAll: vi.fn(),
}));

vi.mock("../ipc", () => ({
  isTauri: () => mocks.desktop,
  removeEverything: mocks.removeAll,
}));

afterEach(() => {
  cleanup();
  mocks.desktop = true;
  vi.clearAllMocks();
});

describe("удаление всего скачанного", () => {
  it("спрашивает до удаления и не удаляет без ответа", async () => {
    mocks.removeAll.mockResolvedValue({ freed_bytes: 1258291200, removed: ["a.gguf"], kept: [] });
    render(<RemoveEverything />);

    fireEvent.click(screen.getByRole("button", { name: models.removeAllAsk }));
    // Вопрос показан, удаления ещё не было.
    expect(screen.getByText(models.removeAllConfirm)).toBeTruthy();
    expect(mocks.removeAll).not.toHaveBeenCalled();

    // «Оставить» — ничего не происходит вовсе.
    fireEvent.click(screen.getByRole("button", { name: models.removeAllNo }));
    expect(mocks.removeAll).not.toHaveBeenCalled();
    expect(screen.queryByText(models.removeAllConfirm)).toBeNull();
  });

  it("удаляет только после подтверждения и говорит, сколько освободилось", async () => {
    mocks.removeAll.mockResolvedValue({ freed_bytes: 1258291200, removed: ["a.gguf"], kept: [] });
    render(<RemoveEverything />);

    fireEvent.click(screen.getByRole("button", { name: models.removeAllAsk }));
    fireEvent.click(screen.getByRole("button", { name: models.removeAllYes }));

    await waitFor(() => expect(mocks.removeAll).toHaveBeenCalledTimes(1));
    // 1258291200 байт — это 1.17 ГиБ (1200 МиБ), и именно это должен прочитать
    // человек. Считать надо так же, как код: /1024³, а не «на глаз».
    const done = await screen.findByText(/Освободилось 1\.17 ГБ/);
    expect(done).toBeTruthy();
  });

  it("называет то, что осталось, а не молчит", async () => {
    mocks.removeAll.mockResolvedValue({
      freed_bytes: 0,
      removed: [],
      kept: ["движок llama.cpp: сейчас работает"],
    });
    render(<RemoveEverything />);

    fireEvent.click(screen.getByRole("button", { name: models.removeAllAsk }));
    fireEvent.click(screen.getByRole("button", { name: models.removeAllYes }));

    // «Освободилось 0 байт» — правда, а не успех; и рядом причина.
    await screen.findByText(/0 байт/);
    expect(screen.getByText(/движок llama\.cpp: сейчас работает/)).toBeTruthy();
  });

  it("в браузере карточки нет: там нет и файлов", () => {
    mocks.desktop = false;
    const { container } = render(<RemoveEverything />);
    expect(container.textContent).toBe("");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("ошибка называется ошибкой", async () => {
    mocks.removeAll.mockRejectedValue(new Error("файл занят"));
    render(<RemoveEverything />);

    fireEvent.click(screen.getByRole("button", { name: models.removeAllAsk }));
    fireEvent.click(screen.getByRole("button", { name: models.removeAllYes }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("файл занят");
    expect(alert.textContent).toContain("удаление не выполнено");
  });
});
