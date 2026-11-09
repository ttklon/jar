// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Voice } from "./Voice";

/**
 * Главный экран: задача приходит словами, ответ приходит словами тоже. Проверяем
 * именно это, а не вёрстку.
 */

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverStub);

afterEach(cleanup);

describe("голосовой экран", () => {
  it("сказанное можно поправить руками и отправить — ответ тот же", async () => {
    render(<Voice />);

    fireEvent.change(screen.getByLabelText("Услышал"), {
      target: { value: "создай папку" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Найти" }));

    await waitFor(() => {
      expect(screen.getByText("files|создать|папку")).toBeTruthy();
    });
    expect(screen.getAllByText(/уже умею/i).length).toBeGreaterThan(0);
  });

  it("когда разобрать нечем — говорит прямо, а не молчит", () => {
    render(<Voice />);

    fireEvent.pointerDown(screen.getByRole("button", { name: "Держать и говорить" }));

    // В этом окружении распознавания нет: честный ответ — сказать об этом.
    expect(screen.getByText(/распознавания речи нет/)).toBeTruthy();
  });

  it("пустая фраза не превращается в «ничего не нашлось»", () => {
    render(<Voice />);

    fireEvent.click(screen.getByRole("button", { name: "Найти" }));

    expect(screen.queryByText(/такого я пока не умею/)).toBeNull();
    expect(screen.getByText(/Пока ничего не сказано/)).toBeTruthy();
  });

  it("говорит заранее, чем распознаёт и покидает ли звук компьютер", async () => {
    render(<Voice />);

    // В браузере своего движка нет по определению — так и написано.
    await waitFor(() => {
      expect(screen.getByText(/локального распознавания нет/)).toBeTruthy();
    });
    expect(screen.getByText(/звук распознаёт служба системы/)).toBeTruthy();
  });

  it("по сказанному предлагает шаг, а не только список", async () => {
    render(<Voice />);

    fireEvent.change(screen.getByLabelText("Услышал"), {
      target: { value: "проверь свободное место" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Найти" }));

    await waitFor(() => {
      expect(screen.getByText("Что могу сделать")).toBeTruthy();
    });
    expect(
      (screen.getByRole("button", { name: "Выполнить" }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it("если данных нет — спрашивает, а не падает на середине", async () => {
    render(<Voice />);

    fireEvent.change(screen.getByLabelText("Услышал"), {
      target: { value: "создай папку" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Найти" }));

    // Вопрос появляется сам: путь, без которого шаг не состоится.
    const path = await screen.findByLabelText("Путь");
    expect(path).toBeTruthy();

    const run = screen.getByRole("button", {
      name: "Ответить и выполнить",
    }) as HTMLButtonElement;
    expect(run.disabled).toBe(true);

    fireEvent.change(path, { target: { value: "C:\\tmp\\jar" } });

    // Изменение на диске — с разрешением человеком, и это отдельная галочка.
    fireEvent.click(screen.getByLabelText("разрешить шаг 1"));
    await waitFor(() => expect(run.disabled).toBe(false));
  });

  it("чего не умею — becomes задача на обучение, а не тупик", async () => {
    render(<Voice />);

    // Такого приложение не умеет: строка в реестре есть, руки нет.
    fireEvent.change(screen.getByLabelText("Услышал"), {
      target: { value: "переименуй фото по дате съёмки" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Найти" }));

    await waitFor(() => {
      expect(screen.getByText("Чему нужно научиться")).toBeTruthy();
    });
    // Чек-лист честный: рука не написана, пример для проверки назван.
    expect(screen.getByText(/Написать руку и подключить её к реестру/)).toBeTruthy();
    expect(screen.getByText(/Проверить на живом примере/)).toBeTruthy();
    expect(screen.getByText(/первая просьба/)).toBeTruthy();
  });

  it("под капотом — вход в доказательство, а не второй рабочий стол", () => {
    const onOpen = vi.fn();
    render(<Voice onOpen={onOpen} />);

    fireEvent.click(screen.getByRole("button", { name: "Что умею" }));
    expect(onOpen).toHaveBeenCalledWith("catalog");

    fireEvent.click(screen.getByRole("button", { name: "История" }));
    expect(onOpen).toHaveBeenCalledWith("journal");
  });
});
