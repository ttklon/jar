// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { RightNowCard } from "./RightNowCard";

/**
 * Шаг 43: «что сейчас» — показывает, не управляет.
 *
 * Правило rightNow существовало и не было подключено; человек, у которого
 * приложение «что-то шевелится», не мог узнать, что именно.
 */

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);

afterEach(cleanup);

describe("что сейчас", () => {
  it("называет идущее дело и его шаг", () => {
    render(<RightNowCard blocks={[{ title: "делается сейчас", lines: ["«почистить диск»: шаг 2 из 4"] }]} />);
    expect(screen.getByText("делается сейчас")).toBeTruthy();
    expect(screen.getByText("«почистить диск»: шаг 2 из 4")).toBeTruthy();
  });

  it("«ничего не происходит» — ответ, а не пустой экран", () => {
    render(<RightNowCard blocks={[{ title: "ничего не происходит", lines: ["Жду вашу фразу."] }]} />);
    expect(screen.getByText("ничего не происходит")).toBeTruthy();
  });

  it("не даёт «остановить всё»: экран показывает, а не управляет", () => {
    render(<RightNowCard blocks={[{ title: "делается сейчас", lines: ["«чищу»: шаг 1 из 2"] }]} />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});
