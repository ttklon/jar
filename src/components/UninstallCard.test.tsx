// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { UninstallCard } from "./UninstallCard";

/**
 * «Удаление» (шаги 305/319/448).
 *
 * Ошибка, которую здесь видно: одна кнопка «удалить» молча решает за человека,
 * теряет ли он память, которую собирал год. Поэтому проверяем не «карточка
 * есть», а три обещания: список с путями, безвозвратное названо, и по умолчанию
 * данные остаются.
 */

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);

afterEach(cleanup);

describe("карточка «Удаление»", () => {
  it("по умолчанию данные остаются, и причина — асимметрия, а не «так безопаснее»", () => {
    render(<UninstallCard />);
    expect(screen.getByText(/данные останутся: их можно удалить потом, а вернуть собранную память — нельзя/)).toBeTruthy();
    // По умолчанию выбран «оставить».
    expect(screen.getByRole("button", { name: "оставить данные" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("список называет пути и размеры, а не слово «данные»", () => {
    render(<UninstallCard />);
    const list = screen.getByLabelText("что будет удалено");
    expect(list.textContent).toMatch(/%LOCALAPPDATA%\\ZShelper\\models/);
    expect(list.textContent).toMatch(/4\.1 ГБ/);
    // При «оставить» память в списке удаления отсутствует — её не тронут.
    expect(list.textContent).not.toMatch(/memory\.md/);
  });

  it("«удалить всё» показывает безвозвратное и не даёт сделать это случайно", () => {
    render(<UninstallCard />);
    fireEvent.click(screen.getByRole("button", { name: "удалить всё" }));

    // Память и журнал появились в списке — с пометкой, что вернуть нельзя.
    const list = screen.getByLabelText("что будет удалено");
    expect(list.textContent).toMatch(/memory\.md/);
    expect(list.textContent).toMatch(/восстановить нельзя/);
    // Подтверждение считает и освобождённое место, и безвозвратное.
    expect(screen.getByText(/Безвозвратно: память: факты и предпочтения, журнал действий, настройки/)).toBeTruthy();
  });

  it("запись автозапуска убирается всегда — иначе Windows ругается при входе", () => {
    render(<UninstallCard />);
    expect(screen.getByText(/запись автозапуска — иначе Windows будет ругаться при входе/)).toBeTruthy();
  });

  it("после ответа сказано, что станет с памятью", () => {
    render(<UninstallCard />);
    fireEvent.click(screen.getByRole("button", { name: "что произойдёт при удалении" }));
    expect(screen.getByRole("alert").textContent).toMatch(
      /удалю программу \(4 места\), а память и модель оставлю: они пригодятся, если поставите снова/,
    );
    // И где останутся данные — чтобы человек нашёл их, а не гадал.
    expect(screen.getByRole("alert").textContent).toMatch(/%APPDATA%\\ZShelper/);
  });
});
