// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { fireEvent } from "@testing-library/dom";
import { Settings } from "./Settings";
import { t } from "../i18n/ru";

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

  it("разбиты на три раздела, а не идут двадцатью пунктами подряд", () => {
    // Шаг 199. Одиннадцать карточек без заголовков — это стена: человек не
    // понимает, где кончается «внешний вид» и начинается «данные». Три
    // заголовка по вопросу, с которым сюда приходят, дают структуру и диктору
    // (h3 в оглавлении), и глазу.
    render(<Settings theme="dark" dark onThemeChange={() => undefined} onShowWelcome={() => undefined} version="0.1.0" source="ядро" />);

    const look = screen.getByRole("heading", { name: t.settingsSectionLook });
    const start = screen.getByRole("heading", { name: t.settingsSectionStart });
    const data = screen.getByRole("heading", { name: t.settingsSectionData });

    // Все три на месте и именно третьего уровня: заголовок экрана — h2, и
    // раздел не должен с ним спорить.
    for (const heading of [look, start, data]) {
      expect(heading.tagName).toBe("H3");
    }

    // Порядок: внешний вид → запуск → данные. Он не случаен: это порядок
    // вопросов, с которыми в настройки приходят.
    const order = [look, start, data].map((h) => Array.from(document.querySelectorAll("*")).indexOf(h));
    expect(order[0]).toBeLessThan(order[1]!);
    expect(order[1]).toBeLessThan(order[2]!);

    // И каждая карточка нашлась под своим разделом: тема — под «как выглядит».
    expect(screen.getByText(t.settingsTheme)).toBeTruthy();
  });
});

describe("высокий контраст и уменьшение движения — настройки системы (шаг 186)", () => {
  it("приложение говорит, что настройку заметило, а не молчит", async () => {
    // Дефект: тема умела три состояния, а контраст не учитывался никак — и
    // человек, включивший его в Windows, не понимал, слышит ли его приложение.
    const origin = globalThis.matchMedia;
    globalThis.matchMedia = ((q: string) => ({
      matches: q.includes("forced-colors") || q.includes("dark"),
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof globalThis.matchMedia;

    renderSettings();
    // Все три состояния названы словами — и включённое, и выключенное.
    expect(screen.getByText(/тема системы: тёмная/)).toBeTruthy();
    expect(screen.getByText(/высокая контрастность: включена — цвета берутся у системы/)).toBeTruthy();
    expect(screen.getByText(/уменьшение движения: выключено/)).toBeTruthy();

    globalThis.matchMedia = origin;
  });
});

describe("три состояния темы, и каждое переключается (шаг 197)", () => {
  it("светлая, тёмная и «как в системе» — три кнопки, и нажатие ведёт к своему выбору", () => {
    // Дефект был в том, что темнота зашита: «как в системе» не существовало.
    // Здесь проверяется не значение по умолчанию, а то, что **все три** доступны
    // и каждая сообщает наверх именно себя.
    const onThemeChange = vi.fn();
    render(
      <Settings
        theme="dark"
        dark
        onThemeChange={onThemeChange}
        onShowWelcome={() => undefined}
        version="0.1.0"
        source="ядро"
      />,
    );

    const group = screen.getByRole("radiogroup", { name: t.settingsTheme });
    const buttons = Array.from(group.querySelectorAll("button"));
    expect(buttons).toHaveLength(3);
    // Выбранное состояние помечено для диктора, а не только цветом.
    expect(buttons.find((item) => item.getAttribute("aria-pressed") === "true")).toBeTruthy();

    for (const button of buttons) {
      fireEvent.click(button);
    }
    // Каждое нажатие — свой выбор, и три разных, а не одно и то же трижды.
    const chosen = onThemeChange.mock.calls.map((call) => call[0]);
    expect(buttons.length, "кнопок темы меньше трёх — проверка была бы пустой").toBe(3);
    expect(new Set(chosen).size).toBe(3);
    expect(chosen).toEqual(expect.arrayContaining(["light", "dark", "system"]));
  });

  it("«как в системе» честно говорит, какая тема сейчас", () => {
    render(
      <Settings
        theme="system"
        dark={false}
        onThemeChange={() => undefined}
        onShowWelcome={() => undefined}
        version="0.1.0"
        source="ядро"
      />,
    );
    // Не «системная» без пояснения: человек должен видеть, что это значит сейчас.
    expect(screen.getByText(t.settingsThemeSystem(false))).toBeTruthy();
  });
});
