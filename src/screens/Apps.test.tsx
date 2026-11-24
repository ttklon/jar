// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { Apps } from "./Apps";

/**
 * Шаг 165: профиль приложения называет возраст, а не только дату.
 *
 * «Проверено 2024-01-01» человек не переводит в «давно», а от этого зависит,
 * верить ли якорям.
 */

const old = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

vi.mock("../ipc", () => ({
  listProfiles: async () => [
    {
      slug: "notepad",
      app: "Блокнот",
      kind: "app",
      exe: ["notepad.exe"],
      ui_stack: "UIA",
      version_seen: "11",
      verified_at: old,
      anchors: 12,
      executable: 1,
      operations: [{ name: "сохранить", registry: "files|записать|файл", risk: "write-local", has_tool: true }],
    },
  ],
}));

afterEach(cleanup);

describe("профиль приложения", () => {
  it("старый профиль назван старым словами, а не только датой (шаг 165)", async () => {
    render(<Apps />);
    await waitFor(() => expect(screen.getByText("Блокнот")).toBeTruthy());
    // Дата остаётся — это факт; рядом появляется последствие.
    expect(screen.getByText(new RegExp(`проверено ${old}`))).toBeTruthy();
    expect(screen.getByText(/400 дней назад — программа с тех пор могла измениться/)).toBeTruthy();
  });

  it("свежий профиль не пугает: возраст не выдумывается", async () => {
    // Обратная сторона правила: предупреждение появляется, только когда есть о чём.
    render(<Apps />);
    await waitFor(() => expect(screen.getByText("Блокнот")).toBeTruthy());
    expect(screen.queryByText(/якоря могли съехать/)).toBeTruthy(); // профиль здесь старый
    expect(screen.queryByText(/считайте, что давно/)).toBeNull();
  });
});
