// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StartupCard } from "./StartupCard";

vi.mock("../ipc", () => ({
  isTauri: vi.fn(() => true),
  startupStatus: vi.fn(),
  startupSetQuiet: vi.fn(),
}));

import { startupSetQuiet, startupStatus } from "../ipc";

const rows = [
  {
    how: "autostart",
    window: true,
    said: "запуск при входе: окно, потому что тихий старт выключен",
  },
  {
    how: "shortcut",
    window: true,
    said: "двойной клик по ярлыку: окно всегда — иначе кажется, что программа не запустилась",
  },
  {
    how: "firstRun",
    window: true,
    said: "первый запуск после установки: окно всегда — иначе непонятно, что установилось",
  },
];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("StartupCard", () => {
  it("показывает, что будет при каждом способе запуска", async () => {
    vi.mocked(startupStatus).mockResolvedValue({ quiet: false, rows });
    render(<StartupCard />);
    const list = await screen.findByRole("list", {
      name: "что будет при каждом способе запуска",
    });
    const texts = Array.from(list.querySelectorAll("li")).map((li) => li.textContent ?? "");
    expect(texts).toHaveLength(3);
    // Ярлык и первый запуск — окно всегда. Это и есть правило, а не деталь.
    expect(texts[1]).toContain("ярлык");
    expect(texts[1]?.startsWith("окно")).toBe(true);
    expect(texts[2]).toContain("первый запуск");
  });

  it("тихий старт включается и показывает тихую строку автозапуска", async () => {
    vi.mocked(startupStatus)
      .mockResolvedValueOnce({ quiet: false, rows })
      .mockResolvedValueOnce({
        quiet: true,
        rows: [
          { how: "autostart", window: false, said: "запуск при входе: тихо в трее, подсказка один раз" },
          ...rows.slice(1),
        ],
      });
    vi.mocked(startupSetQuiet).mockResolvedValue(true);
    render(<StartupCard />);
    const toggle = await screen.findByRole("switch", {
      name: "Тихий старт при входе в Windows",
    });
    fireEvent.click(toggle);
    expect(startupSetQuiet).toHaveBeenCalledWith(true);
    await waitFor(() => {
      const list = screen.getByRole("list", { name: "что будет при каждом способе запуска" });
      const first = list.querySelector("li");
      expect(first?.textContent ?? "").toContain("тихо, только трей");
    });
  });

  it("говорит, что ярлык всё равно откроет окно", async () => {
    vi.mocked(startupStatus).mockResolvedValue({ quiet: true, rows });
    render(<StartupCard />);
    // Главное правило не спрятано в справке: оно на карточке всегда.
    expect(
      await screen.findByText(/ярлык и первый запуск окно показывают всегда/),
    ).toBeTruthy();
  });

  it("в браузере честно говорит, что здесь не проверить", async () => {
    const { isTauri } = await import("../ipc");
    vi.mocked(isTauri).mockReturnValue(false);
    vi.mocked(startupStatus).mockResolvedValue({ quiet: false, rows: [] });
    render(<StartupCard />);
    expect(await screen.findByText(/в браузере запуска нет/)).toBeTruthy();
    expect(
      screen.getByRole("switch", { name: "Тихий старт при входе в Windows" }).hasAttribute("disabled"),
    ).toBe(true);
    vi.mocked(isTauri).mockReturnValue(true);
  });

  it("ошибку записи не выдаёт за сохранение", async () => {
    vi.mocked(startupStatus).mockResolvedValue({ quiet: false, rows });
    vi.mocked(startupSetQuiet).mockRejectedValue(new Error("нет прав на файл"));
    render(<StartupCard />);
    fireEvent.click(
      await screen.findByRole("switch", { name: "Тихий старт при входе в Windows" }),
    );
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      expect.stringContaining("нет прав на файл"),
    );
  });
});
