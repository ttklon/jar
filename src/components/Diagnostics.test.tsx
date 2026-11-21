// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Diagnostics } from "./Diagnostics";

/**
 * «Собрать для разбора» — проверяется порядок: сначала текст на экране, потом
 * решение человека. Кнопки «отправить» нет вовсе, и это тоже проверяется.
 */

const pack = vi.fn(async () => ({
  text: "приложение: 0.1.0\n<путь>\n",
  paths_scrubbed: 1,
  secrets_scrubbed: 0,
  notes: ["вычищено путей: 1"],
}));

vi.mock("../ipc", () => ({ isTauri: () => true }));
vi.mock("../ipc/tauri", () => ({ diagnosticsPack: () => pack() }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("диагностический пакет", () => {
  it("собирает по нажатию и показывает счётчик вычищенного", async () => {
    render(<Diagnostics />);
    fireEvent.click(screen.getByRole("button", { name: "Собрать" }));

    // Текст виден ДО любой отправки — это и есть весь смысл.
    const area = (await screen.findByLabelText("Текст пакета")) as HTMLTextAreaElement;
    expect(area.value).toContain("приложение: 0.1.0");
    expect(screen.getByText(/вычищено путей: 1/)).toBeTruthy();
  });

  it("кнопки «отправить» нет: решает человек, а не программа", async () => {
    render(<Diagnostics />);
    fireEvent.click(screen.getByRole("button", { name: "Собрать" }));
    await screen.findByLabelText("Текст пакета");

    expect(screen.queryByRole("button", { name: /отправ/i })).toBeNull();
  });

  it("текст можно править перед отправкой", async () => {
    render(<Diagnostics />);
    fireEvent.click(screen.getByRole("button", { name: "Собрать" }));
    const area = (await screen.findByLabelText("Текст пакета")) as HTMLTextAreaElement;

    fireEvent.change(area, { target: { value: "только эта строка" } });
    expect(area.value).toBe("только эта строка");
  });

  it("ошибка сборки названа, а не проглочена", async () => {
    pack.mockRejectedValueOnce(new Error("журнала нет"));
    render(<Diagnostics />);
    fireEvent.click(screen.getByRole("button", { name: "Собрать" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
  });
});
