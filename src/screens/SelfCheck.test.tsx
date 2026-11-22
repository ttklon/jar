// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { repair, selfCheck } from "../ipc";
import type { SelfCheckVerdict } from "../ipc";
import { SelfCheckCard } from "./SelfCheck";

/**
 * Карточка «Проверка себя». Проверяется не вёрстка, а три обещания: проверки идут по кнопке,
 * провал виден с причиной, а в браузере честно сказано, что проверять нечего.
 */

vi.mock("../ipc", () => ({
  selfCheck: vi.fn(),
  // Неполный мок роняет чужие тесты: карточка теперь знает и `repair`.
  repair: vi.fn(),
}));

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverStub);

afterEach(() => {
  cleanup();
  vi.mocked(selfCheck).mockReset();
  vi.mocked(repair).mockReset();
});

function verdict(patch: Partial<SelfCheckVerdict> = {}): SelfCheckVerdict {
  return {
    name: "Подтверждение одноразовое",
    promise: "одно подтверждение — одно действие",
    passed: true,
    detail: "первое сработало, второе отклонено",
    ms: 3,
    risk: "несогласованное действие выполнится дважды",
    ...patch,
  };
}

describe("карточка «Проверка себя»", () => {
  it("не запускает проверки сама: сначала кнопка", () => {
    render(<SelfCheckCard />);

    expect(selfCheck).not.toHaveBeenCalled();
    expect(screen.getByText(/по кнопке, а не сами/)).toBeTruthy();
  });

  it("по кнопке показывает итоги и считает прошедшие", async () => {
    vi.mocked(selfCheck).mockResolvedValue([verdict(), verdict({ name: "«Стоп» останавливает" })]);

    render(<SelfCheckCard />);
    fireEvent.click(screen.getByRole("button", { name: "Прогнать проверки" }));

    await waitFor(() => expect(screen.getByText("проверок прошло: 2 из 2")).toBeTruthy());
    expect(screen.getByText("Подтверждение одноразовое")).toBeTruthy();
    // Два одинаковых обещания в списке — значит ищем все, а не первое.
    expect(screen.getAllByText(/одно подтверждение — одно действие/)).toHaveLength(2);
    expect(screen.getAllByText("✓")).toHaveLength(2);
  });

  it("провал остаётся в списке с причиной, а не прячется", async () => {
    vi.mocked(selfCheck).mockResolvedValue([
      verdict(),
      verdict({
        name: "«Стоп» останавливает",
        passed: false,
        detail: "отмена не сработала за 8.2 с",
      }),
    ]);

    render(<SelfCheckCard />);
    fireEvent.click(screen.getByRole("button", { name: "Прогнать проверки" }));

    await waitFor(() =>
      expect(screen.getByText(/проверок прошло: 1 из 2/)).toBeTruthy(),
    );
    expect(screen.getByText("не подтвердилось")).toBeTruthy();
    expect(screen.getByText("отмена не сработала за 8.2 с")).toBeTruthy();
    expect(screen.getByText("✗")).toBeTruthy();
  });

  it("в браузере говорит, что проверять нечего", async () => {
    vi.mocked(selfCheck).mockResolvedValue([]);

    render(<SelfCheckCard />);
    fireEvent.click(screen.getByRole("button", { name: "Прогнать проверки" }));

    await waitFor(() =>
      expect(screen.getByText(/в браузере проверять нечего/)).toBeTruthy(),
    );
  });

  it("ошибку запуска называет, а не показывает пустой список", async () => {
    vi.mocked(selfCheck).mockRejectedValue(new Error("ядро не ответило"));

    render(<SelfCheckCard />);
    fireEvent.click(screen.getByRole("button", { name: "Прогнать проверки" }));

    await waitFor(() =>
      expect(screen.getByText(/проверки не запустились: ядро не ответило/)).toBeTruthy(),
    );
  });

  it("при отказе называет, что можно сделать, и кнопку с глаголом", async () => {
    // Шаг 341. Раньше вердикт был, а действия не было — «✗ память» и всё.
    vi.mocked(selfCheck).mockResolvedValue([
      verdict({ name: "память", passed: false, detail: "база повреждена" }),
    ]);
    render(<SelfCheckCard />);
    fireEvent.click(screen.getByRole("button", { name: /Прогнать проверки/ }));

    await screen.findByText(/база повреждена/);
    expect(screen.getByText(/Что можно сделать/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Пересоздать базу памяти" })).toBeTruthy();
  });

  it("у того, что кнопкой не чинится, кнопки нет — но причина сказана", async () => {
    // Кнопка без действия хуже её отсутствия.
    vi.mocked(selfCheck).mockResolvedValue([verdict({ name: "версия", passed: false })]);
    render(<SelfCheckCard />);
    fireEvent.click(screen.getByRole("button", { name: /Прогнать проверки/ }));

    await screen.findByText(/Версия не чинится/);
    // Единственная кнопка на карточке — «Прогнать проверки».
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("ремонт называет, что именно изменилось", async () => {
    // «ok» после ремонта — это не ответ: человеку нужно знать, что стало
    // иначе. Здесь — путь копии базы.
    vi.mocked(selfCheck).mockResolvedValue([verdict({ name: "память", passed: false })]);
    vi.mocked(repair).mockResolvedValue("C:/Data/backups/memory-2026.db");
    render(<SelfCheckCard />);
    fireEvent.click(screen.getByRole("button", { name: /Прогнать проверки/ }));

    const button = await screen.findByRole("button", { name: "Пересоздать базу памяти" });
    fireEvent.click(button);

    const done = await screen.findByText(/Готово: C:\/Data\/backups\/memory-2026\.db/);
    expect(done.textContent).toContain("Готово");
    expect(repair).toHaveBeenCalledWith("rewrite-memory");
  });

  it("пустой ответ ремонта не выдаётся за успех", async () => {
    // Браузерная сборка: ядра нет. «Готово:» с пустотой читалось бы как
    // «починилось неизвестно что».
    vi.mocked(selfCheck).mockResolvedValue([verdict({ name: "память", passed: false })]);
    vi.mocked(repair).mockResolvedValue("");
    render(<SelfCheckCard />);
    fireEvent.click(screen.getByRole("button", { name: /Прогнать проверки/ }));

    fireEvent.click(await screen.findByRole("button", { name: "Пересоздать базу памяти" }));
    expect(await screen.findByText(/в браузере чинить нечего/)).toBeTruthy();
  });

  it("ошибку ремонта объявляет, а не молчит", async () => {
    vi.mocked(selfCheck).mockResolvedValue([verdict({ name: "память", passed: false })]);
    vi.mocked(repair).mockRejectedValue(new Error("база занята"));
    render(<SelfCheckCard />);
    fireEvent.click(screen.getByRole("button", { name: /Прогнать проверки/ }));

    fireEvent.click(await screen.findByRole("button", { name: "Пересоздать базу памяти" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("база занята");
  });

  it("прошедшая проверка не предлагает ничего чинить", async () => {
    // Совет у зелёной галочки — шум: лечить то, что здорово.
    vi.mocked(selfCheck).mockResolvedValue([verdict({ passed: true })]);
    render(<SelfCheckCard />);
    fireEvent.click(screen.getByRole("button", { name: /Прогнать проверки/ }));

    await screen.findByText(/проверок прошло: 1 из 1/);
    expect(screen.queryByText(/Что можно сделать/)).toBeNull();
    await waitFor(() => expect(screen.getAllByRole("button")).toHaveLength(1));
  });

  it("у провала названо, чем это грозит, а у прошедшей проверки — нет", async () => {
    // Шаг 353. Человек решает, чинить сейчас или потом, — для этого нужна
    // цена отказа. У зелёной проверки «чем грозит» звучало бы как угроза на
    // ровном месте.
    vi.mocked(selfCheck).mockResolvedValue([
      verdict({ name: "память", passed: false, risk: "журнал останется на временной базе" }),
      verdict({ name: "версия", passed: true, risk: "версия не чинится" }),
    ]);
    render(<SelfCheckCard />);
    fireEvent.click(screen.getByRole("button", { name: /Прогнать проверки/ }));

    expect(await screen.findByText(/Если не пройдёт: журнал останется на временной базе/)).toBeTruthy();
    // У прошедшей — нет, хотя риск в данных есть.
    expect(screen.queryByText(/Если не пройдёт: версия не чинится/)).toBeNull();
  });
});
