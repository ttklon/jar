// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryNote } from "./MemoryNote";
import { t } from "../i18n/ru";

/**
 * Предупреждение о базе памяти.
 *
 * Повреждённая база раньше выглядела как «память просто пустая»: приложение
 * молча переезжало на временную. Здесь проверяется, что человек видит причину —
 * и что карточки нет, когда всё хорошо (постоянное «в порядке» приучает не
 * читать предупреждения).
 */

const mocks = vi.hoisted(() => ({
  note: null as string | null,
  tauri: true,
}));

vi.mock("../ipc", () => ({
  isTauri: () => mocks.tauri,
}));

vi.mock("../ipc/tauri", () => ({
  appStatus: async () => ({
    version: "0.1.0",
    actions: 1,
    domains: 1,
    data_loaded: true,
    log_file: "",
    audit_file: "",
    tools: 0,
    flows: 0,
    profiles: 0,
    memory_note: mocks.note,
  }),
}));

afterEach(() => {
  cleanup();
  mocks.note = null;
  mocks.tauri = true;
});

describe("карточка «база памяти не открылась»", () => {
  it("показывает причину, когда база повреждена", async () => {
    mocks.note = "база не открылась (база повреждена: disk image is malformed). Работаю на временной";
    render(<MemoryNote />);

    const card = await screen.findByText("База памяти не открылась");
    expect(card).toBeTruthy();
    // Человек видит, почему память пуста, а не догадывается.
    expect(screen.getByText(/повреждена/)).toBeTruthy();
  });

  it("молчит, когда всё хорошо", async () => {
    render(<MemoryNote />);
    // Даём промису разрешиться.
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(screen.queryByText("База памяти не открылась")).toBeNull();
  });

  it("в браузере карточки нет: там ядра и базы нет", async () => {
    mocks.tauri = false;
    mocks.note = "какая-то ошибка";
    render(<MemoryNote />);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(screen.queryByText("База памяти не открылась")).toBeNull();
  });

  it("называет кнопку, которая действительно есть, а не выдуманную", async () => {
    // Этот текст однажды уже ссылался на «Вернуть из копии» — кнопки с таким
    // именем не существует: в настройках она подписана просто «Вернуть».
    // Человек искал бы её и не нашёл, а предупреждение без выхода равно потере.
    mocks.note =
      "База памяти не открылась. Есть целая копия (memory-0000004730-v1.db, 240 КБ): " +
      "в настройках, в разделе «Резервные копии памяти», у неё есть кнопка «Вернуть».";
    render(<MemoryNote />);

    const card = await screen.findByText(/Есть целая копия/);
    // Имя кнопки берём из того же словаря, которым подписана настоящая кнопка.
    expect(card.textContent).toContain(t.settingsBackupsRestore);
    expect(card.textContent).toContain(t.settingsBackups);
    // И выдуманного имени рядом нет.
    expect(card.textContent).not.toContain("Вернуть из копии");
  });


});
