// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryBackups, humanBytes } from "./MemoryBackups";

/**
 * «Вернуть память» — проверяется то, что человек делает руками: видит копии,
 * видит, какая из них битая, спрашивает подтверждение и получает результат.
 */

let backups = [
  { file: "memory-000000000001-v1.db", bytes: 40960, usable: true, problem: "" },
  { file: "memory-000000000002-v2.db", bytes: 2048, usable: false, problem: "копия повреждена" },
];
const restore = vi.fn(async () => ({ file: "memory-000000000001-v1.db", previous: "replace-a.db", bytes: 40960 }));

vi.mock("../ipc", () => ({
  isTauri: () => true,
}));

vi.mock("../ipc/tauri", () => ({
  memoryBackups: async () => backups,
  memoryRestore: (...args: unknown[]) => restore(...(args as [])),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("резервные копии памяти", () => {
  it("битая копия видна, названа и не предлагается к возврату", async () => {
    render(<MemoryBackups />);

    expect(await screen.findByText(/повреждена/)).toBeTruthy();
    // Одна кнопка «Вернуть»: у битой её быть не должно.
    expect(screen.getAllByRole("button", { name: "Вернуть" })).toHaveLength(1);
  });

  it("возврат спрашивает подтверждение, а не заменяет файл по первому нажатию", async () => {
    render(<MemoryBackups />);
    fireEvent.click(await screen.findByRole("button", { name: "Вернуть" }));

    expect(await screen.findByText("Заменить память этой копией?")).toBeTruthy();
    // До «да» ничего не заменено.
    expect(restore).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Да, вернуть" }));
    await waitFor(() => expect(restore).toHaveBeenCalledWith("memory-000000000001-v1.db", true));
    expect(await screen.findByText(/Память возвращена из/)).toBeTruthy();
  });

  it("«Отмена» не трогает память", async () => {
    render(<MemoryBackups />);
    fireEvent.click(await screen.findByRole("button", { name: "Вернуть" }));
    fireEvent.click(await screen.findByRole("button", { name: "Отмена" }));

    await waitFor(() =>
      expect(screen.queryByText("Заменить память этой копией?")).toBeNull(),
    );
    expect(restore).not.toHaveBeenCalled();
  });

  it("когда копий нет — это сказано словами, а не пустотой", async () => {
    backups = [];
    render(<MemoryBackups />);
    expect(await screen.findByText(/Копий пока нет/)).toBeTruthy();
    backups = [];
  });

  it("размер показывается по-человечески", () => {
    expect(humanBytes(512)).toBe("512 Б");
    expect(humanBytes(2048)).toBe("2 КБ");
    expect(humanBytes(5 * 1024 * 1024)).toBe("5.0 МБ");
  });
});
