// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
  repair: null as (() => Promise<string>) | null,
  repairs: 0,
}));

vi.mock("../ipc", () => ({
  isTauri: () => mocks.tauri,
}));

vi.mock("../ipc/tauri", () => ({
  // Неполный мок роняет чужие тесты: карточка теперь знает и repairMemory.
  repairMemory: async () => {
    mocks.repairs += 1;
    if (mocks.repair) return mocks.repair();
    return "";
  },
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
  mocks.repair = null;
  mocks.repairs = 0;
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



  it("чинит одной кнопкой, без выбора копии", async () => {
    // Шаг 349. В момент беды человеку не до выбора: годная копия уже есть, и
    // её выбирает ядро. Одна кнопка — одно действие.
    mocks.note = "база не открылась (повреждена)";
    mocks.repair = async () => "память восстановлена из копии memory-1.db (1 МБ); прежняя база отложена: replace";
    render(<MemoryNote />);

    const button = await screen.findByRole("button", { name: t.settingsMemoryFix });
    fireEvent.click(button);

    const done = await screen.findByText(/память восстановлена из копии/);
    expect(done.textContent).toContain("прежняя база отложена");
    expect(mocks.repairs).toBe(1);
  });

  it("отказ ремонта называет причину, а не молчит", async () => {
    // «Годной копии нет» — это ответ, а не повод показать пустоту: человек
    // должен знать, что восстановить не из чего.
    mocks.note = "база не открылась (повреждена)";
    mocks.repair = async () => {
      throw new Error("годной копии нет: восстанавливать не из чего");
    };
    render(<MemoryNote />);

    fireEvent.click(await screen.findByRole("button", { name: t.settingsMemoryFix }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("годной копии нет");
  });
});
