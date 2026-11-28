// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Requirements } from "./Requirements";

/**
 * «Требования и слабая машина» (шаги 232/236/253/492).
 *
 * Проверяем то, что иначе превращается в обещание: числа у батареи, «работа та
 * же» у экономного режима и названное ожидание на медленной машине.
 */

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);

afterEach(cleanup);

describe("экран «Требования»", () => {
  it("экономный режим меняет замеры, но не работу", () => {
    render(<Requirements />);
    fireEvent.click(screen.getByRole("button", { name: "экономный" }));
    expect(screen.getByText(/экономный режим включён/)).toBeTruthy();
    expect(screen.getByText(/замеры раз в 5000 мс, анимации 90 мс/)).toBeTruthy();
    // Главное: список дел и порог подтверждения те же.
    expect(screen.getByText(/работа та же: 835 дел/)).toBeTruthy();
  });

  it("батарея названа числом с единицей, а не «экономно»", () => {
    render(<Requirements />);
    expect(screen.getByText(/в простое: .* %\/час/)).toBeTruthy();
    expect(screen.getByText(/в разговоре: .* %\/час/)).toBeTruthy();
  });

  it("на медленной машине ожидание названо с секундами", () => {
    render(<Requirements />);
    fireEvent.click(screen.getByRole("button", { name: "обычная машина" }));
    expect(screen.getByText(/долго: ждём 4 с\. Это медленная машина или занятый диск, а не зависание/)).toBeTruthy();
  });

  it("пустая машина: данных нет — и это данные, а не ошибка", () => {
    render(<Requirements />);
    fireEvent.click(screen.getByRole("button", { name: "с данными" }));
    // Пустая машина — отдельный случай: на ней нечего показать, и это не сбой.
    expect(screen.getByText(/0 фактов, и это не ошибка/)).toBeTruthy();
  });

  it("в приёмке есть слабая машина, и это сказано классом", () => {
    render(<Requirements />);
    expect(screen.getByText(/ноутбук 2015, 4 ГБ · 4 ГБ · 12 ГБ свободно/)).toBeTruthy();
    expect(screen.getByText("класс «слабая»")).toBeTruthy();
  });
});
