// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  draftHand,
  draftPlan,
  facts,
  modelPrompt,
  planFor,
  speechStatus,
  think,
  trialHand,
  transcribeLocal,
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
  think: vi.fn(),
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
