// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Ask } from "./Ask";

/**
 * Проверяется обещание экрана: на просьбу он отвечает тем, что есть в реестре, и
 * говорит прямо, выполнимо ли это. В тестах работает dev-адаптер (браузер), правила
 * поиска у него те же, что в ядре (`src/lib/planner.ts`).
 */

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverStub);

afterEach(cleanup);

describe("экран «Спросить»", () => {
  it("находит действие, которое приложение умеет выполнять", async () => {
    render(<Ask />);

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "создай папку" } });
    fireEvent.click(screen.getByRole("button", { name: /найти/i }));

    await waitFor(() => {
      expect(screen.getByText("files|создать|папку")).toBeTruthy();
    });
    expect(screen.getAllByText(/уже умею/i).length).toBeGreaterThan(0);
  });

  it("на пустой запрос не отвечает «ничего не нашлось»", async () => {
    render(<Ask />);

    fireEvent.click(screen.getByRole("button", { name: /найти/i }));

    expect(screen.queryByText(/ничего не нашлось/i)).toBeNull();
    expect(screen.getByText(/проще всего ищется/i)).toBeTruthy();
  });
});

describe("пустой поиск — с выходом, а не тупик (шаг 188)", () => {
  /**
   * Запрос шлётся отправкой формы, а не нажатием: `search(query)` читает
   * состояние, и `fireEvent.change` без `await` до него не доходит — тест
   * «проходил» бы на пустом запросе и проверял не то.
   */
  const ask = async (text: string) => {
    render(<Ask />);
    const box = screen.getByRole("textbox");
    fireEvent.change(box, { target: { value: text } });
    fireEvent.submit(box.closest("form")!);
  };

  it("три шага, у каждого действие, и «нет такого» не выдаётся за «не понял»", async () => {
    // Дефект: «Ничего не нашлось. Переформулируйте…» — совет без адреса.
    await ask("жжж ккк щщщ ъъъ");
    // eslint-disable-next-line no-console
    await waitFor(() => expect(screen.getByText(/ничего нет — и это ответ/)).toBeTruthy(), { timeout: 4000 });
    // Три шага — три действия, а не три совета.
    expect(screen.getByText(/· Скажите иначе — по действию, а не по названию программы — /)).toBeTruthy();
    expect(screen.getByText(/· Посмотрите соседнее: каталог знает 835 действий словами/)).toBeTruthy();
    expect(screen.getByText(/· Проверьте, что вообще возможно на этой машине/)).toBeTruthy();
  });
});

describe("удалённый путь назван прямо (шаг 216)", () => {
  it("экран говорит, что удалённого пути нет, а не молчит", () => {
    // Молчание читается как «а может, уходит». Одна честная строка дешевле.
    render(<Ask />);
    expect(
      screen.getByText(/удалённого пути нет: модель работает на этом компьютере/),
    ).toBeTruthy();
  });
});
