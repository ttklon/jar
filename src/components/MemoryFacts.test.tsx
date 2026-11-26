// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryFacts } from "./MemoryFacts";

/**
 * «Что я о вас помню» — проверяется глазами человека: все факты в одном списке,
 * у каждого ровно одна кнопка, забытое исчезает и объясняется словами.
 */

let stored: Record<string, string> = {};

const forgetFact = vi.fn(async (id: string) => {
  const [kind] = id.split(":");
  const row = Object.keys(stored).find((key) => key.startsWith(kind + ":")) ?? "";
  delete stored[row];
  return id;
});

vi.mock("../ipc", () => ({
  isTauri: () => true,
  facts: async () => Object.entries(stored).map(([key, value]) => ({ key, value })),
  forgetFact: (id: string) => forgetFact(id),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  stored = {};
});

describe("экран памяти", () => {
  it("показывает все факты одним списком и ровно одну кнопку на факт", async () => {
    stored = { "folder:D:\\Отчёты": "отчёты", "voice:Алла": "Алла" };
    render(<MemoryFacts />);

    expect(await screen.findByText(/2 факта, каждый удаляется одной кнопкой/)).toBeTruthy();
    // Факт назван своими словами: вид и значение, без внутреннего ключа.
    expect(screen.getByText("папка D:\\Отчёты")).toBeTruthy();
    expect(screen.getByText("голос Алла")).toBeTruthy();
    expect(screen.queryByText(/folder:/)).toBeNull();
    // Ни «очистить всё», ни второго действия на строку.
    expect(screen.queryByText(/очистить всё/i)).toBeNull();
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  it("забытое обещает не возвращаться и исчезает из списка", async () => {
    stored = { "voice:Алла": "Алла" };
    render(<MemoryFacts />);

    fireEvent.click(await screen.findByRole("button", { name: /забыть/ }));

    expect(await screen.findByText(/больше не будет предлагаться/)).toBeTruthy();
    expect(screen.getByText(/Вернуть нельзя/)).toBeTruthy();
    await waitFor(() => expect(screen.queryByText("голос Алла")).toBeNull());
  });

  it("пустая память говорит об этом словами, а не пустым экраном", async () => {
    render(<MemoryFacts />);

    expect(await screen.findByText(/в памяти ничего нет/)).toBeTruthy();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});
