// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Schedule } from "./Schedule";

/**
 * Экран «Расписание» (шаги 321 и 327).
 *
 * Проверяется глазами человека: фразу говорят словами, непонятная фраза не
 * превращается в правило, список приходит из ядра, пауза и отмена стоят на
 * строке и объясняются словами.
 */

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);

type Row = { id: string; what: string; cadence: string; minute: number; paused: boolean; policy: string; when: string };

type RuleRow = { id: string; kind: string; when: string; then: string; risky: boolean; on: boolean; fired: number };

let rows: Row[] = [];
let rules: RuleRow[] = [];
const tauri = vi.fn(() => true);

vi.mock("../ipc", () => ({
  isTauri: () => tauri(),
  // «Каждый день» ищет последнее выполненное дело — без дел кнопки нет, и это
  // правильное поведение, а не ошибка мока.
  memoryRuns: async () => [],
  schedules: async () => rows,
  scheduleAdd: async (what: string, cadence: string, minute: number) => {
    const when = cadence === "hourly" ? "каждый час в :00" : `каждый день в ${String(Math.floor(minute / 60)).padStart(2, "0")}:00`;
    rows = [...rows, { id: `${cadence}:${minute}:${what}`, what, cadence, minute, paused: false, policy: "ask", when }];
    return rows;
  },
  whenThenRules: async () => rules,
  whenThenAdd: async (kind: string, when: string, then: string, risky: boolean) => {
    rules = [...rules, { id: `${kind}:${when}:${then}`, kind, when, then, risky, on: true, fired: 0 }];
    return rules;
  },
  whenThenSetOn: async (id: string, on: boolean) => {
    rules = rules.map((rule) => (rule.id === id ? { ...rule, on } : rule));
    return rules;
  },
  whenThenRemove: async (id: string) => {
    rules = rules.filter((rule) => rule.id !== id);
    return rules;
  },
  schedulePolicy: async (id: string, policy: string) => {
    rows = rows.map((row) => (row.id === id ? { ...row, policy } : row));
    return rows;
  },
  schedulePause: async (id: string, paused: boolean) => {
    rows = rows.map((row) => (row.id === id ? { ...row, paused } : row));
    return rows;
  },
  scheduleRemove: async (id: string) => {
    rows = rows.filter((row) => row.id !== id);
    return rows;
  },
}));

beforeEach(() => {
  rows = [];
  rules = [];
  tauri.mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("экран расписания", () => {
  it("пустой список говорит об этом словами, а не пустым экраном", async () => {
    render(<Schedule />);
    expect(await screen.findByText(/расписаний нет: скажите «каждый день в 9/)).toBeTruthy();
  });

  it("фраза человека становится расписанием и подтверждается словами", async () => {
    render(<Schedule />);
    await screen.findByText(/расписаний нет/);

    fireEvent.change(screen.getByLabelText("расписание фразой"), {
      target: { value: "каждый день в 9 — отчёт о диске" },
    });
    fireEvent.click(screen.getByRole("button", { name: "добавить" }));

    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/добавлено: каждый день в 09:00 — отчёт о диске/));
    // Список показывает то же, что вернуло ядро (подпись строки — словами правила).
    expect(screen.getByText(/\[включено\]; последний раз ещё не запускалось/)).toBeTruthy();
    expect(screen.getByText(/всего 1, на паузе 0/)).toBeTruthy();
  });

  it("непонятная фраза — вопрос, а не правило, которое молча не сработает", async () => {
    render(<Schedule />);
    await screen.findByText(/расписаний нет/);

    fireEvent.change(screen.getByLabelText("расписание фразой"), { target: { value: "отчёт о диске" } });
    fireEvent.click(screen.getByRole("button", { name: "добавить" }));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/не понял, когда/));
    expect(rows).toHaveLength(0);
  });

  it("пауза и отмена стоят на строке и объясняются словами", async () => {
    rows = [{ id: "daily:540:отчёт", what: "отчёт о диске", cadence: "daily", minute: 540, paused: false, policy: "ask", when: "каждый день в 09:00" }];
    render(<Schedule />);
    await screen.findByText(/\[включено\]; последний раз ещё не запускалось/);

    fireEvent.click(screen.getByRole("button", { name: "пауза" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/на паузе: срабатывать не будет/));
    expect(screen.getByText(/на паузе 1/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "отменить: отчёт о диске" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/отменено: «отчёт о диске»/));
    expect(rows).toHaveLength(0);
  });

  it("в браузере не обещает расписание: список ведёт приложение", async () => {
    tauri.mockReturnValue(false);
    render(<Schedule />);
    expect(await screen.findByText(/в браузере расписаний нет/)).toBeTruthy();
  });

  it("пропуск при сне решается у дела, и выбор виден", async () => {
    rows = [
      { id: "daily:540:отчёт", what: "отчёт о диске", cadence: "daily", minute: 540, paused: false, policy: "ask", when: "каждый день в 09:00" },
    ];
    render(<Schedule />);
    await screen.findByText(/\[включено\]/);

    // По умолчанию — «спрошу»: первый пропуск даёт вопрос, а не догадку.
    const choice = screen.getByLabelText("если компьютер спал: отчёт о диске") as HTMLSelectElement;
    expect(choice.value).toBe("ask");

    fireEvent.change(choice, { target: { value: "catchUp" } });

    // Слова правила `catchUp`: сколько пропущено и что будет — «один раз»,
    // а не семь отчётов после отпуска.
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/пропущено 1, сделаю один раз/));
    expect(rows[0]!.policy).toBe("catchUp");
  });
});

describe("правила «когда …, тогда …»", () => {
  it("правило по событию добавляется и называется словами", async () => {
    render(<Schedule />);
    await screen.findByText(/правил нет: автоматизации появляются/);

    fireEvent.change(screen.getByLabelText("правило когда тогда"), {
      target: { value: "когда я открою Chrome, тогда включи музыку" },
    });
    fireEvent.click(screen.getByRole("button", { name: "добавить правило" }));

    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/правило: откроется chrome — включи музыку/));
    expect(screen.getByText(/включено — включи музыку/)).toBeTruthy();
  });

  it("опасное действие помечено и спросит, даже внутри правила", async () => {
    render(<Schedule />);
    await screen.findByText(/правил нет/);

    fireEvent.change(screen.getByLabelText("правило когда тогда"), {
      target: { value: "когда 18:00, тогда удали Temp" },
    });
    fireEvent.click(screen.getByRole("button", { name: "добавить правило" }));

    // Подпись есть и в подтверждении, и в строке правила — ищем строку списка.
    await waitFor(() => expect(screen.getByText(/включено — удали Temp \(спрошу перед выполнением\)/)).toBeTruthy());
    expect(rules[0]!.risky).toBe(true);
  });

  it("выключение не удаляет правило: оно остаётся отложенным", async () => {
    rules = [{ id: "app:откроется chrome:включи музыку", kind: "app", when: "откроется chrome", then: "включи музыку", risky: false, on: true, fired: 0 }];
    render(<Schedule />);
    await screen.findByText(/включено — включи музыку/);

    fireEvent.click(screen.getByRole("button", { name: "выключить" }));

    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/выключено: правило осталось/));
    expect(rules).toHaveLength(1);
    expect(rules[0]!.on).toBe(false);
  });

  it("непонятная фраза — вопрос, а не правило", async () => {
    render(<Schedule />);
    await screen.findByText(/правил нет/);

    fireEvent.change(screen.getByLabelText("правило когда тогда"), { target: { value: "включи музыку" } });
    fireEvent.click(screen.getByRole("button", { name: "добавить правило" }));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/скажите «когда …, тогда …»/));
    expect(rules).toHaveLength(0);
  });
});

describe("ночью мир не меняется", () => {
  it("ночное расписание предупреждается до сохранения и говорит, что будет при отказе", async () => {
    render(<Schedule />);
    await screen.findByText(/расписаний нет/);

    fireEvent.change(screen.getByLabelText("расписание фразой"), {
      target: { value: "каждый день в 3 — почисти загрузки" },
    });
    fireEvent.click(screen.getByRole("button", { name: "добавить" }));

    // Не «нельзя»: сказано, что ночью дела, меняющие мир, без подтверждения не
    // запускаются, — это предупреждение, а решение за человеком.
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toMatch(/вы, скорее всего, спите.*без подтверждения/),
    );
  });

  it("в строке ночного расписания видно, что оно подождёт до утра", async () => {
    rows = [
      { id: "daily:180:уборка", what: "почисти загрузки", cadence: "daily", minute: 180, paused: false, policy: "ask", when: "каждый день в 03:00" },
    ];
    render(<Schedule />);

    expect(await screen.findByText(/ночью мир не меняется: утром спросим/)).toBeTruthy();
  });

  it("что разрешено ночью — списком с причиной у каждого", async () => {
    rows = [
      { id: "daily:180:отчёт", what: "отчёт о диске", cadence: "daily", minute: 180, paused: false, policy: "ask", when: "каждый день в 03:00" },
    ];
    render(<Schedule />);
    await screen.findByText(/всего 1, на паузе 0/);

    fireEvent.click(screen.getByText(/что разрешено ночью/));

    // У каждого разрешения названа причина, а не просто «разрешено».
    expect(screen.getByText(/проверить место на диске — только читает/)).toBeTruthy();
  });
});

describe("какие «когда» проверяемы", () => {
  it("границы триггера видны в строке правила до срабатывания", async () => {
    rules = [
      { id: "time:в 18:00:почисти Temp", kind: "time", when: "в 18:00", then: "почисти Temp", risky: false, on: true, fired: 0 },
    ];
    render(<Schedule />);

    // «Если компьютер спал — спросим»: это не оправдание после, а обещание до.
    expect(await screen.findByText(/если компьютер спал в это время/)).toBeTruthy();
  });

  it("какие «когда» программа правда видит — списком с ценой у каждого", async () => {
    render(<Schedule />);
    await screen.findByText(/правил нет/);

    fireEvent.click(screen.getByText(/какие «когда» программа правда видит/));

    expect(screen.getByText(/когда в «Загрузках» появляется файл — файл может появиться недокачанным/)).toBeTruthy();
    expect(screen.getByText(/когда вы входите в систему — после входа уходит несколько секунд/)).toBeTruthy();
  });
});

describe("расписание переживает перезапуск и сон", () => {
  it("сказано, где живёт расписание: память процесса его теряла", async () => {
    rows = [
      { id: "daily:540:отчёт", what: "отчёт о диске", cadence: "daily", minute: 540, paused: false, policy: "ask", when: "каждый день в 09:00" },
    ];
    render(<Schedule />);

    // Не «сохраняется», а чем именно: файл переживает выключение компьютера.
    expect(await screen.findByText(/расписание в файле: переживёт перезапуск/)).toBeTruthy();
    // И что с пропущенным при сне — вопрос один, а не очередь.
    expect(screen.getByText(/пропущенное спросим один раз, а не очередью/)).toBeTruthy();
  });
});
