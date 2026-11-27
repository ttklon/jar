// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { People } from "./People";

/**
 * «Люди» (шаги 401–406).
 *
 * Главный дефект, который здесь исключается: **чужое согласие считается моим**.
 * Пока память и разрешения одни на всех, «можно удалять файлы», сказанное одним
 * человеком, работает и для гостя.
 */

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);

type PersonRow = { id: string; name: string; guest: boolean; facts: number };
type Book = { current: string; people: PersonRow[] };

let book: Book = { current: "", people: [] };
const tauri = vi.fn(() => true);

vi.mock("../ipc", () => ({
  isTauri: () => tauri(),
  people: async () => book,
  personAdd: async (name: string, guest: boolean) => {
    const id = `p${book.people.length + 1}`;
    book = {
      current: book.current === "" ? id : book.current,
      people: [...book.people, { id, name, guest, facts: 0 }],
    };
    return book;
  },
  personSwitch: async (id: string) => {
    book = { ...book, current: id };
    return book;
  },
  personRemove: async (id: string) => {
    book = { ...book, people: book.people.filter((person) => person.id !== id) };
    return book;
  },
}));

beforeEach(() => {
  book = { current: "", people: [] };
  tauri.mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("экран «Люди»", () => {
  it("пустой список говорит, что первый человек создаётся молча", async () => {
    render(<People />);
    expect(await screen.findByText(/Пока никого: первый человек создаётся молча/)).toBeTruthy();
    // «Один человек — ничего не выбирает»: экран не спрашивает «кто вы».
    expect(screen.getByText(/второй профиль нужен, только если за компьютером бывает кто-то ещё/)).toBeTruthy();
  });

  it("человек заводится, и видно, сколько фактов в его памяти", async () => {
    render(<People />);
    await screen.findByText(/Пока никого/);

    fireEvent.change(screen.getByLabelText("имя человека"), { target: { value: "Аня" } });
    fireEvent.click(screen.getByRole("button", { name: "завести" }));

    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/заведён «Аня»: пока человек один/));
    // Память по человеку — числом, а не «своя».
    expect(screen.getByText(/фактов в его памяти: 0/)).toBeTruthy();
  });

  it("гость назван гостем и опасного не получает", async () => {
    book = {
      current: "p1",
      people: [
        { id: "p1", name: "Аня", guest: false, facts: 2 },
        { id: "p2", name: "Гость", guest: true, facts: 0 },
      ],
    };
    render(<People />);

    expect(await screen.findByText(/гость: только безопасные дела/)).toBeTruthy();
    // Отказ назван причиной до дела, а не после: «этого человека никто не
    // разрешал», и спросят у него, а не у хозяина машины.
    expect(screen.getByText(/этого человека никто не разрешал: спрошу у него/)).toBeTruthy();
  });

  it("переключение «это он» не начинает дело заново", async () => {
    book = {
      current: "p1",
      people: [
        { id: "p1", name: "Аня", guest: false, facts: 2 },
        { id: "p2", name: "Гость", guest: true, facts: 0 },
      ],
    };
    render(<People />);
    await screen.findByText(/Сейчас действует: Аня/);

    fireEvent.click(screen.getByRole("button", { name: "это Гость" }));

    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toMatch(
        /теперь дело идёт от имени «Гость»: права и память — его, шаги, которые уже выполнены, остаются выполненными/,
      ),
    );
  });

  it("перед опасным делом названо, кого спросят", async () => {
    book = {
      current: "p1",
      people: [
        { id: "p1", name: "Аня", guest: false, facts: 2 },
        { id: "p2", name: "Гость", guest: true, facts: 0 },
      ],
    };
    render(<People />);
    await screen.findByText(/Сейчас действует: Аня/);

    fireEvent.click(screen.getByText(/что лежит в профиле и чего в нём нет/));
    // Профиль живёт в файле: ни аккаунта, ни сети.
    expect(screen.getByText(/ни аккаунта, ни пароля, ни сети/)).toBeTruthy();
  });

  it("в браузере профилей нет — сказано, а не выдуман один", async () => {
    tauri.mockReturnValue(false);
    render(<People />);
    expect(await screen.findByText(/в браузере профилей нет/)).toBeTruthy();
  });

  it("опасное от гостя не пройдёт ни одним из четырёх путей", async () => {
    book = {
      current: "p1",
      people: [
        { id: "p1", name: "Аня", guest: false, facts: 2 },
        { id: "p2", name: "Гость", guest: true, facts: 0 },
      ],
    };
    render(<People />);
    await screen.findByText(/Сейчас действует: Аня/);

    fireEvent.click(screen.getByText(/что может гость и почему опасное не пройдёт/));

    // Прямая просьба, расписание, подтверждение, переключение — отказ на каждом.
    expect(screen.getByText(/гостю нельзя: это меняет файлы или действует от имени хозяина/)).toBeTruthy();
    expect(screen.getByText(/в деле есть шаг, который меняет файлы: для гостя оно не выполнится целиком/)).toBeTruthy();
    expect(screen.getByText(/«удалить загрузки» ждёт хозяина: гость может попросить, но подтвердить должен он сам/)).toBeTruthy();
    expect(screen.getByText(/подтверждение гостя не принимается — подтверждает хозяин и лично/)).toBeTruthy();
  });

  it("перенос: файл собирается и проверяется до записи", async () => {
    book = { current: "p1", people: [{ id: "p1", name: "Аня", guest: false, facts: 2 }] };
    render(<People />);
    await screen.findByText(/Сейчас действует: Аня/);

    fireEvent.click(screen.getByRole("button", { name: "собрать файл" }));
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toMatch(
        /профиль «Аня»; 0 фактов памяти; 0 разрешений; файл читается блокнотом/,
      ),
    );
    expect(screen.getByLabelText("файл профиля").textContent).toMatch(/профиль ZShelper/);
  });

  it("чужой файл не перезаписывает профиль молча", async () => {
    book = { current: "p1", people: [{ id: "p1", name: "Аня", guest: false, facts: 2 }] };
    render(<People />);
    await screen.findByText(/Сейчас действует: Аня/);

    fireEvent.change(screen.getByLabelText("вставить файл профиля"), {
      target: { value: "{ обрезанный" },
    });
    fireEvent.click(screen.getByRole("button", { name: "проверить файл" }));

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toMatch(/файл не читается как JSON/),
    );
    expect(screen.getByText(/Аня — сейчас/)).toBeTruthy();
  });

  it("что будет на новой машине — сказано до переноса", async () => {
    book = { current: "p1", people: [{ id: "p1", name: "Аня", guest: false, facts: 2 }] };
    render(<People />);
    await screen.findByText(/Сейчас действует: Аня/);

    fireEvent.click(screen.getByRole("button", { name: "что будет на новой машине" }));
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toMatch(/профиль «Аня» собран в один файл/),
    );
  });
})
