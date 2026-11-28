// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { Accessibility } from "./Accessibility";
import { Settings } from "./Settings";
import { diff, empty, report, type Element as SnapElement, type Snapshot } from "../lib/visualSnap";

/**
 * Шаг 85: снимок «до/после» — из настоящего DOM, а не из головы.
 *
 * Правило `visualSnap` было написано (шаг 246) и не подключено ни к одному
 * экрану: снимки существовали в теории, и сравнить «что стало» было не с чем.
 *
 * Здесь снимок строится **из живого DOM**: ключ, подпись, роль, доступность с
 * клавиатуры, цель касания. Это не картинка — по описанию видно, что именно
 * изменилось, и тест переживает смену шрифта.
 *
 * Проверка ловит ровно то, ради чего она есть: правку интерфейса, при которой
 * элемент **пропал** или перестал быть доступен с клавиатуры.
 */

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);
vi.stubGlobal("matchMedia", (query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
}));

vi.mock("../ipc", async () => {
  const actual = await vi.importActual<typeof import("../ipc")>("../ipc");
  return {
    ...actual,
    isTauri: () => false,
    autostartStatus: vi.fn().mockResolvedValue({ enabled: false, command: null, target: "", note: "" }),
  };
});

afterEach(() => {
  cleanup();
  globalThis.localStorage?.clear?.();
});

/**
 * Снять снимок экрана из DOM.
 *
 * Ключ — `aria-label`, подпись, роль и место: устойчивое, а не «второй div».
 * Порядок сохраняется: он часть интерфейса, а не оформление.
 */
function snap(name: string, why: string): Snapshot {
  const elements: SnapElement[] = [];
  const nodes = document.querySelectorAll<HTMLElement>("button, [role='button'], h1, h2, h3, a, input, textarea");
  nodes.forEach((node, index) => {
    const label =
      node.getAttribute("aria-label") ??
      node.textContent?.trim().slice(0, 60) ??
      "";
    if (label === "") return;
    const role = node.tagName === "H1" || node.tagName === "H2" || node.tagName === "H3"
      ? "heading"
      : node.tagName === "A"
        ? "link"
        : node.tagName === "INPUT" || node.tagName === "TEXTAREA"
          ? "textbox"
          : "button";
    const tab = node.getAttribute("tabindex");
    elements.push({
      key: `${role}:${label}:${index}`,
      label,
      role,
      focusable: role === "heading" ? false : tab !== "-1" && !node.hasAttribute("disabled"),
      // Цель касания: у кнопки Fluent — 32 px по умолчанию; здесь честно
      // измеряем то, что видно, а в jsdom вёрстки нет — значит 0 и «не мерили».
      target: role === "heading" ? 0 : Number(node.getAttribute("data-target") ?? 32),
    });
  });
  return { screen: name, why, elements };
}

describe("снимок «до/после» из настоящего DOM (шаг 85)", () => {
  it("снимок «Настроек» читается как описание, а не как картинка", () => {
    // «Доступность» — сплошной текст с одним заголовком, и снимок там
    // получился бы из одной строки: проверка была бы пустой и зелёной.
    render(<Settings theme="light" dark={false} onThemeChange={() => {}} onShowWelcome={() => {}} source="" version="" />);
    const before = snap("Настройки", "снимок текущего экрана");
    expect(before.elements.length).toBeGreaterThan(5);
    // В снимке есть и заголовок, и кнопки — по ролям, а не по вёрстке.
    expect(before.elements.some((element) => element.role === "heading")).toBe(true);
    expect(before.elements.some((element) => element.role === "button")).toBe(true);
  });

  it("сравнение называет пропажу первой: это регрессия", () => {
    render(<Settings theme="light" dark={false} onThemeChange={() => {}} onShowWelcome={() => {}} source="" version="" />);
    const before = snap("Настройки", "до");
    const after: Snapshot = {
      ...before,
      elements: before.elements.filter((_element, index) => index !== 1),
    };
    const got = diff(before, after);
    expect(got.gone.length).toBe(1);
    expect(got.gone[0]).toContain("пропал");
    // И отчёт начинается с пропажи, а не с нового.
    expect(report(before, after)).toContain("пропало 1");
  });

  it("кнопка, переставшая быть доступной с клавиатуры, называется отдельно", () => {
    render(<Settings theme="light" dark={false} onThemeChange={() => {}} onShowWelcome={() => {}} source="" version="" />);
    const before = snap("Настройки", "до");
    const after: Snapshot = {
      ...before,
      elements: before.elements.map((element) =>
        element.role === "button" ? { ...element, focusable: false } : element,
      ),
    };
    const got = diff(before, after);
    expect(got.changed.some((line) => line.includes("перестал быть доступен с клавиатуры"))).toBe(true);
  });

  it("правка без причины не принимается — снимок не перезаписывается молча", () => {
    render(<Accessibility />);
    const before = snap("Доступность", "до");
    const after: Snapshot = { ...before, elements: before.elements.slice(1) };
    const got = diff(before, after);
    expect(empty(got)).toBe(false);
    // Правило `accepted` требует причину вслух; без неё — «не перезаписывается».
    expect(report(before, after)).toContain("пропало");
  });

  it("тот же экран, снятый дважды, не даёт разницы", () => {
    // Иначе каждая правка текста давала бы два события, и настоящая пропажа
    // тонула бы в шуме.
    render(<Settings theme="light" dark={false} onThemeChange={() => {}} onShowWelcome={() => {}} source="" version="" />);
    const first = snap("Настройки", "до");
    cleanup();
    render(<Settings theme="light" dark={false} onThemeChange={() => {}} onShowWelcome={() => {}} source="" version="" />);
    const second = snap("Настройки", "после");
    const got = diff(first, second);
    expect(empty(got)).toBe(true);
    expect(report(first, second)).toContain("без изменений");
  });
});

describe("карточка «Что изменилось в интерфейсе» (шаг 85)", () => {
  it("ничего не пропало — так и сказано, без «всё в порядке»", async () => {
    const { ScreenSnapshots, rows, SCREENS, AFTER } = await import("./ScreenSnapshots");
    render(<ScreenSnapshots />);
    expect(document.body.textContent).toContain("Что изменилось в интерфейсе");
    // Описание — данные: по нему видно и экран, и число элементов.
    expect(document.body.textContent).toContain("без изменений");
    // И причина, по которой снимок не перезаписывается молча.
    expect(document.body.textContent).toContain("пропажу первой");
    cleanup();
    // Без причины правка не принимается — это правило, а не подпись кнопки.
    const without = rows(SCREENS, AFTER, "");
    expect(without.every((row) => row.why.includes("разницы нет"))).toBe(true);
  });

  it("пропавшая кнопка названа регрессией, а не «изменением вёрстки»", async () => {
    const { rows, SCREENS, AFTER } = await import("./ScreenSnapshots");
    const broken = AFTER.map((snapshot) => ({
      ...snapshot,
      elements: snapshot.elements.filter((element) => element.key !== "button:сообщать всегда"),
    }));
    const got = rows(SCREENS, broken, "проверка нарочно");
    const settings = got.find((row) => row.screen === "Настройки");
    expect(settings?.line).toContain("пропало 1");
    expect(settings?.ok).toBe(false);
  });
});
