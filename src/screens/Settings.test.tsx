// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { fireEvent } from "@testing-library/dom";
import { Settings } from "./Settings";

/**
 * Настройки читают реестр при открытии. В тесте реестра нет, и это правильно:
 * проверяем, что экран не падает и честно говорит, что автозапуска здесь нет,
 * вместо того чтобы показывать «выключено» как факт.
 */
vi.mock("../ipc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../ipc")>();
  return {
    ...actual,
    isTauri: () => false,
    autostartStatus: vi.fn().mockResolvedValue({
      enabled: false,
      command: null,
      target: "",
      note: "в браузере автозапуска нет",
    }),
    autostartEnable: vi.fn(),
    autostartDisable: vi.fn(),
  };
});

/**
 * Настройки — единственный путь обратно к знакомству. Если кнопка пропадёт, экран
 * первого запуска станет недоступным навсегда: показать его больше нечем.
 */

afterEach(cleanup);

const renderSettings = (onShowWelcome = vi.fn(), onThemeChange = vi.fn()) => {
  render(
    <Settings
      theme="dark"
      dark
      onThemeChange={onThemeChange}
      onShowWelcome={onShowWelcome}
      source="ядро"
      version="1.0.0"
    />,
  );
  return onShowWelcome;
};

describe("настройки", () => {
  it("умеют показать знакомство снова", () => {
    const onShowWelcome = renderSettings();

    fireEvent.click(screen.getByRole("button", { name: "Показать знакомство" }));

    expect(onShowWelcome).toHaveBeenCalledTimes(1);
  });

  it("тема выбирается тремя состояниями, а не выключателем", () => {
    // «Как в системе» — не синоним светлой и не синоним тёмной. Раньше выключатель
    // не мог этого выразить, и человек терял свой выбор при каждой смене системы.
    const onThemeChange = vi.fn();
    renderSettings(vi.fn(), onThemeChange);

    fireEvent.click(screen.getByRole("button", { name: "как в системе" }));

    expect(onThemeChange).toHaveBeenCalledWith("system");
  });

  it("автозапуск показан по факту чтения, а не по памяти приложения", async () => {
    renderSettings();

    expect(await screen.findByText("в браузере автозапуска нет")).toBeTruthy();
    // В браузере реестра нет — выключатель недоступен, а не «включён и не работает».
    expect((screen.getByRole("switch", { name: "Запускать при входе в Windows" }) as HTMLInputElement).disabled).toBe(true);
  });

  it("показывают версию и откуда данные", () => {
    renderSettings();

    expect(screen.getByText("v1.0.0")).toBeTruthy();
    expect(screen.getByText("ядро")).toBeTruthy();
  });
});
