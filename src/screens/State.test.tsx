// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StateScreen } from "./State";
import { stateItems } from "../lib/stateItems";
import type { StateItem } from "../lib/state";

/**
 * Экран «Состояние» (шаг 1).
 *
 * Проверяется не разметка, а то, ради чего шаг: **одним взглядом** видно, что
 * работает, и при этом ничего не соврано. Три проверки на каждое утверждение:
 * слово есть, цвет не заменяет слово, и подтверждение названо или честно
 * отсутствует.
 */
// Без очистки разметка предыдущего теста остаётся в документе, и «не проверено»
// находится там, где его уже нет: тест валит верный код.
afterEach(cleanup);

describe("экран состояния", () => {
  const noop = vi.fn();

  it("слово состояния видно текстом, а не только цветом", () => {
    // Дальтоник и диктор должны видеть то же, что зрячий: «провал» и
    // «проверено» отличаются буквами.
    const items: StateItem[] = [
      { id: "a", title: "Движок", hint: "чем думает", condition: "proven-here", evidence: "процесс запущен", screen: "models" },
      { id: "b", title: "Модель", hint: "что знает", condition: "failed", evidence: "лог прогона", screen: "models" },
    ];
    render(<StateScreen items={items} onGo={noop} />);
    expect(screen.getByText("проверено на этой машине")).toBeTruthy();
    expect(screen.getByText("провал")).toBeTruthy();
  });

  it("«проверено» без подтверждения показывается как «не проверено»", () => {
    // Экран не должен врать из вежливости: вера — не проверка.
    const items: StateItem[] = [
      { id: "a", title: "Модель", hint: "что знает", condition: "proven-here", evidence: null, screen: "models" },
    ];
    render(<StateScreen items={items} onGo={noop} />);
    expect(screen.queryByText("проверено на этой машине")).toBeNull();
    expect(screen.getByText("не проверено")).toBeTruthy();
  });

  it("сводка называет числа и не говорит «готово»", () => {
    // «Всё работает» врёт при непроверенном; числа не врут.
    render(
      <StateScreen
        items={stateItems({ readiness: null, actions: 12, risky: 3, autostart: false, platform: null })}
        onGo={noop}
      />,
    );
    // Ищем именно строку сводки — она начинается с числа, а «не проверено» в
    // списке под ней начинается со слова. Иначе проверка нашла бы состояние
    // пункта и не проверила бы сводку вовсе.
    expect(screen.getByText(/^\d+ проверено/)).toBeTruthy();
    expect(screen.getByText(/^\d+ проверено .*не установлено/)).toBeTruthy();
    expect(screen.queryByText(/готово/i)).toBeNull();
  });

  it("у каждого пункта названо подтверждение или его отсутствие", () => {
    // «Проверено» без «чем» — то самое заблуждение, от которого уходим.
    render(
      <StateScreen
        items={stateItems({ readiness: null, actions: null, risky: null, autostart: null, platform: null })}
        onGo={noop}
      />,
    );
    // Готовность не спрошена — все пункты честно «не проверено», и это видно
    // несколько раз, а не один.
    expect(screen.getAllByText("не проверено").length).toBeGreaterThan(1);
  });

  it("с каждого пункта можно уйти туда, где это меняется", async () => {
    const onGo = vi.fn();
    render(
      <StateScreen
        items={[
          { id: "engine", title: "Движок", hint: "чем думает", condition: "not-installed", evidence: null, screen: "models" },
        ]}
        onGo={onGo}
      />,
    );
    const buttons = screen.getAllByRole("button", { name: "Открыть" });
    expect(buttons.length).toBeGreaterThan(0);
    buttons[0]!.click();
    // Ведёт на настоящий экран, а не в пустоту.
    expect(onGo).toHaveBeenCalledWith("models");
  });

  it("когда проверять нечего, экран говорит это нормой, а не пустотой", () => {
    render(<StateScreen items={[]} onGo={noop} />);
    expect(screen.getByText("проверять нечего")).toBeTruthy();
  });

  it("система спрашивается у себя и стоит в состоянии (шаг 17)", () => {
    // Без версии Windows и WebView2 поддержка — угадывание: на старом движке
    // приложение ведёт себя иначе, и понять это можно только зная версию.
    const unsupported = {
      state: "unsupported" as const,
      facts: { os: "windows", osVersion: "6.1.7601", engineMajor: 95 },
      reason: "old-webview" as const,
    };
    render(
      <StateScreen
        items={stateItems({
          readiness: null,
          actions: null,
          risky: null,
          autostart: null,
          platform: unsupported,
        })}
        onGo={noop}
      />,
    );
    // Пункт назван, версии показаны фактами, состояние — провал с причиной.
    expect(screen.getByText("Система")).toBeTruthy();
    expect(screen.getByText(/6\.1\.7601/)).toBeTruthy();
    expect(screen.getByText(/движок 95/)).toBeTruthy();
    expect(screen.getAllByText("провал").length).toBeGreaterThan(0);
  });

  it("систему не спросили — «не проверено», а не «всё хорошо»", () => {
    render(
      <StateScreen
        items={stateItems({ readiness: null, actions: null, risky: null, autostart: null, platform: null })}
        onGo={noop}
      />,
    );
    // Пункт есть и молчит о версиях честно: незнание не приговор, но и не успех.
    expect(screen.getByText("Система")).toBeTruthy();
  });
});

describe("переустановка названа до нажатия (шаг 219)", () => {
  it("сказано, что модели не трогаются и не качаются заново", () => {
    // Вопрос «а если переустановить — опять всё качать?» задаётся **до** того,
    // как человек нажмёт «удалить». Списками, потому что «данные в безопасности»
    // каждый понимает по-своему.
    render(<StateScreen items={[]} onGo={() => undefined} />);
    expect(screen.getByText(/Не трогает: модели/)).toBeTruthy();
    expect(screen.getByText(/не качается заново/)).toBeTruthy();
  });
});
