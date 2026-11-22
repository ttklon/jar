// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { dataPlaces, dataTotals } from "../ipc";
import type { DataPlace, DataTotals } from "../ipc";
import { DataPlaces, formatBytes } from "./DataPlaces";

/**
 * Карточка «Где данные» отвечает на вопрос «а где посмотреть». Проверяется не вёрстка,
 * а два утверждения: путь полный и «файла ещё нет» не выдаётся за «0 КБ».
 */

vi.mock("../ipc", () => ({
  dataPlaces: vi.fn(),
  dataTotals: vi.fn(),
}));

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverStub);

beforeEach(() => {
  // Умолчание для тестов, которым итог не важен: без него мок отдаёт `undefined`,
  // и карточка падает не на своём утверждении, а на чужом отсутствии.
  vi.mocked(dataTotals).mockResolvedValue(null);
});

afterEach(() => {
  cleanup();
  vi.mocked(dataPlaces).mockReset();
  vi.mocked(dataTotals).mockReset();
});

const GB = 1024 * 1024 * 1024;

function totals(patch: Partial<DataTotals> = {}): DataTotals {
  return {
    dataBytes: 512 * 1024 * 1024,
    modelsBytes: 3 * GB,
    runtimesBytes: 1 * GB,
    programBytes: 20 * 1024 * 1024,
    totalBytes: 512 * 1024 * 1024 + 3 * GB + 1 * GB + 20 * 1024 * 1024,
    ...patch,
  };
}

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
    // Модель весит гигабайты: «3072.0 МБ» вместо «3.0 ГБ» — это способ ничего не сказать.
    expect(formatBytes(3 * 1024 * 1024 * 1024)).toBe("3.0 ГБ");
  });

  it("итог установки назван по частям, а не одним числом", async () => {
    vi.mocked(dataPlaces).mockResolvedValue([place()]);
    vi.mocked(dataTotals).mockResolvedValue(totals());

    render(<DataPlaces />);

    await waitFor(() => expect(screen.getByText("Сколько занимает установка")).toBeTruthy());
    expect(screen.getByText("всего 4.5 ГБ")).toBeTruthy();
    expect(screen.getByText("данные приложения: 512.0 МБ")).toBeTruthy();
    expect(screen.getByText("модели: 3.0 ГБ")).toBeTruthy();
    expect(screen.getByText("движки: 1.0 ГБ")).toBeTruthy();
    expect(screen.getByText("программа: 20.0 МБ")).toBeTruthy();
  });

  it("«не посчитано» не выдаётся за ноль байт", async () => {
    vi.mocked(dataPlaces).mockResolvedValue([place()]);
    vi.mocked(dataTotals).mockResolvedValue(null);

    render(<DataPlaces />);

    // Ноль байт — это утверждение, и оно было бы ложью: в браузере установки нет.
    await waitFor(() =>
      expect(screen.getByText(/в браузере установки нет — считать нечего/)).toBeTruthy(),
    );
    expect(screen.queryByText(/всего 0 Б/)).toBeNull();
  });

  it("ошибка счёта называется, а не превращается в ноль", async () => {
    vi.mocked(dataPlaces).mockResolvedValue([place()]);
    vi.mocked(dataTotals).mockRejectedValue(new Error("папка недоступна"));

    render(<DataPlaces />);

    await waitFor(() =>
      expect(screen.getByText(/размер установки не посчитался: папка недоступна/)).toBeTruthy(),
    );
  });
});
