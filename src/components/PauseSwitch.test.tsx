// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PauseSwitch } from "./PauseSwitch";

vi.mock("../ipc", () => ({
  isTauri: () => false,
  paused: vi.fn(),
  setPaused: vi.fn(),
  pauseExplains: vi.fn(),
}));

import { pauseExplains, paused, setPaused } from "../ipc";

const stops = ["расписания", "горячие клавиши", "микрофон", "фразы"];
const keeps = ["память", "модель", "настройки", "журнал шагов"];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("PauseSwitch", () => {
  it("без ядра не рисует пустую кнопку", async () => {
    vi.mocked(paused).mockResolvedValue(false);
    vi.mocked(pauseExplains).mockResolvedValue({ stops: [], keeps: [] });
    const { container } = render(<PauseSwitch />);
    await waitFor(() => expect(container.innerHTML).toBe(""));
  });

  it("ставит паузу и говорит словами, что остановлено", async () => {
    vi.mocked(paused).mockResolvedValue(false);
    vi.mocked(pauseExplains).mockResolvedValue({ stops, keeps });
    vi.mocked(setPaused).mockResolvedValue(true);
    render(<PauseSwitch />);
    fireEvent.click(await screen.findByRole("button", { name: "Пауза" }));
    expect(setPaused).toHaveBeenCalledWith(true);
    const text = await screen.findByText(/остановлено:/);
    expect(text.textContent).toContain("микрофон");
    expect(text.textContent).toContain("не тронуто: память");
    expect(
      screen.getByRole("button", { name: "Пауза — идёт" }).getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("снимает паузу повторным нажатием", async () => {
    vi.mocked(paused).mockResolvedValue(true);
    vi.mocked(pauseExplains).mockResolvedValue({ stops, keeps });
    vi.mocked(setPaused).mockResolvedValue(false);
    render(<PauseSwitch />);
    fireEvent.click(await screen.findByRole("button", { name: "Пауза — идёт" }));
    expect(setPaused).toHaveBeenCalledWith(false);
    const off = await screen.findByRole("button", { name: "Пауза" });
    expect(off.getAttribute("aria-pressed")).toBe("false");
  });

  it("в браузере кнопка не врёт, что пауза встала", async () => {
    vi.mocked(paused).mockResolvedValue(false);
    vi.mocked(pauseExplains).mockResolvedValue({ stops, keeps });
    vi.mocked(setPaused).mockRejectedValue(new Error("в браузере пауза не ставится"));
    render(<PauseSwitch />);
    fireEvent.click(await screen.findByRole("button", { name: "Пауза" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Пауза" }).getAttribute("aria-pressed"),
      ).toBe("false"),
    );
    expect(screen.queryByText(/остановлено:/)).toBeNull();
  });
});
