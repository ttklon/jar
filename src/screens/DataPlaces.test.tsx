// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { dataPlaces } from "../ipc";
import type { DataPlace } from "../ipc";
import { DataPlaces, formatBytes } from "./DataPlaces";

/**
 * Карточка «Где данные» отвечает на вопрос «а где посмотреть». Проверяется не вёрстка,
 * а два утверждения: путь полный и «файла ещё нет» не выдаётся за «0 КБ».
 */

vi.mock("../ipc", () => ({
  dataPlaces: vi.fn(),
}));

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverStub);

afterEach(() => {
  cleanup();
  vi.mocked(dataPlaces).mockReset();
});

function place(patch: Partial<DataPlace> = {}): DataPlace {
  return {
    title: "Журнал действий",
    path: "C:\\Users\\Имя\\AppData\\Local\\ZShelper\\audit.jsonl",
    exists: true,
    bytes: 2048,
    note: "что просили, что решила политика и чем закончилось",
    ...patch,
  };
}

describe("карточка «Где данные»", () => {
  it("показывает путь и размер того, что есть", async () => {
    vi.mocked(dataPlaces).mockResolvedValue([place()]);

    render(<DataPlaces />);

    await waitFor(() =>
      expect(
        screen.getByText("C:\\Users\\Имя\\AppData\\Local\\ZShelper\\audit.jsonl"),
      ).toBeTruthy(),
    );
    expect(screen.getByText("2.0 КБ")).toBeTruthy();
    expect(screen.getByText(/что просили, что решила политика/)).toBeTruthy();
  });

  it("«файла ещё нет» вместо «0 КБ»", async () => {
    vi.mocked(dataPlaces).mockResolvedValue([place({ title: "Журнал отката", exists: false, bytes: 0 })]);

    render(<DataPlaces />);

    await waitFor(() => expect(screen.getByText("файла ещё нет")).toBeTruthy());
    expect(screen.queryByText("0 Б")).toBeNull();
  });

  it("в браузере говорит, что папки приложения нет", async () => {
    vi.mocked(dataPlaces).mockResolvedValue([]);

    render(<DataPlaces />);

    await waitFor(() =>
      expect(screen.getByText(/в браузере папки приложения нет/)).toBeTruthy(),
    );
  });

  it("ошибку называет, а не показывает пустой список", async () => {
    vi.mocked(dataPlaces).mockRejectedValue(new Error("папка недоступна"));

    render(<DataPlaces />);

    await waitFor(() =>
      expect(screen.getByText(/список не прочитался: папка недоступна/)).toBeTruthy(),
    );
  });

  it("не предлагает уборку: кнопок в карточке нет", async () => {
    vi.mocked(dataPlaces).mockResolvedValue([place()]);

    render(<DataPlaces />);

    await waitFor(() => expect(screen.getByText("Журнал действий")).toBeTruthy());
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("размер не округляется до нуля", () => {
    expect(formatBytes(0)).toBe("0 Б");
    expect(formatBytes(900)).toBe("900 Б");
    expect(formatBytes(2048)).toBe("2.0 КБ");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 МБ");
  });
});
