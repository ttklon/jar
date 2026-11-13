// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  draftHand,
  draftPlan,
  requestLearning,
  facts,
  modelPrompt,
  planFor,
  speechStatus,
  think,
  trialHand,
  transcribeLocal,
  uiDump,
  machineState,
  uiPress,
} from "../ipc";
import { startRecording } from "../lib/recorder";
import { Voice } from "./Voice";

/**
 * Когда рядом лежит свой движок, звук не должен уходить наружу: экран обязан пиcать
 * речь и отдавать её локальному распознаванию, а не системному.
 */

vi.mock("../ipc", () => ({
  isTauri: () => true,
  planFor: vi.fn().mockResolvedValue([]),
  draftPlan: vi.fn().mockResolvedValue(null),
  requestLearning: vi.fn().mockResolvedValue(null),
  facts: vi.fn().mockResolvedValue([]),
  think: vi.fn().mockResolvedValue(null),
  uiDump: vi.fn().mockRejectedValue(new Error("в браузере нет UI Automation")),
  uiPress: vi.fn().mockRejectedValue(new Error("в браузере окон нет")),
  machineState: vi.fn().mockResolvedValue({
    sample: null,
    budget: { parallel: 1, mode: "near", reason: "в браузере машину не измерить", may_start: true },
    available: false,
    note: "машина измеряется в приложении",
  }),
  draftHand: vi.fn(),
  trialHand: vi.fn(),
  speak: vi.fn(),
  modelPrompt: vi.fn().mockResolvedValue(
    "Ты выбираешь одно действие для помощника на Windows.\nЗадача человека:\nубавить громкость",
  ),
  rememberFact: vi.fn().mockResolvedValue(undefined),
  runPlan: vi.fn(),
  speechStatus: vi.fn(),
  foregroundWindow: vi.fn().mockResolvedValue({
    title: "Видео — браузер",
    process: "chrome.exe",
    pid: 4321,
  }),
  isolationStatus: vi.fn().mockResolvedValue({
    available: true,
    summary: "не больше 256 МБ памяти, 5 с процессорного времени, 8 процессов",
    note: "каждый пробный запуск идёт внутри job object",
  }),
  transcribeLocal: vi.fn(),
}));

vi.mock("../lib/recorder", async () => {
  const actual = await vi.importActual<typeof import("../lib/recorder")>("../lib/recorder");
  return { ...actual, startRecording: vi.fn() };
});

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverStub);

afterEach(() => {
  cleanup();
  // Моки сбрасываем целиком: «очередные» ответы не должны перетекать в следующий тест —
  // иначе проверяется не поведение экрана, а порядок тестов.
  vi.mocked(planFor).mockReset().mockResolvedValue([]);
  vi.mocked(draftPlan).mockReset().mockResolvedValue(null);
  vi.mocked(think).mockReset().mockResolvedValue(null as never);
  vi.mocked(uiDump).mockReset().mockRejectedValue(new Error("в браузере нет UI Automation"));
  vi.mocked(uiPress).mockReset().mockRejectedValue(new Error("в браузере окон нет"));
  vi.mocked(machineState).mockReset().mockResolvedValue({
    sample: null,
    budget: { parallel: 1, mode: "near", reason: "в браузере машину не измерить", may_start: true },
    available: false,
    note: "машина измеряется в приложении",
  });
  vi.mocked(requestLearning).mockReset().mockResolvedValue(null);
  vi.mocked(planFor).mockClear();
  vi.mocked(transcribeLocal).mockReset();
  vi.mocked(startRecording).mockReset();
});

const FOUND = {
  found: true,
  program: "C:\\jar\\sidecars\\whisper-server.exe",
  model: "C:\\jar\\models\\ggml-small.bin",
  search_dir: "C:\\jar\\sidecars",
  models_dir: "C:\\jar\\models",
};

describe("локальное распознавание на экране", () => {
  it("говорит заранее, что звук остаётся на компьютере", async () => {
    vi.mocked(speechStatus).mockResolvedValue(FOUND);

    render(<Voice />);

    await waitFor(() => {
      expect(screen.getByText(/локальное распознавание готово/)).toBeTruthy();
    });
    expect(screen.getByText(/звук не покидает компьютер/)).toBeTruthy();
  });

  it("показывает, где оно находится: заголовок и программа окна", async () => {
    render(<Voice onOpen={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText(/Сейчас перед вами: Видео — браузер — chrome\.exe/)).toBeTruthy();
    });
  });

  it("ставит первым то, что про программу перед человеком, и говорит об этом", async () => {
    vi.mocked(planFor).mockResolvedValueOnce([
      {
        key: "звук|поставить|пауза в музыке",
        example: "поставить на паузу музыку",
        risk: "read",
        decision: "allow",
        decision_reason: "",
        needs_token: false,
        tool: "звук|поставить|пауза в музыке",
        score: 9,
      },
      {
        key: "браузер|включить|субтитры",
        example: "включить субтитры в видео на сайте",
        risk: "read",
        decision: "allow",
        decision_reason: "",
        needs_token: false,
        tool: "браузер|включить|субтитры",
        score: 2,
      },
    ]);

    render(<Voice onOpen={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Сейчас перед вами/)).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Услышал"), {
      target: { value: "включи субтитры" },
    });
    fireEvent.click(screen.getByText("Найти"));

    // Порядок: браузерная строка выше музыкальной, хотя счёт у неё меньше.
    await waitFor(() => {
      const subtitles = screen.getByText("включить субтитры в видео на сайте");
      const music = screen.getByText("поставить на паузу музыку");
      expect(subtitles.compareDocumentPosition(music) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
    expect(screen.getByText(/подсказки про это: Видео — браузер — chrome\.exe/)).toBeTruthy();
  });

  it("не спрашивает второй раз то, что человек уже говорил", async () => {
    vi.mocked(facts).mockResolvedValueOnce([{ key: "вопрос:path", value: "D:\\Отчёты" }]);
    vi.mocked(draftPlan).mockResolvedValueOnce({
      plan: { goal: "собери отчёт", steps: [] },
      problems: [],
      gates: [],
      questions: [
        { position: 1, name: "path", label: "Куда сохранить", hint: "" },
        { position: 2, name: "mask", label: "Маска", hint: "" },
      ],
    });

    render(<Voice onOpen={() => {}} />);
    fireEvent.change(screen.getByLabelText("Услышал"), { target: { value: "собери отчёт" } });
    fireEvent.click(screen.getByText("Найти"));

    // Значение подставлено из памяти, и экран это говорит.
    await waitFor(() => {
      expect((screen.getByLabelText("Куда сохранить") as HTMLInputElement).value).toBe("D:\\Отчёты");
    });
    expect(screen.getByText("из памяти — поправьте, если не так")).toBeTruthy();

    // Незабытый вопрос остался пустым: память не выдумывает маску.
    expect((screen.getByLabelText("Маска") as HTMLInputElement).value).toBe("");
  });

  it("поиск не нашёл — спрашивает модель сама, без кнопки", async () => {
    vi.mocked(planFor).mockResolvedValueOnce([]);
    vi.mocked(draftPlan).mockResolvedValueOnce(null);
    vi.mocked(think).mockResolvedValueOnce({
      prompt: "…",
      answer: "…",
      proposal: {
        Call: { registry: "звук|убавить|громкость", params: {}, why: "просил тише" },
      },
      plan: {
        plan: {
          goal: "потише",
          source: "model",
          steps: [{ registry: "звук|убавить|громкость", params: {}, why: "просил тише" }],
        },
        problems: [],
        gates: [],
        questions: [],
      },
      learning: null,
      problem: null,
    });

    render(<Voice onOpen={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Сейчас перед вами/)).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Услышал"), { target: { value: "сделай потише" } });
    fireEvent.click(screen.getByText("Найти"));

    // Модель спросили сама, с окном перед человеком: без него «это» не имеет адресата.
    await waitFor(() => expect(vi.mocked(think)).toHaveBeenCalled());
    expect(vi.mocked(think).mock.calls[0]?.[0]).toBe("сделай потише");
    // В браузере UI Automation нет, экран не читается — и это честно передаётся как null.
    expect(vi.mocked(think).mock.calls[0]?.[1]).toMatchObject({
      title: "Видео — браузер",
      process: "chrome.exe",
      screen: null,
    });

    await waitFor(() =>
      expect(screen.getAllByText(/звук\|убавить\|громкость/).length).toBeGreaterThan(0),
    );
  });

  it("модель получает элементы окна, а не только заголовок", async () => {
    vi.mocked(uiDump).mockResolvedValueOnce({
      title: "Вход",
      process: "chrome.exe",
      elements: [],
      truncated: false,
      note: "чтение экрана: UI Automation, только чтение",
      text: "Вход (chrome.exe)\n  - кнопка «Войти» #submit [invoke]",
    });
    vi.mocked(planFor).mockResolvedValueOnce([]);
    vi.mocked(draftPlan).mockResolvedValueOnce(null);
    vi.mocked(think).mockResolvedValueOnce(null as never);

    render(<Voice onOpen={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Сейчас перед вами/)).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Услышал"), { target: { value: "нажми эту кнопку" } });
    fireEvent.click(screen.getByText("Найти"));

    // У «этой кнопки» появляется адресат: имя, вид и то, нажимается ли она.
    await waitFor(() =>
      expect(vi.mocked(think).mock.calls[0]?.[1]).toMatchObject({
        screen: "Вход (chrome.exe)\n  - кнопка «Войти» #submit [invoke]",
      }),
    );

    // И человек видит ровно тот же текст, что ушёл модели, — без «доверьтесь нам».
    await waitFor(() =>
      expect(screen.getAllByText(/кнопка «Войти» #submit/).length).toBeGreaterThan(0),
    );
    expect(screen.getByText(/только чтение/)).toBeTruthy();
  });

  it("машина измеряется честно: цифры, решение и причина рядом", async () => {
    vi.mocked(machineState).mockResolvedValueOnce({
      sample: { cpu_percent: 14, ram_free_mb: 9_216, ram_total_mb: 16_384, idle_seconds: 900 },
      budget: {
        parallel: 3,
        mode: "away",
        reason: "человек отошёл (900 с тишины), процессор свободен — можно три дела сразу",
        may_start: true,
      },
      available: true,
      note: "машина измеряется честно: простой ввода, загрузка процессора, свободная память",
    });

    render(<Voice onOpen={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Сейчас перед вами/)).toBeTruthy());
    // Кнопки живут рядом с поиском: сначала фраза, потом «что с машиной».
    fireEvent.change(screen.getByLabelText("Услышал"), { target: { value: "что с машиной" } });
    fireEvent.click(screen.getByText("Найти"));
    fireEvent.click(screen.getByText("Что с машиной"));

    await waitFor(() => expect(screen.getByText("Машина")).toBeTruthy());
    // Число без причины — это приказ; причина обязана быть на экране.
    expect(screen.getByText(/3 дела сразу/)).toBeTruthy();
    expect(screen.getByText(/процессор 14%, память 9 из 16 ГБ свободна/)).toBeTruthy();
    expect(screen.getByText(/простой ввода/)).toBeTruthy();
  });

  it("памяти на исходе — это «нет», а не «помедленнее»", async () => {
    vi.mocked(machineState).mockResolvedValueOnce({
      sample: { cpu_percent: 20, ram_free_mb: 300, ram_total_mb: 16_384, idle_seconds: 20 },
      budget: {
        parallel: 0,
        mode: "crowded",
        reason: "свободной памяти 300 МБ — новое не начинаю, чтобы не подвесить машину",
        may_start: false,
      },
      available: true,
      note: "машина измеряется честно",
    });

    render(<Voice onOpen={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Сейчас перед вами/)).toBeTruthy());
    // Кнопки живут рядом с поиском: сначала фраза, потом «что с машиной».
    fireEvent.change(screen.getByLabelText("Услышал"), { target: { value: "что с машиной" } });
    fireEvent.click(screen.getByText("Найти"));
    fireEvent.click(screen.getByText("Что с машиной"));

    await waitFor(() => expect(screen.getByText(/новое не начинаю: памяти на исходе/)).toBeTruthy());
    expect(screen.getByText(/новое не начинаю\. /)).toBeTruthy();
  });

  it("нажатие спрашивают до нажатия, а не после", async () => {
    vi.mocked(uiDump).mockResolvedValue({
      title: "Вход",
      process: "chrome.exe",
      elements: [
        { depth: 1, kind: "кнопка", name: "Войти", id: "submit", enabled: true, actions: ["invoke"] },
        { depth: 1, kind: "текст", name: "Забыли пароль?", id: "", enabled: true, actions: [] },
      ],
      truncated: false,
      note: "чтение экрана: UI Automation, только чтение",
      text: "Вход (chrome.exe)\n  - кнопка «Войти» #submit [invoke]",
    });
    vi.mocked(uiPress).mockResolvedValue({
      target: { name: "Войти", kind: "кнопка", id: "submit", actions: ["invoke"] },
      sent: true,
      changed: true,
      note: "нажато, и экран изменился — это проверено сравнением элементов окна",
    });

    render(<Voice onOpen={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Сейчас перед вами/)).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Услышал"), { target: { value: "нажми войти" } });
    fireEvent.click(screen.getByText("Что на экране"));

    await waitFor(() => expect(screen.getByText("Нажать «Войти»")).toBeTruthy());
    fireEvent.click(screen.getByText("Нажать «Войти»"));

    // Пока не сказано «да» — никакого нажатия: кнопка только спрашивает.
    expect(vi.mocked(uiPress)).not.toHaveBeenCalled();
    expect(screen.getByText(/Нажатие настоящее — как будто вы нажали сами/)).toBeTruthy();

    fireEvent.click(screen.getByText("Да, нажать"));

    await waitFor(() =>
      expect(vi.mocked(uiPress)).toHaveBeenCalledWith("Войти", true),
    );
    // Итог показывается честно: нажато и экран изменился — со ссылкой на проверку.
    await waitFor(() => expect(screen.getByText(/экран изменился/)).toBeTruthy());
  });

  it("нажали, а экран не изменился — так и говорим, а не «готово»", async () => {
    vi.mocked(uiDump).mockResolvedValue({
      title: "Вход",
      process: "chrome.exe",
      elements: [
        { depth: 1, kind: "кнопка", name: "Готово", id: "", enabled: true, actions: ["invoke"] },
      ],
      truncated: false,
      note: "чтение экрана: UI Automation, только чтение",
      text: "Вход (chrome.exe)\n  - кнопка «Готово» [invoke]",
    });
    vi.mocked(uiPress).mockResolvedValue({
      target: { name: "Готово", kind: "кнопка", id: "", actions: ["invoke"] },
      sent: true,
      changed: false,
      note: "нажато, но экран не изменился: возможно, программа думает медленнее, чем мы смотрим",
    });

    render(<Voice onOpen={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Сейчас перед вами/)).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Услышал"), { target: { value: "нажми готово" } });
    fireEvent.click(screen.getByText("Что на экране"));

    await waitFor(() => expect(screen.getByText("Нажать «Готово»")).toBeTruthy());
    fireEvent.click(screen.getByText("Нажать «Готово»"));
    fireEvent.click(screen.getByText("Да, нажать"));

    await waitFor(() => expect(screen.getByText(/экран не изменился/)).toBeTruthy());
  });

  it("окно не читается — об этом сказано, и поиск по словам всё равно работает", async () => {
    vi.mocked(uiDump).mockRejectedValueOnce(new Error("UI Automation не поднялся"));
    vi.mocked(planFor).mockResolvedValueOnce([]);
    vi.mocked(draftPlan).mockResolvedValueOnce(null);
    vi.mocked(think).mockResolvedValueOnce(null as never);

    render(<Voice onOpen={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Сейчас перед вами/)).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Услышал"), { target: { value: "нажми эту кнопку" } });
    fireEvent.click(screen.getByText("Найти"));

    await waitFor(() =>
      expect(screen.getByText(/экран не прочитан: UI Automation не поднялся/)).toBeTruthy(),
    );
    expect(vi.mocked(think).mock.calls[0]?.[1]).toMatchObject({ screen: null });
  });

  it("модель не ответила — фраза всё равно не пропадает: записываем в обучение", async () => {
    vi.mocked(planFor).mockResolvedValueOnce([]);
    vi.mocked(draftPlan).mockResolvedValueOnce(null);
    vi.mocked(think).mockRejectedValueOnce(new Error("движок не запущен"));
    vi.mocked(requestLearning).mockResolvedValueOnce({
      registry: "видео|включить|субтитры",
      example: "включить субтитры в видео",
      query: "включи субтитры",
      implementation: ["UI Automation"],
      risk: "read",
      notes: "",
      asked_ms: 1,
      times: 1,
      steps: [],
    });

    render(<Voice onOpen={() => {}} />);

    fireEvent.change(screen.getByLabelText("Услышал"), { target: { value: "включи субтитры" } });
    fireEvent.click(screen.getByText("Найти"));

    await waitFor(() => expect(screen.getByText("Чему нужно научиться")).toBeTruthy());
  });

  it("показывает по просьбе, что именно уйдёт модели", async () => {
    render(<Voice onOpen={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Сейчас перед вами/)).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Услышал"), { target: { value: "убавить громкость" } });
    fireEvent.click(screen.getByText("Что спросим у модели"));

    await waitFor(() => {
      expect(screen.getByText(/Задача человека:\s*убавить громкость/)).toBeTruthy();
    });

    // Окно перед человеком уходит в вопрос: без него «сделай это» не имеет адресата.
    await waitFor(() => {
      expect(vi.mocked(modelPrompt).mock.calls[0]?.[1]).toEqual({
        title: "Видео — браузер",
        process: "chrome.exe",
      });
    });
  });

  it("спрашивает модель и говорит, что она предложила, ничего не выполняя", async () => {
    vi.mocked(think).mockResolvedValueOnce({
      prompt: "…",
      answer: "…",
      proposal: { Learn: { goal: "поставить будильник", why: "такого умения нет" } },
      plan: null,
      learning: null,
      problem: null,
    });

    render(<Voice onOpen={() => {}} />);
    fireEvent.change(screen.getByLabelText("Услышал"), { target: { value: "разбуди меня в семь" } });
    fireEvent.click(screen.getByText("Спросить модель"));

    await waitFor(() => {
      expect(screen.getByText(/надо научиться — поставить будильник/)).toBeTruthy();
    });
    expect(screen.getByText(/предложение модели ничего не выполняет/)).toBeTruthy();
  });

  it("план модели становится обычным планом: с подтверждением, а не сразу делом", async () => {
    vi.mocked(think).mockResolvedValueOnce({
      prompt: "…",
      answer: "…",
      proposal: {
        Call: { registry: "storage-backup|проверить|свободное место", params: {}, why: "просил про диск" },
      },
      plan: {
        plan: {
          goal: "что с диском",
          source: "model",
          steps: [
            {
              registry: "storage-backup|проверить|свободное место",
              params: {},
              why: "просил про диск",
            },
          ],
        },
        problems: [],
        gates: [
          {
            position: 1,
            registry: "storage-backup|проверить|свободное место",
            risk: "read",
            decision: "confirm",
            wants_approval: true,
          },
        ],
        questions: [],
      },
      learning: null,
      problem: null,
    });

    render(<Voice onOpen={() => {}} />);
    fireEvent.change(screen.getByLabelText("Услышал"), { target: { value: "что с диском" } });
    fireEvent.click(screen.getByText("Спросить модель"));

    // Черновик плана на месте: модель не обходит ни политику, ни человека.
    await waitFor(() =>
      expect(screen.getAllByText(/storage-backup\|проверить\|свободное место/).length).toBeGreaterThan(0),
    );
    // И подтверждение на месте: план модели без «да» человека не выполняется.
    expect(screen.getByText("Что могу сделать")).toBeTruthy();
    expect(screen.getByText(/нужно ваше разрешение/)).toBeTruthy();
    expect(screen.getByLabelText("разрешить шаг 1")).toBeTruthy();
  });

  it("просьба модели об обучении остаётся карточкой, а не фразой в воздух", async () => {
    vi.mocked(think).mockResolvedValueOnce({
      prompt: "…",
      answer: "…",
      proposal: { Learn: { goal: "включи субтитры", why: "руки нет" } },
      plan: null,
      learning: {
        registry: "видео|включить|субтитры",
        example: "включить субтитры в видео",
        query: "включи субтитры",
        implementation: ["UI Automation"],
        risk: "read",
        notes: "",
        asked_ms: 1,
        times: 1,
        steps: [{ title: "написать руку", done: false }],
      },
      problem: null,
    });

    render(<Voice onOpen={() => {}} />);
    fireEvent.change(screen.getByLabelText("Услышал"), { target: { value: "включи субтитры" } });
    fireEvent.click(screen.getByText("Спросить модель"));

    await waitFor(() => expect(screen.getByText("Чему нужно научиться")).toBeTruthy());
    expect(screen.getAllByText(/включить субтитры в видео/).length).toBeGreaterThan(0);
    expect(screen.getByText(/записал в обучение/)).toBeTruthy();
  });

  it("показывает черновик руки и говорит, что он ничего не исполняет", async () => {
    vi.mocked(think).mockResolvedValueOnce({
      prompt: "…",
      answer: "…",
      proposal: { Learn: { goal: "показать диски", why: "" } },
      plan: null,
      learning: {
        registry: "storage-backup|проверить|свободное место",
        example: "проверить свободное место",
        query: "сколько места",
        implementation: ["PowerShell"],
        risk: "read",
        notes: "",
        asked_ms: 1,
        times: 1,
        steps: [],
      },
      problem: null,
    });
    vi.mocked(draftHand).mockResolvedValueOnce({
      key: "storage-backup|проверить|свободное место",
      goal: "показать свободное место",
      code: "Get-PSDrive -PSProvider FileSystem | Select-Object Name,Free",
      why: "так короче",
      created_ms: 1,
    });

    render(<Voice onOpen={() => {}} />);
    fireEvent.change(screen.getByLabelText("Услышал"), { target: { value: "сколько места" } });
    fireEvent.click(screen.getByText("Спросить модель"));
    await waitFor(() => expect(screen.getByText("Чему нужно научиться")).toBeTruthy());

    fireEvent.click(screen.getByText("Черновик руки"));

    await waitFor(() => expect(screen.getByText(/Get-PSDrive -PSProvider FileSystem/)).toBeTruthy());
    expect(screen.getByText(/Черновик ничего не исполняет/)).toBeTruthy();
  });

  it("проба показывает отчёт из клетки и не выдаёт его за умение", async () => {
    vi.mocked(think).mockResolvedValueOnce({
      prompt: "…",
      answer: "…",
      proposal: { Learn: { goal: "показать диски", why: "" } },
      plan: null,
      learning: {
        registry: "storage-backup|проверить|свободное место",
        example: "проверить свободное место",
        query: "сколько места",
        implementation: ["PowerShell"],
        risk: "read",
        notes: "",
        asked_ms: 1,
        times: 1,
        steps: [],
      },
      problem: null,
    });
    vi.mocked(draftHand).mockResolvedValueOnce({
      key: "storage-backup|проверить|свободное место",
      goal: "показать свободное место",
      code: "Get-PSDrive",
      why: "",
      created_ms: 1,
    });
    vi.mocked(trialHand).mockResolvedValueOnce({
      key: "storage-backup|проверить|свободное место",
      ran: true,
      ok: true,
      exit_code: 0,
      stdout: "Name Free\nC 42",
      stderr: "",
      timed_out: false,
      cell: "клетка: AppContainer, без сети",
      duration_ms: 120,
      note: "проба прошла: код 0",
      created_ms: 2,
    });

    render(<Voice onOpen={() => {}} />);
    fireEvent.change(screen.getByLabelText("Услышал"), { target: { value: "сколько места" } });
    fireEvent.click(screen.getByText("Спросить модель"));
    await waitFor(() => expect(screen.getByText("Чему нужно научиться")).toBeTruthy());

    fireEvent.click(screen.getByText("Черновик руки"));
    await waitFor(() => expect(screen.getByText(/Get-PSDrive/)).toBeTruthy());

    fireEvent.click(screen.getByText("Проверить в клетке"));

    await waitFor(() => expect(screen.getByText("проба прошла: код 0")).toBeTruthy());
    expect(screen.getByText(/AppContainer, без сети/)).toBeTruthy();
    expect(screen.getByText(/проба — это отчёт, а не умение/)).toBeTruthy();
  });

  it("если клетка не открылась — проба не состоялась, и это сказано", async () => {
    vi.mocked(think).mockResolvedValueOnce({
      prompt: "…",
      answer: "…",
      proposal: { Learn: { goal: "показать диски", why: "" } },
      plan: null,
      learning: {
        registry: "storage-backup|проверить|свободное место",
        example: "проверить свободное место",
        query: "сколько места",
        implementation: [],
        risk: "read",
        notes: "",
        asked_ms: 1,
        times: 1,
        steps: [],
      },
      problem: null,
    });
    vi.mocked(draftHand).mockResolvedValueOnce({
      key: "storage-backup|проверить|свободное место",
      goal: "показать свободное место",
      code: "Get-PSDrive",
      why: "",
      created_ms: 1,
    });
    vi.mocked(trialHand).mockResolvedValueOnce({
      key: "storage-backup|проверить|свободное место",
      ran: false,
      ok: false,
      exit_code: null,
      stdout: "",
      stderr: "",
      timed_out: false,
      cell: "клетка не открылась: ERROR_BAD_ENVIRONMENT; чужой текст без забора не запускается — проба не выполнялась",
      duration_ms: 0,
      note: "проба не выполнялась: нужна клетка",
      created_ms: 2,
    });

    render(<Voice onOpen={() => {}} />);
    fireEvent.change(screen.getByLabelText("Услышал"), { target: { value: "сколько места" } });
    fireEvent.click(screen.getByText("Спросить модель"));
    await waitFor(() => expect(screen.getByText("Чему нужно научиться")).toBeTruthy());

    fireEvent.click(screen.getByText("Черновик руки"));
    await waitFor(() => expect(screen.getByText(/Get-PSDrive/)).toBeTruthy());

    fireEvent.click(screen.getByText("Проверить в клетке"));

    await waitFor(() => expect(screen.getByText(/проба не состоялась/)).toBeTruthy());
    expect(screen.getByText(/ERROR_BAD_ENVIRONMENT/)).toBeTruthy();
  });

  it("не принятый черновик объясняет, что в нём не так", async () => {
    vi.mocked(think).mockResolvedValueOnce({
      prompt: "…",
      answer: "…",
      proposal: { Learn: { goal: "скачать что-нибудь", why: "" } },
      plan: null,
      learning: {
        registry: "storage-backup|проверить|свободное место",
        example: "проверить свободное место",
        query: "сколько места",
        implementation: [],
        risk: "read",
        notes: "",
        asked_ms: 1,
        times: 1,
        steps: [],
      },
      problem: null,
    });
    vi.mocked(draftHand).mockRejectedValueOnce(
      new Error("в черновике есть то, чего нельзя: `downloadstring` — скачивание из сети"),
    );

    render(<Voice onOpen={() => {}} />);
    fireEvent.change(screen.getByLabelText("Услышал"), { target: { value: "сколько места" } });
    fireEvent.click(screen.getByText("Спросить модель"));
    await waitFor(() => expect(screen.getByText("Чему нужно научиться")).toBeTruthy());

    fireEvent.click(screen.getByText("Черновик руки"));

    await waitFor(() => expect(screen.getByText(/скачивание из сети/)).toBeTruthy());
  });

  it("неразобранный ответ модели показывает её слова, а не прячет их", async () => {
    vi.mocked(think).mockResolvedValueOnce({
      prompt: "…",
      answer: "{\"kind\":\"call\",\"registry\":\"выдуманная|рука\"}",
      proposal: null,
      plan: null,
      learning: null,
      problem: "руки `выдуманная|рука` нет в реестре: выдуманное не выполняется",
    });

    render(<Voice onOpen={() => {}} />);
    fireEvent.change(screen.getByLabelText("Услышал"), { target: { value: "что-нибудь" } });
    fireEvent.click(screen.getByText("Спросить модель"));

    await waitFor(() => {
      expect(screen.getByText(/выдуманное не выполняется/)).toBeTruthy();
    });
    // Сырой ответ модели виден целиком: человек должен видеть, что она сказала на самом деле.
    expect(screen.getAllByText(/выдуманная\|рука/).length).toBeGreaterThan(0);
  });

  it("отмена во время записи выбрасывает сказанное и говорит об этом", async () => {
    vi.mocked(speechStatus).mockResolvedValue(FOUND);
    const wav = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 1]);
    vi.mocked(startRecording).mockResolvedValue({
      stop: vi.fn().mockResolvedValue({ wav, seconds: 1.2, sampleRate: 16_000 }),
    });
    vi.mocked(transcribeLocal).mockResolvedValue("не то");

    render(<Voice />);
    await waitFor(() => expect(screen.getByText(/готово/)).toBeTruthy());

    const mic = screen.getByRole("button", { name: "Держать и говорить" });
    fireEvent.pointerDown(mic);
    await waitFor(() => expect(vi.mocked(startRecording)).toHaveBeenCalled());

    fireEvent.click(screen.getByText("Отмена"));

    await waitFor(() => expect(screen.getByText(/отменил — запись выброшена/)).toBeTruthy());
    expect(vi.mocked(transcribeLocal)).not.toHaveBeenCalled();
    // В поле задачи отменённое не попадает: человек именно этого и не хотел.
    expect((screen.getByLabelText("Услышал") as HTMLInputElement).value).toBe("");
  });

  it("держу и говорю — запись уходит своему движку", async () => {
    vi.mocked(speechStatus).mockResolvedValue(FOUND);
    const wav = new Uint8Array([0x52, 0x49, 0x46, 0x46, 9, 9]);
    vi.mocked(startRecording).mockResolvedValue({
      stop: vi.fn().mockResolvedValue({ wav, seconds: 1.5, sampleRate: 16_000 }),
    });
    vi.mocked(transcribeLocal).mockResolvedValue("почисти диск");

    render(<Voice />);
    await waitFor(() => expect(screen.getByText(/готово/)).toBeTruthy());

    const mic = screen.getByRole("button", { name: "Держать и говорить" });
    fireEvent.pointerDown(mic);
    await waitFor(() => expect(startRecording).toHaveBeenCalled());
    fireEvent.pointerUp(mic);

    await waitFor(() => {
      expect(transcribeLocal).toHaveBeenCalledWith(Array.from(wav));
    });
    await waitFor(() => {
      expect(planFor).toHaveBeenCalledWith("почисти диск", 8);
    });
    expect(
      (screen.getByLabelText("Услышал") as HTMLInputElement).value,
    ).toBe("почисти диск");
  });

  it("если движок промолчал — человек это слышит", async () => {
    vi.mocked(speechStatus).mockResolvedValue(FOUND);
    vi.mocked(startRecording).mockResolvedValue({
      stop: vi.fn().mockResolvedValue({
        wav: new Uint8Array([1]),
        seconds: 1,
        sampleRate: 16_000,
      }),
    });
    vi.mocked(transcribeLocal).mockRejectedValue(
      new Error("движок не открыл порт 8081 за 60 с"),
    );

    render(<Voice />);
    await waitFor(() => expect(screen.getByText(/готово/)).toBeTruthy());

    fireEvent.pointerDown(screen.getByRole("button", { name: "Держать и говорить" }));
    await waitFor(() => expect(startRecording).toHaveBeenCalled());
    fireEvent.pointerUp(screen.getByRole("button", { name: "Держать и говорить" }));

    await waitFor(() => {
      expect(screen.getByText(/не открыл порт 8081/)).toBeTruthy();
    });
  });
});
