// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("голосовой экран", () => {
  // Эти тесты — про поведение экрана, а не про первый разговор: считаем, что
  // объяснение про микрофон человек уже видел (шаг 24 проверяется отдельно, в
  // `Voice.local.test.tsx`). Иначе первое нажатие показывало бы объяснение, и
  // проверялось бы не то.
  beforeEach(() => {
    localStorage.setItem("zshelper.mic.explained", "1");
  });

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

  it("без локального движка не запускает системный микрофон без согласия", () => {
    render(<Voice />);

    fireEvent.pointerDown(screen.getByRole("button", { name: "Держать и говорить" }));

    expect(screen.getByText(/требуется согласие на системное распознавание/)).toBeTruthy();
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

  it("говорит, где оно находится, или честно признаётся, что не видит", async () => {
    render(<Voice onOpen={() => {}} />);

    // В браузере окон системы нет: экран не рисует выдуманный «Блокнот».
    await waitFor(() => {
      expect(screen.getByText(/активное окно не прочитать/)).toBeTruthy();
    });
  });

  it("предлагает слушать всегда и честно говорит, почему сейчас нельзя", async () => {
    render(<Voice onOpen={() => {}} />);

    const toggle = await screen.findByLabelText(/Слушаю всегда/);
    // Без своего движка фразу не вырезать: переключатель выключен, а не «почти работает».
    expect((toggle as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText(/работает со своим движком распознавания/)).toBeTruthy();
    expect(screen.getByText(/фразу вырезает тишина/)).toBeTruthy();
  });

  it("говорит, что станет с запущенной командой, если она ошибётся", async () => {
    render(<Voice onOpen={() => {}} />);
    await waitFor(() => {
      expect(screen.getByText(/потолки запуска/)).toBeTruthy();
    });
    // В браузере запускать нечего — и экран это говорит, а не рисует зелёную галочку.
    expect(screen.getByText(/потолки живут в ядре приложения/)).toBeTruthy();
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
    await waitFor(() => {
      expect(screen.getByText(/делаю сам/)).toBeTruthy();
    });
    await waitFor(() => {
      expect(screen.getByText(/план исполняет приложение/)).toBeTruthy();
    });
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
    // Фраза обновлена шагом 100: «переименуй фото по дате съёмки» — это ровно
    // `files-005`, и у него рука **есть**; после исправления глагольных форм
    // планировщик нашёл её (и это правильно: фраза стала исполняться, а не
    // уходить в обучение). Взято действие без руки: `files-009`.
    fireEvent.change(screen.getByLabelText("Услышал"), {
      target: { value: "разложи рабочий стол по папкам" },
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
