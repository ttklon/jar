// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryFacts } from "./MemoryFacts";

/**
 * «Что я о вас помню» — проверяется глазами человека: все факты в одном списке,
 * у каждого ровно одна кнопка, забытое исчезает и объясняется словами.
 */

let stored: Record<string, string> = {};

/**
 * Заглушка удаляет **по точному ключу** — как ядро.
 *
 * Раньше она искала первую попавшуюся строку по префиксу до двоеточия. Из-за
 * этого она «удаляла» ключ, которого в базе нет, и тест был зелёным на дефекте:
 * экран строил id `folder:<значение>`, а в памяти лежало `вопрос:путь`. Нажатие
 * «забыть» показывало «удалено», а факт оставался. Заглушка обязана врать
 * меньше, чем проверяемый код, иначе она проверяет саму себя.
 */
const forgetFact = vi.fn(async (id: string) => {
  delete stored[id];
  return id;
});

const rememberFact = vi.fn(async (key: string, value: string) => {
  stored[key] = value;
});

vi.mock("../ipc", () => ({
  isTauri: () => true,
  facts: async () => Object.entries(stored).map(([key, value]) => ({ key, value })),
  forgetFact: (id: string) => forgetFact(id),
  rememberFact: (key: string, value: string) => rememberFact(key, value),
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
    // Ни «очистить всё», ни второго действия на строку. Кнопок «забыть» —
    // ровно по одной на факт; «показать файлом» — не действие над фактом, а
    // другой вид того же списка, поэтому в этот счёт не входит.
    expect(screen.queryByText(/очистить всё/i)).toBeNull();
    expect(screen.getAllByRole("button", { name: /^забыть: / })).toHaveLength(2);
  });

  it("забытое обещает не возвращаться и исчезает из списка", async () => {
    stored = { "voice:Алла": "Алла" };
    render(<MemoryFacts />);

    fireEvent.click(await screen.findByRole("button", { name: /забыть/ }));

    expect(await screen.findByText(/больше не будет предлагаться/)).toBeTruthy();
    expect(screen.getByText(/Вернуть нельзя/)).toBeTruthy();
    await waitFor(() => expect(screen.queryByText("голос Алла")).toBeNull());
  });

  it("ответ на вопрос плана показан словами человека, а не именем поля", async () => {
    // Настоящий дефект шага 41: ядро хранит `вопрос:путь` → `D:\\Отчёты`, а
    // экран показывал «папка путь» — значение бралось из ключа, а само
    // значение не показывалось вообще.
    stored = { "вопрос:путь": "D:\\Отчёты" };
    render(<MemoryFacts />);

    expect(await screen.findByText("путь: D:\\Отчёты")).toBeTruthy();
    expect(screen.queryByText(/папка путь/)).toBeNull();
  });

  it("«забыть» удаляет тот ключ, который лежит в памяти", async () => {
    // Главное: id факта — настоящий ключ базы. Иначе удаление промахивается.
    stored = { "вопрос:путь": "D:\\Отчёты", "voice:Алла": "Алла" };
    render(<MemoryFacts />);

    fireEvent.click(await screen.findByRole("button", { name: "забыть: путь: D:\\Отчёты" }));

    await waitFor(() => expect(forgetFact).toHaveBeenCalledWith("вопрос:путь"));
    // И второй факт не тронут: удаляется ровно то, что показано.
    await waitFor(() => expect(screen.queryByText("путь: D:\\Отчёты")).toBeNull());
    expect(screen.getByText("голос Алла")).toBeTruthy();
  });

  it("служебное названо служебным, а не привычкой", async () => {
    // Хеш модели — не «память обо мне». Показывать его как «папка qwen» значит
    // врать дважды: и про вид, и про то, что это вообще ваша привычка.
    stored = { "model.sha256:qwen": "abc123" };
    render(<MemoryFacts />);

    expect(await screen.findByText("модель «qwen» (отпечаток)")).toBeTruthy();
    expect(screen.getByText(/служебное/)).toBeTruthy();
    expect(screen.queryByText(/папка qwen/)).toBeNull();
  });

  it("память показывается файлом, который человек может поправить", async () => {
    stored = { "вопрос:путь": "D:\\Отчёты" };
    render(<MemoryFacts />);
    await screen.findByText(/1 факт/);

    fireEvent.click(screen.getByRole("button", { name: /показать файлом/ }));

    const file = (await screen.findByLabelText("файл памяти")) as HTMLTextAreaElement;
    // В файле — слово человека и происхождение, а не внутренний ключ.
    expect(file.value).toContain("D:\\Отчёты");
    expect(file.value).toContain("вы сказали");
    expect(file.value).toContain("Память приложения");
    expect(file.value).not.toContain("вопрос:путь");
  });

  it("правка файла принимается и называет результат", async () => {
    stored = { "voice:Алла": "Алла" };
    render(<MemoryFacts />);
    await screen.findByText(/1 факт/);
    fireEvent.click(screen.getByRole("button", { name: /показать файлом/ }));

    const file = (await screen.findByLabelText("файл памяти")) as HTMLTextAreaElement;
    fireEvent.change(file, { target: { value: "folder: D:\\Архив — вы сказали\n" } });
    fireEvent.click(screen.getByRole("button", { name: /принять правку/ }));

    // «Прочитано 1» — число, а не обещание «сохранено».
    expect(await screen.findByText(/прочитано 1/)).toBeTruthy();
    await waitFor(() => expect(rememberFact).toHaveBeenCalledWith("folder:D:\\Архив", "D:\\Архив"));
  });

  it("непонятная строка в файле называется, а не теряется", async () => {
    stored = {};
    render(<MemoryFacts />);
    await screen.findByText(/в памяти ничего нет/);
    fireEvent.click(screen.getByRole("button", { name: /показать файлом/ }));

    const file = (await screen.findByLabelText("файл памяти")) as HTMLTextAreaElement;
    fireEvent.change(file, { target: { value: "это я так, заметка\n" } });
    fireEvent.click(screen.getByRole("button", { name: /принять правку/ }));

    // «заметка» есть и в подсказке у поля, поэтому ищем строку отчёта целиком:
    // «пропущено 1: это я так, заметка».
    expect(await screen.findByText(/пропущено 1: это я так, заметка/)).toBeTruthy();
  });

  it("пустая память говорит об этом словами, а не пустым экраном", async () => {
    render(<MemoryFacts />);

    expect(await screen.findByText(/в памяти ничего нет/)).toBeTruthy();
    // Удалять нечего — кнопок «забыть» нет. «Показать файлом» остаётся: файл
    // можно посмотреть и дописать в него факт руками.
    expect(screen.queryAllByRole("button", { name: /^забыть: / })).toHaveLength(0);
    expect(screen.getByRole("button", { name: /показать файлом/ })).toBeTruthy();
  });
});
