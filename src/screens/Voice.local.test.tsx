// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import actionsJson from "../../data/actions.json";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  cancelTool,
  declarePresence,
  draftHand,
  draftPlan,
  fillPlan,
  requestLearning,
  facts,
  modelPrompt,
  planFor,
  readinessStatus,
  speechStatus,
  smokeCheck,
  think,
  trialHand,
  runPlan,
  undoReport,
  transcribeLocal,
  uiDump,
  machineState,
  uiPress,
  uiType,
} from "../ipc";
import { startRecording } from "../lib/recorder";
import type { Line } from "../lib/phraseLog";
import { say as sayTiming, text as timingText } from "../lib/journalTiming";
import { audioCapture } from "../i18n/ru";
import { readinessFacts } from "./readinessFixture";
import { Voice } from "./Voice";

/**
 * Когда рядом лежит свой движок, звук не должен уходить наружу: экран обязан пиcать
 * речь и отдавать её локальному распознаванию, а не системному.
 */

vi.mock("../ipc", () => ({
  readinessStatus: vi.fn().mockRejectedValue(new Error("статус недоступен в этом тесте")),
  isTauri: () => true,
  planFor: vi.fn().mockResolvedValue([]),
  draftPlan: vi.fn().mockResolvedValue(null),
  fillPlan: vi.fn(),
  requestLearning: vi.fn().mockResolvedValue(null),
  facts: vi.fn().mockResolvedValue([]),
  think: vi.fn().mockResolvedValue(null),
  smokeCheck: vi.fn(),
  // Шаг 127: настоящие числа реестра, как из снапшота.
  // Шаг 161: снапшот — настоящий реестр, а не пустышка: список прав на экране
  // собирается из него, и заглушка «действий нет» проверяла бы выдумку.
  undoReport: vi.fn().mockResolvedValue({ session: "", steps: [], note: "журнала нет" }),
  undoApply: vi.fn().mockResolvedValue({ session: "", undone: 0, refused: [] }),
  registrySnapshot: vi.fn().mockResolvedValue({
    actions: actionsJson,
    stats: {
      actions: 835,
      domains: 12,
      verbs: 200,
      byRisk: {},
      byTier: {},
      byStatus: { v1: 626, v2: 198, later: 0, never: 11 },
    },
  }),
  listTools: vi.fn().mockResolvedValue(Array.from({ length: 56 }, () => ({}))),
  cancelTool: vi.fn().mockResolvedValue(undefined),
  uiDump: vi.fn().mockRejectedValue(new Error("в браузере нет UI Automation")),
  uiPress: vi.fn().mockRejectedValue(new Error("в браузере окон нет")),
  uiType: vi.fn().mockRejectedValue(new Error("в браузере окон нет")),
  declarePresence: vi.fn(),
  machineState: vi.fn().mockResolvedValue({
    sample: null,
    budget: { parallel: 1, mode: "near", reason: "в браузере машину не измерить", may_start: true },
    available: false,
    note: "машина измеряется в приложении",
    declared: null, weak: false,
  }),
  draftHand: vi.fn(),
  trialHand: vi.fn(),
  speak: vi.fn(),
  modelPrompt: vi.fn().mockResolvedValue(
    "Ты выбираешь одно действие для помощника на Windows.\nЗадача человека:\nубавить громкость",
  ),
  rememberFact: vi.fn().mockResolvedValue(undefined),
  runPlan: vi.fn(),
  // Шаг 141: экран спрашивает чекпойнт перед запуском; здесь прошлых
  // прерванных запусков нет.
  planCheckpoint: vi.fn().mockResolvedValue(null),
  speechStatus: vi.fn().mockResolvedValue(null),
  setVoiceTrayStatus: vi.fn().mockResolvedValue(undefined),
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

/**
 * Отметка «про микрофон уже объясняли» (шаг 24).
 *
 * Большинство тестов проверяют не первый разговор, а поведение экрана, и им
 * нужно, чтобы нажатие сразу включало микрофон. Ставить отметку — это не
 * обход: так выглядит возвращение человека, который объяснение уже видел.
 * Сам первый разговор проверяется отдельным тестом ниже, и он эту отметку
 * **не** ставит.
 */
function micExplainedBefore() {
  localStorage.setItem("zshelper.mic.explained", "1");
}

beforeEach(() => {
  micExplainedBefore();
});

afterEach(() => {
  cleanup();
  // Черновик переживает окно — и в тестах тоже, как в жизни. Значит, между
  // тестами его надо убирать явно: иначе «что набрал в прошлом тесте» всплывает
  // в следующем, и проверяется порядок тестов, а не поведение экрана.
  localStorage.clear();
  // Моки сбрасываем целиком: «очередные» ответы не должны перетекать в следующий тест —
  // иначе проверяется не поведение экрана, а порядок тестов.
  vi.mocked(planFor).mockReset().mockResolvedValue([]);
  vi.mocked(draftPlan).mockReset().mockResolvedValue(null);
  vi.mocked(fillPlan).mockReset();
  vi.mocked(think).mockReset().mockResolvedValue(null as never);
  vi.mocked(uiDump).mockReset().mockRejectedValue(new Error("в браузере нет UI Automation"));
  // Запуск плана тоже: иначе «не выполнялось» в одном тесте зависит от другого.
  vi.mocked(runPlan).mockReset();
  vi.mocked(uiPress).mockReset().mockRejectedValue(new Error("в браузере окон нет"));
  vi.mocked(uiType).mockReset().mockRejectedValue(new Error("в браузере окон нет"));
  vi.mocked(machineState).mockReset().mockResolvedValue({
    sample: null,
    budget: { parallel: 1, mode: "near", reason: "в браузере машину не измерить", may_start: true },
    available: false,
    note: "машина измеряется в приложении",
    declared: null, weak: false,
  });
  vi.mocked(requestLearning).mockReset().mockResolvedValue(null);
  vi.mocked(declarePresence).mockReset();
  vi.mocked(planFor).mockClear();
  vi.mocked(transcribeLocal).mockReset();
  vi.mocked(modelPrompt).mockReset().mockResolvedValue("Ты выбираешь одно действие для помощника на Windows.\nЗадача человека:\nубавить громкость");
  vi.mocked(startRecording).mockReset();
  vi.mocked(speechStatus).mockReset().mockResolvedValue(null as never);
  vi.mocked(smokeCheck).mockReset();
  vi.mocked(cancelTool).mockReset().mockResolvedValue(undefined);
  vi.mocked(readinessStatus).mockReset().mockRejectedValue(new Error("статус недоступен в этом тесте"));
});

const FOUND = {
  found: true,
  program: "C:\\jar\\sidecars\\whisper-server.exe",
  model: "C:\\jar\\models\\ggml-small.bin",
  search_dir: "C:\\jar\\sidecars",
  models_dir: "C:\\jar\\models",
};

describe("локальное распознавание на экране", () => {
  it("поздний результат старого поиска не запускает старый черновик плана", async () => {
    let resolveOld!: (value: never[]) => void;
    let resolveNew!: (value: never[]) => void;
    vi.mocked(planFor)
      .mockReturnValueOnce(new Promise<never[]>((resolve) => { resolveOld = resolve; }))
      .mockReturnValueOnce(new Promise<never[]>((resolve) => { resolveNew = resolve; }));
    vi.mocked(draftPlan).mockResolvedValue(null);

    render(<Voice />);
    const field = screen.getByLabelText("Услышал");
    const form = field.closest("form");
    if (!form) throw new Error("форма голосового поиска не найдена");

    fireEvent.change(field, { target: { value: "старый запрос" } });
    fireEvent.submit(form);
    fireEvent.change(field, { target: { value: "новый запрос" } });
    fireEvent.submit(form);

    resolveNew([]);
    await waitFor(() => expect(draftPlan).toHaveBeenCalledWith("новый запрос"));
    resolveOld([]);
    await waitFor(() => expect(planFor).toHaveBeenCalledTimes(2));
    expect(draftPlan).toHaveBeenCalledTimes(1);
  });

  it("говорит заранее, что звук остаётся на компьютере", async () => {
    vi.mocked(speechStatus).mockResolvedValue(FOUND);

    render(<Voice />);

    await waitFor(() => {
      expect(screen.getByText(/локальное распознавание работает здесь/)).toBeTruthy();
    });
    expect(screen.getByText(/звук не покидает компьютер/)).toBeTruthy();
    expect(screen.getByText(/Распознавание идёт локальным whisper/)).toBeTruthy();
    expect(screen.queryByText(/звук покидает компьютер/)).toBeNull();
  });

  it("после установки на карточке подхватывает движок без перезапуска экрана", async () => {
    const missing = {
      found: false,
      program: null,
      model: null,
      search_dir: "C:\\jar\\sidecars",
      models_dir: "C:\\jar\\models",
    };
    vi.mocked(speechStatus).mockResolvedValueOnce(missing).mockResolvedValue(FOUND);

    const view = render(<Voice active={false} />);
    await waitFor(() => {
      expect(screen.getByText(/локального распознавания нет/)).toBeTruthy();
    });
    expect(screen.getAllByText(/кнопкой в карточке выше/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/локальное распознавание работает здесь/)).toBeNull();

    view.rerender(<Voice active />);
    await waitFor(() => {
      expect(screen.getByText(/локальное распознавание работает здесь/)).toBeTruthy();
    });
    expect(screen.queryByText(/локального распознавания нет/)).toBeNull();
    expect(screen.getByText(/Распознавание идёт локальным whisper/)).toBeTruthy();
    expect(screen.queryByText(/Разрешаю системное распознавание речи/)).toBeNull();
    expect(screen.queryByText(/работает со своим движком распознавания/)).toBeNull();
    expect(screen.queryByText(/кнопкой в карточке выше/)).toBeNull();
  });

  it("движок не запущен — это не «не умею», а одна кнопка на этом экране", async () => {
    vi.mocked(draftPlan).mockResolvedValue(null);
    vi.mocked(think).mockRejectedValueOnce(new Error("движок не запущен: нажмите кнопку"));
    vi.mocked(smokeCheck).mockResolvedValue({
      ok: true,
      answer: "готово",
      note: "текст",
      model: "m.gguf",
      port: 1,
    });

    render(<Voice />);
    fireEvent.change(screen.getByLabelText("Услышал"), { target: { value: "сделай потише" } });
    fireEvent.click(screen.getByRole("button", { name: "Найти" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Запустить движок и разобрать эту фразу" })).toBeTruthy();
    });
    expect(screen.getByText(/Это не «не умею»/)).toBeTruthy();
    expect(screen.queryByText(/модель не ответила/)).toBeNull();
    expect(vi.mocked(requestLearning)).not.toHaveBeenCalled();
    expect(vi.mocked(smokeCheck)).not.toHaveBeenCalled();

    vi.mocked(think).mockResolvedValue(null as never);
    fireEvent.click(screen.getByRole("button", { name: "Запустить движок и разобрать эту фразу" }));
    await waitFor(() => expect(vi.mocked(smokeCheck)).toHaveBeenCalledOnce());
    await waitFor(() => expect(vi.mocked(think)).toHaveBeenCalledTimes(2));
  });

  it("в первый раз объясняет, что услышит микрофон, до его включения (шаг 24)", async () => {
    // Это именно первый разговор: объяснения ещё не было.
    localStorage.removeItem("zshelper.mic.explained");
    vi.mocked(speechStatus).mockResolvedValue(FOUND);

    render(<Voice />);
    await waitFor(() => expect(screen.getByText(/локальное распознавание работает здесь/)).toBeTruthy());

    fireEvent.pointerDown(screen.getByRole("button", { name: "Держать и говорить" }));

    // Микрофон ещё НЕ включён: сначала объяснение, а не системный запрос вслепую.
    expect(vi.mocked(startRecording)).not.toHaveBeenCalled();

    expect(await screen.findByText("первый раз с микрофоном")).toBeTruthy();
    // Три вещи, которые важны человеку: что слушают, где и куда не уходит.
    expect(screen.getByText(/распознаётся здесь же, на этом компьютере/)).toBeTruthy();
    expect(screen.getByText(/Ничего не отправляется/)).toBeTruthy();
    expect(screen.getByText(/Windows спросит разрешение/)).toBeTruthy();
    // И путь без голоса назван здесь же.
    expect(screen.getByText(/напечатайте фразу/)).toBeTruthy();
  });

  it("после «понятно» микрофон включается и больше не спрашивает", async () => {
    localStorage.removeItem("zshelper.mic.explained");
    vi.mocked(speechStatus).mockResolvedValue(FOUND);
    vi.mocked(startRecording).mockResolvedValue({
      stop: vi.fn().mockResolvedValue({ wav: new Uint8Array([1]), seconds: 1, sampleRate: 16_000 }),
    });

    render(<Voice />);
    await waitFor(() => expect(screen.getByText(/локальное распознавание работает здесь/)).toBeTruthy());
    fireEvent.pointerDown(screen.getByRole("button", { name: "Держать и говорить" }));
    await screen.findByText("первый раз с микрофоном");

    fireEvent.click(screen.getByRole("button", { name: "Понятно, включить микрофон" }));

    // Объяснение убрано и запомнено: при следующем запуске его не будет (шаг 39).
    expect(screen.queryByText("первый раз с микрофоном")).toBeNull();
    expect(localStorage.getItem("zshelper.mic.explained")).toBe("1");
  });

  it("«пока без голоса» — законный выбор, и он тоже запоминается", async () => {
    localStorage.removeItem("zshelper.mic.explained");
    vi.mocked(speechStatus).mockResolvedValue(FOUND);

    render(<Voice />);
    await waitFor(() => expect(screen.getByText(/локальное распознавание работает здесь/)).toBeTruthy());
    fireEvent.pointerDown(screen.getByRole("button", { name: "Держать и говорить" }));
    await screen.findByText("первый раз с микрофоном");

    fireEvent.click(screen.getByRole("button", { name: "Пока без голоса" }));

    // Микрофон не включился, но и наказывать за отказ нечем: поле текста на месте.
    expect(vi.mocked(startRecording)).not.toHaveBeenCalled();
    expect(screen.queryByText("первый раз с микрофоном")).toBeNull();
    expect((screen.getByLabelText("Услышал") as HTMLInputElement).disabled).toBe(false);
    expect(localStorage.getItem("zshelper.mic.explained")).toBe("1");
  });

  it("прошлый запуск, прервавший дело, назван, и решает человек (шаг 159)", async () => {
    vi.mocked(speechStatus).mockResolvedValue(null as never);
    // Так выглядит очередь после падения: дело вернулось в ожидание с пометкой.
    localStorage.setItem(
      "zshelper.queue.v1",
      JSON.stringify([
        {
          id: "d-9",
          goal: "разбери загрузки",
          state: "running",
          tries: 0,
          resumeAt: 2,
        },
      ]),
    );

    render(<Voice />);

    // Человек узнаёт о прерванном деле сразу, а не по тишине.
    expect(await screen.findByText(/Прошлый запуск прервал одно дело/)).toBeTruthy();
    expect(screen.getByText(/продолжается с того шага/)).toBeTruthy();
    // И решает сам: оба выхода настоящие, ни один не происходит молча.
    expect(screen.getByRole("button", { name: "Продолжить" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Убрать из очереди" })).toBeTruthy();
  });

  it("без прерванных дел блок восстановления не появляется", async () => {
    vi.mocked(speechStatus).mockResolvedValue(null as never);
    render(<Voice />);

    // Пустой блок на месте очереди читался бы как «что-то было и потерялось».
    expect(screen.queryByText(/Прошлый запуск прервал/)).toBeNull();
  });

  it("первый разговор заканчивается результатом, а не туром по экранам (шаг 28)", async () => {
    // «Второй друг» начинается с первого дела: человек сказал — и получил
    // ответ здесь же. Ни один экран не должен подменять этот ответ собой.
    vi.mocked(speechStatus).mockResolvedValue(null as never);
    const onOpen = vi.fn();
    render(<Voice onOpen={onOpen} />);

    const field = screen.getByLabelText("Услышал") as HTMLInputElement;
    fireEvent.change(field, { target: { value: "что умею" } });
    const form = field.closest("form");
    if (!form) throw new Error("форма голосового поиска не найдена");
    fireEvent.submit(form);

    // Ответ пришёл на экране разговора, и это ответ реестра.
    await waitFor(() => expect(vi.mocked(planFor)).toHaveBeenCalled());
    // Перехода по экранам не случилось: тур по продукту — не результат.
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("без микрофона остаётся путь текстом, и он работает (шаг 36)", async () => {
    // Машина без гарнитуры: отказ настоящий, но это не приговор.
    vi.mocked(speechStatus).mockResolvedValue(FOUND);
    vi.mocked(startRecording).mockRejectedValue(
      new Error(audioCapture.missing),
    );

    render(<Voice />);
    await waitFor(() => expect(screen.getByText(/локальное распознавание работает здесь/)).toBeTruthy());
    fireEvent.pointerDown(screen.getByRole("button", { name: "Держать и говорить" }));
    fireEvent.pointerUp(screen.getByRole("button", { name: "Держать и говорить" }));

    // Отказ не только называет причину, но и говорит, что делать вместо голоса.
    const refusal = await screen.findByText(/микрофон не найден/);
    expect(refusal.textContent).toContain("напечатать");

    // И путь действительно работает: поле доступно и фраза уходит в дело.
    const field = screen.getByLabelText("Услышал") as HTMLInputElement;
    expect(field.disabled).toBe(false);
    fireEvent.change(field, { target: { value: "открой блокнот" } });
    const form = field.closest("form");
    if (!form) throw new Error("форма голосового поиска не найдена");
    fireEvent.submit(form);
    await waitFor(() => expect(vi.mocked(draftPlan)).toHaveBeenCalledWith("открой блокнот"));
  });

  it("ошибка микрофона гаснет при новой попытке и по кнопке «Понятно»", async () => {
    // Свой движок на диске: путь записи без системного согласия, ошибка — от микрофона.
    vi.mocked(speechStatus).mockResolvedValue(FOUND);
    vi.mocked(startRecording).mockRejectedValue(new Error("микрофон занят другой программой"));

    render(<Voice />);
    await waitFor(() => expect(screen.getByText(/локальное распознавание работает здесь/)).toBeTruthy());
    fireEvent.pointerDown(screen.getByRole("button", { name: "Держать и говорить" }));
    fireEvent.pointerUp(screen.getByRole("button", { name: "Держать и говорить" }));

    // Старая ошибка не приговор: она уходит, как только человек пробует снова.
    expect(await screen.findByText(/микрофон занят другой программой/)).toBeTruthy();
    fireEvent.pointerDown(screen.getByRole("button", { name: "Держать и говорить" }));
    await waitFor(() => expect(screen.queryByText(/микрофон занят другой программой/)).toBeNull());
  });

  it("«ещё» после запуска движка разбирает продолжение, а не голое слово", async () => {
    vi.mocked(draftPlan).mockResolvedValue(null);
    vi.mocked(readinessStatus).mockResolvedValue(
      readinessFacts({ engine_found: true, engine_running: false, model_present: true, missing: [] }),
    );
    // Первая задача уходит в модель — и модель просит запустить движок.
    vi.mocked(think).mockRejectedValueOnce(new Error("движок не запущен: файлы уже на диске"));
    vi.mocked(smokeCheck).mockResolvedValue({
      ok: true,
      answer: "готово",
      note: "текст",
      model: "m.gguf",
      port: 1,
    });

    render(<Voice />);
    fireEvent.change(screen.getByLabelText("Услышал"), { target: { value: "сделай потише" } });
    fireEvent.click(screen.getByRole("button", { name: "Найти" }));
    await waitFor(() => expect(vi.mocked(smokeCheck).mock.calls.length).toBeGreaterThan(0));

    // «Ещё» без прошлой фразы рядом не просит: продолжение несёт прошлую задачу.
    vi.mocked(think).mockClear();
    vi.mocked(think).mockRejectedValueOnce(new Error("движок не запущен: файлы уже на диске"));
    fireEvent.change(screen.getByLabelText("Услышал"), { target: { value: "ещё" } });
    fireEvent.click(screen.getByRole("button", { name: "Найти" }));

    await waitFor(() => expect(vi.mocked(think)).toHaveBeenCalled());
    const sent = String(vi.mocked(think).mock.calls[0]?.[0] ?? "");
    expect(sent).toContain("сделай потише");
    expect(sent).not.toBe("ещё");
  });

  it("установленный движок фраза запускает сама и не скачивает отсутствующее", async () => {
    vi.mocked(draftPlan).mockResolvedValue(null);
    vi.mocked(readinessStatus).mockResolvedValue(
      readinessFacts({ engine_found: true, engine_running: false, model_present: true, missing: [] }),
    );
    vi.mocked(think)
      .mockRejectedValueOnce(new Error("движок не запущен: файлы уже на диске"))
      .mockResolvedValueOnce(null as never);
    vi.mocked(smokeCheck).mockResolvedValue({
      ok: true,
      answer: "готово",
      note: "текст",
      model: "m.gguf",
      port: 1,
    });

    render(<Voice />);
    fireEvent.change(screen.getByLabelText("Услышал"), { target: { value: "сделай потише" } });
    fireEvent.click(screen.getByRole("button", { name: "Найти" }));

    await waitFor(() => expect(vi.mocked(think)).toHaveBeenCalledTimes(2));
    expect(vi.mocked(smokeCheck).mock.calls.length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Запустить движок и разобрать эту фразу" })).toBeNull();
  });

  it("нет файлов — фраза не запускает скачивание", async () => {
    vi.mocked(draftPlan).mockResolvedValue(null);
    vi.mocked(readinessStatus).mockResolvedValue(readinessFacts());
    vi.mocked(think).mockRejectedValueOnce(new Error("движок не запущен"));

    render(<Voice />);
    fireEvent.change(screen.getByLabelText("Услышал"), { target: { value: "сделай потише" } });
    fireEvent.click(screen.getByRole("button", { name: "Найти" }));

    await waitFor(() => expect(screen.getByText(/Само ничего не скачиваю/)).toBeTruthy());
    expect(vi.mocked(smokeCheck)).not.toHaveBeenCalled();
    expect(vi.mocked(requestLearning)).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Запустить движок и разобрать эту фразу" })).toBeNull();
    expect(vi.mocked(think)).toHaveBeenCalledTimes(1);
  });

  it("неуспешный запуск движка фразу повторно не отправляет", async () => {
    vi.mocked(draftPlan).mockResolvedValue(null);
    vi.mocked(readinessStatus).mockResolvedValue(
      readinessFacts({ engine_found: true, engine_running: false, model_present: true, missing: [] }),
    );
    vi.mocked(think).mockRejectedValue(new Error("движок не запущен"));
    vi.mocked(smokeCheck).mockResolvedValue({
      ok: false,
      answer: null,
      note: "порт занят",
      model: null,
      port: null,
    });

    render(<Voice />);
    fireEvent.change(screen.getByLabelText("Услышал"), { target: { value: "сделай потише" } });
    fireEvent.click(screen.getByRole("button", { name: "Найти" }));

    await waitFor(() => expect(screen.getByText(/Фразу повторно не отправляю/)).toBeTruthy());
    expect(vi.mocked(smokeCheck).mock.calls.length).toBeGreaterThan(0);
    expect(vi.mocked(think)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(requestLearning)).not.toHaveBeenCalled();
  });

  it("план модели с явным allow выполняется без второй кнопки", async () => {
    vi.mocked(draftPlan).mockResolvedValue(null);
    vi.mocked(think).mockResolvedValueOnce({
      prompt: "…",
      answer: "…",
      proposal: {
        Call: {
          registry: "storage-backup|проверить|свободное место",
          params: {},
          why: "человек спросил место",
        },
      },
      plan: {
        plan: {
          goal: "сколько места",
          steps: [{ registry: "storage-backup|проверить|свободное место", params: {} }],
        },
        problems: [],
        questions: [],
        gates: [
          {
            position: 1,
            registry: "storage-backup|проверить|свободное место",
            decision: "allow",
            risk: "read",
            wants_approval: false,
          },
        ],
      },
      learning: null,
      deeds: null,
      problem: null,
    });
    vi.mocked(runPlan).mockResolvedValue({
      goal: "сколько места",
      steps: [],
      stopped: null,
      run_id: 1,
      sight: null,
    });

    render(<Voice />);
    fireEvent.change(screen.getByLabelText("Услышал"), { target: { value: "сколько места" } });
    fireEvent.click(screen.getByRole("button", { name: "Найти" }));

    await waitFor(() => expect(vi.mocked(runPlan)).toHaveBeenCalledOnce());
    expect(screen.queryByText(/предложение модели ничего не выполняет/)).toBeNull();
  });

  it("план модели с подтверждением сам не выполняется", async () => {
    vi.mocked(draftPlan).mockResolvedValue(null);
    vi.mocked(think).mockResolvedValueOnce({
      prompt: "…",
      answer: "…",
      proposal: {
        Call: { registry: "files|удалить|файл", params: { path: "a.txt" }, why: "просил" },
      },
      plan: {
        plan: {
          goal: "удали a.txt",
          steps: [{ registry: "files|удалить|файл", params: { path: "a.txt" } }],
        },
        problems: [],
        questions: [],
        gates: [
          {
            position: 1,
            registry: "files|удалить|файл",
            decision: "confirm",
            risk: "destructive",
            wants_approval: true,
          },
        ],
      },
      learning: null,
      deeds: null,
      problem: null,
    });
    vi.mocked(runPlan).mockResolvedValue({
      goal: "удали a.txt",
      steps: [],
      stopped: null,
      run_id: 1,
      sight: null,
    });

    render(<Voice />);
    fireEvent.change(screen.getByLabelText("Услышал"), { target: { value: "удали a.txt" } });
    fireEvent.click(screen.getByRole("button", { name: "Найти" }));

    await waitFor(() => expect(screen.getByText(/предложение модели ничего не выполняет/)).toBeTruthy());
    expect(vi.mocked(runPlan)).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Услышал"), { target: { value: "да" } });
    fireEvent.click(screen.getByRole("button", { name: "Найти" }));
    await waitFor(() => expect(vi.mocked(runPlan)).toHaveBeenCalledOnce());
    expect(vi.mocked(runPlan).mock.calls[0]?.[1]).toEqual([1]);
  });

  it("«да, и ещё» — не разрешение, а новая фраза", async () => {
    vi.mocked(draftPlan).mockResolvedValue(null);
    vi.mocked(think).mockResolvedValueOnce({
      prompt: "…",
      answer: "…",
      proposal: {
        Call: { registry: "files|удалить|файл", params: { path: "a.txt" }, why: "просил" },
      },
      plan: {
        plan: {
          goal: "удали a.txt",
          steps: [{ registry: "files|удалить|файл", params: { path: "a.txt" } }],
        },
        problems: [],
        questions: [],
        gates: [
          {
            position: 1,
            registry: "files|удалить|файл",
            decision: "confirm",
            risk: "destructive",
            wants_approval: true,
          },
        ],
      },
      learning: null,
      deeds: null,
      problem: null,
    });

    render(<Voice />);
    fireEvent.change(screen.getByLabelText("Услышал"), { target: { value: "удали a.txt" } });
    fireEvent.click(screen.getByRole("button", { name: "Найти" }));
    await waitFor(() => expect(screen.getByText(/предложение модели ничего не выполняет/)).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Услышал"), { target: { value: "да, и удали ещё" } });
    fireEvent.click(screen.getByRole("button", { name: "Найти" }));
    await waitFor(() => expect(vi.mocked(draftPlan)).toHaveBeenCalledWith("да, и удали ещё"));
    expect(vi.mocked(runPlan)).not.toHaveBeenCalled();
  });

  it("«да» не закрывает вопрос и не стирает план", async () => {
    vi.mocked(draftPlan).mockResolvedValueOnce({
      plan: {
        goal: "удали файл",
        steps: [{ registry: "files|удалить|файл", params: {} }],
      },
      problems: [],
      questions: [{ position: 1, name: "path", label: "Путь", hint: "" }],
      gates: [
        {
          position: 1,
          registry: "files|удалить|файл",
          decision: "confirm",
          risk: "destructive",
          wants_approval: true,
        },
      ],
    });

    render(<Voice />);
    fireEvent.change(screen.getByLabelText("Услышал"), { target: { value: "удали файл" } });
    fireEvent.click(screen.getByRole("button", { name: "Найти" }));
    await screen.findByLabelText("Путь");

    fireEvent.change(screen.getByLabelText("Услышал"), { target: { value: "да" } });
    fireEvent.click(screen.getByRole("button", { name: "Ответить" }));

    expect(await screen.findByText(/Этого слова мало/)).toBeTruthy();
    expect(screen.getByLabelText("Путь")).toBeTruthy();
    expect(vi.mocked(runPlan)).not.toHaveBeenCalled();
  });

  it("«стоп» — не новая задача и не разрешение", async () => {
    vi.mocked(draftPlan).mockResolvedValue({
      plan: {
        goal: "удали a.txt",
        steps: [{ registry: "files|удалить|файл", params: { path: "a.txt" } }],
      },
      problems: [],
      questions: [],
      gates: [
        {
          position: 1,
          registry: "files|удалить|файл",
          decision: "confirm",
          risk: "destructive",
          wants_approval: true,
        },
      ],
    });

    render(<Voice />);
    fireEvent.change(screen.getByLabelText("Услышал"), { target: { value: "удали a.txt" } });
    fireEvent.click(screen.getByRole("button", { name: "Найти" }));
    await screen.findByRole("button", { name: "Выполнить" });

    fireEvent.change(screen.getByLabelText("Услышал"), { target: { value: "Стоп." } });
    fireEvent.click(screen.getByRole("button", { name: "Найти" }));

    expect(await screen.findByText(/Новое не начну/)).toBeTruthy();
    expect(vi.mocked(cancelTool)).toHaveBeenCalled();
    expect(vi.mocked(runPlan)).not.toHaveBeenCalled();
    expect(vi.mocked(requestLearning)).not.toHaveBeenCalled();
  });

  it("фраза в поле «Услышал» отвечает на вопрос и не становится новым поиском", async () => {
    const initial = {
      plan: {
        goal: "удали выбранный файл",
        steps: [{ registry: "files|удалить|файл", params: {} }],
      },
      problems: [],
      questions: [{ position: 1, name: "path", label: "Путь", hint: "" }],
      gates: [
        {
          position: 1,
          registry: "files|удалить|файл",
          decision: "confirm" as const,
          risk: "destructive",
          wants_approval: true,
        },
      ],
    };
    vi.mocked(draftPlan).mockResolvedValueOnce(initial);
    vi.mocked(fillPlan).mockResolvedValueOnce({
      ...initial,
      questions: [],
      plan: {
        ...initial.plan,
        steps: [{ registry: "files|удалить|файл", params: { path: "C:\\tmp\\a.txt" } }],
      },
    });

    render(<Voice />);
    fireEvent.change(screen.getByLabelText("Услышал"), { target: { value: "удали файл" } });
    fireEvent.click(screen.getByRole("button", { name: "Найти" }));
    await screen.findByRole("button", { name: "Ответить" });

    vi.mocked(draftPlan).mockClear();
    fireEvent.change(screen.getByLabelText("Услышал"), { target: { value: "C:\\tmp\\a.txt" } });
    fireEvent.click(screen.getByRole("button", { name: "Ответить" }));

    await waitFor(() => expect(vi.mocked(fillPlan)).toHaveBeenCalledTimes(1));
    expect(vi.mocked(fillPlan).mock.calls[0]?.[1]).toEqual([
      { position: 1, name: "path", value: "C:\\tmp\\a.txt" },
    ]);
    expect(vi.mocked(draftPlan)).not.toHaveBeenCalled();
    expect(vi.mocked(runPlan)).not.toHaveBeenCalled();
    expect(await screen.findByText(/Параметры обновились/)).toBeTruthy();

    vi.mocked(runPlan).mockResolvedValue({
      goal: "удали выбранный файл",
      steps: [],
      stopped: null,
      run_id: 1,
      sight: null,
    });
    fireEvent.change(screen.getByLabelText("Услышал"), { target: { value: "да" } });
    fireEvent.click(screen.getByRole("button", { name: "Найти" }));
    await waitFor(() => expect(vi.mocked(runPlan)).toHaveBeenCalledOnce());
    expect(vi.mocked(runPlan).mock.calls[0]?.[1]).toEqual([1]);
  });

  it("все поля заполнены — новая фраза становится новым поиском, а не запуском", async () => {
    const initial = {
      plan: {
        goal: "создай папку",
        steps: [{ registry: "files|создать|папку", params: {} }],
      },
      problems: [],
      questions: [
        { position: 1, name: "path", label: "Путь", hint: "" },
        { position: 1, name: "name", label: "Имя", hint: "" },
      ],
      gates: [],
    };
    vi.mocked(draftPlan).mockResolvedValueOnce(initial as never);
    vi.mocked(draftPlan).mockResolvedValue(null);

    render(<Voice />);
    fireEvent.change(screen.getByLabelText("Услышал"), { target: { value: "создай папку" } });
    fireEvent.click(screen.getByRole("button", { name: "Найти" }));

    fireEvent.change(await screen.findByLabelText("Путь"), { target: { value: "C:\\tmp\\a" } });
    fireEvent.change(screen.getByLabelText("Имя"), { target: { value: "отчёты" } });

    // Кнопка и подсказка говорят правду: ответить некуда, значит это снова «Найти».
    expect(screen.queryByRole("button", { name: "Ответить" })).toBeNull();
    vi.mocked(draftPlan).mockClear();
    fireEvent.change(screen.getByLabelText("Услышал"), { target: { value: "сколько места на диске" } });
    fireEvent.click(screen.getByRole("button", { name: "Найти" }));

    // Ответить некуда: все поля заполнены, значит это новая задача.
    await waitFor(() =>
      expect(vi.mocked(draftPlan)).toHaveBeenCalledWith("сколько места на диске"),
    );
    expect(vi.mocked(runPlan)).not.toHaveBeenCalled();
    expect(vi.mocked(fillPlan)).not.toHaveBeenCalled();
  });

  it("«повтори» при открытом вопросе не становится значением поля", async () => {
    vi.mocked(draftPlan).mockResolvedValueOnce({
      plan: {
        goal: "удали файл",
        steps: [{ registry: "files|удалить|файл", params: {} }],
      },
      problems: [],
      questions: [{ position: 1, name: "path", label: "Путь", hint: "" }],
      gates: [
        {
          position: 1,
          registry: "files|удалить|файл",
          decision: "confirm",
          risk: "destructive",
          wants_approval: true,
        },
      ],
    });
    vi.mocked(draftPlan).mockResolvedValue(null);

    render(<Voice />);
    fireEvent.change(screen.getByLabelText("Услышал"), { target: { value: "удали файл" } });
    fireEvent.click(screen.getByRole("button", { name: "Найти" }));
    const path = await screen.findByLabelText("Путь");

    fireEvent.change(screen.getByLabelText("Услышал"), { target: { value: "повтори" } });
    fireEvent.click(screen.getByRole("button", { name: "Ответить" }));

    // Продолжение прошлой фразы — это новый поиск, а не ответ на «Путь».
    await waitFor(() => expect(vi.mocked(draftPlan)).toHaveBeenCalled());
    expect((path as HTMLInputElement).value).toBe("");
    expect(vi.mocked(fillPlan)).not.toHaveBeenCalled();
  });

  it("безопасное чтение после ответа начинается само, запись — нет", async () => {
    vi.mocked(draftPlan).mockResolvedValueOnce({
      plan: {
        goal: "сколько места в папке",
        steps: [{ registry: "storage-backup|проверить|свободное место", params: {} }],
      },
      problems: [],
      questions: [{ position: 1, name: "path", label: "Путь", hint: "" }],
      gates: [
        {
          position: 1,
          registry: "storage-backup|проверить|свободное место",
          decision: "allow",
          risk: "read",
          wants_approval: false,
        },
      ],
    });
    vi.mocked(fillPlan).mockResolvedValueOnce({
      plan: {
        goal: "сколько места в папке",
        steps: [
          {
            registry: "storage-backup|проверить|свободное место",
            params: { path: "C:\\tmp" },
          },
        ],
      },
      problems: [],
      questions: [],
      gates: [
        {
          position: 1,
          registry: "storage-backup|проверить|свободное место",
          decision: "allow",
          risk: "read",
          wants_approval: false,
        },
      ],
    });
    vi.mocked(runPlan).mockResolvedValue({
      goal: "сколько места в папке",
      steps: [],
      stopped: null,
      run_id: 1,
      sight: null,
    });

    render(<Voice />);
    fireEvent.change(screen.getByLabelText("Услышал"), { target: { value: "сколько места" } });
    fireEvent.click(screen.getByRole("button", { name: "Найти" }));
    await screen.findByRole("button", { name: "Ответить" });
    fireEvent.change(screen.getByLabelText("Услышал"), { target: { value: "C:\\tmp" } });
    fireEvent.click(screen.getByRole("button", { name: "Ответить" }));

    await waitFor(() => expect(vi.mocked(runPlan)).toHaveBeenCalledOnce());
    expect(vi.mocked(fillPlan).mock.calls[0]?.[1]).toEqual([
      { position: 1, name: "path", value: "C:\\tmp" },
    ]);
  });

  it("«стоп» бросает открытый вопрос и не делает из него поиск", async () => {
    vi.mocked(draftPlan).mockResolvedValueOnce({
      plan: {
        goal: "удали файл",
        steps: [{ registry: "files|удалить|файл", params: {} }],
      },
      problems: [],
      questions: [{ position: 1, name: "path", label: "Путь", hint: "" }],
      gates: [
        {
          position: 1,
          registry: "files|удалить|файл",
          decision: "confirm",
          risk: "destructive",
          wants_approval: true,
        },
      ],
    });

    render(<Voice />);
    fireEvent.change(screen.getByLabelText("Услышал"), { target: { value: "удали файл" } });
    fireEvent.click(screen.getByRole("button", { name: "Найти" }));
    await screen.findByLabelText("Путь");

    vi.mocked(draftPlan).mockClear();
    fireEvent.change(screen.getByLabelText("Услышал"), { target: { value: "стоп" } });
    fireEvent.click(screen.getByRole("button", { name: "Ответить" }));

    expect(await screen.findByText(/Новое не начну/)).toBeTruthy();
    expect(screen.queryByLabelText("Путь")).toBeNull();
    expect(vi.mocked(draftPlan)).not.toHaveBeenCalled();
    expect(vi.mocked(fillPlan)).not.toHaveBeenCalled();
    expect(vi.mocked(runPlan)).not.toHaveBeenCalled();
  });

  it("«ещё» продолжает прошлую фразу и без неё ничего не выдумывает", async () => {
    vi.mocked(draftPlan).mockResolvedValue(null);

    render(<Voice />);
    fireEvent.change(screen.getByLabelText("Услышал"), { target: { value: "ещё" } });
    fireEvent.click(screen.getByRole("button", { name: "Найти" }));
    await waitFor(() => expect(vi.mocked(draftPlan)).toHaveBeenCalledWith("ещё"));

    vi.mocked(draftPlan).mockClear();
    fireEvent.change(screen.getByLabelText("Услышал"), { target: { value: "сколько места" } });
    fireEvent.click(screen.getByRole("button", { name: "Найти" }));
    await waitFor(() => expect(vi.mocked(draftPlan)).toHaveBeenCalledWith("сколько места"));

    vi.mocked(draftPlan).mockClear();
    fireEvent.change(screen.getByLabelText("Услышал"), { target: { value: "ещё" } });
    fireEvent.click(screen.getByRole("button", { name: "Найти" }));
    await waitFor(() => expect(vi.mocked(draftPlan)).toHaveBeenCalledWith("сколько места. ещё"));
    expect((screen.getByLabelText("Услышал") as HTMLInputElement).value).toBe("сколько места. ещё");
  });

  it("«повтори» снова отдаёт ту же фразу политике, а не слово «да»", async () => {
    vi.mocked(draftPlan).mockResolvedValue({
      plan: {
        goal: "удали a.txt",
        steps: [{ registry: "files|удалить|файл", params: { path: "a.txt" } }],
      },
      problems: [],
      questions: [],
      gates: [
        {
          position: 1,
          registry: "files|удалить|файл",
          decision: "confirm",
          risk: "destructive",
          wants_approval: true,
        },
      ],
    });

    render(<Voice />);
    fireEvent.change(screen.getByLabelText("Услышал"), { target: { value: "удали a.txt" } });
    fireEvent.click(screen.getByRole("button", { name: "Найти" }));
    await screen.findByRole("button", { name: "Выполнить" });

    vi.mocked(draftPlan).mockClear();
    vi.mocked(runPlan).mockClear();
    fireEvent.change(screen.getByLabelText("Услышал"), { target: { value: "повтори" } });
    fireEvent.click(screen.getByRole("button", { name: "Найти" }));
    await waitFor(() => expect(vi.mocked(draftPlan)).toHaveBeenCalledWith("удали a.txt"));
    expect(vi.mocked(runPlan)).not.toHaveBeenCalled();
  });

  it("установленный движок поднимается при открытии экрана и ничего не скачивает", async () => {
    vi.mocked(readinessStatus).mockResolvedValue(
      readinessFacts({ engine_found: true, engine_running: false, model_present: true, missing: [] }),
    );
    vi.mocked(smokeCheck).mockResolvedValue({
      ok: true,
      answer: "готово",
      note: "текст",
      model: "m.gguf",
      port: 1,
    });

    render(<Voice />);
    await waitFor(() => expect(vi.mocked(smokeCheck)).toHaveBeenCalled());
    expect(screen.queryByText(/Само ничего не скачиваю/)).toBeNull();
    expect(vi.mocked(think)).not.toHaveBeenCalled();
  });

  it("кнопка «Стоп» бросает уже начатый план и не принимает поздний успех", async () => {
    let resolveRun: (value: object) => void = () => {};
    vi.mocked(draftPlan).mockResolvedValue({
      plan: {
        goal: "сколько места",
        steps: [{ registry: "storage-backup|проверить|свободное место", params: {} }],
      },
      problems: [],
      questions: [],
      gates: [
        {
          position: 1,
          registry: "storage-backup|проверить|свободное место",
          decision: "allow",
          risk: "read",
          wants_approval: false,
        },
      ],
    });
    vi.mocked(runPlan).mockReturnValue(
      new Promise((resolve) => {
        resolveRun = resolve as (value: object) => void;
      }) as never,
    );

    render(<Voice />);
    fireEvent.change(screen.getByLabelText("Услышал"), { target: { value: "сколько места" } });
    fireEvent.click(screen.getByRole("button", { name: "Найти" }));

    const stop = await screen.findByRole("button", { name: "Стоп" });
    expect((stop as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(stop);
    expect(await screen.findByText(/Новое не начну/)).toBeTruthy();
    expect(vi.mocked(cancelTool)).toHaveBeenCalled();

    resolveRun({
      goal: "сколько места",
      steps: [],
      stopped: null,
      run_id: 1,
      sight: null,
    });
    await waitFor(() => expect(screen.queryByText(/сделал, шагов/)).toBeNull());
  });

  it("ручное «Выполнить» тоже не принимает поздний успех после «Стоп»", async () => {
    let resolveRun: (value: object) => void = () => {};
    vi.mocked(draftPlan).mockResolvedValue({
      plan: {
        goal: "удали a.txt",
        steps: [{ registry: "files|удалить|файл", params: { path: "a.txt" } }],
      },
      problems: [],
      questions: [],
      gates: [
        {
          position: 1,
          registry: "files|удалить|файл",
          decision: "confirm",
          risk: "destructive",
          wants_approval: true,
        },
      ],
    });
    vi.mocked(runPlan).mockReturnValue(
      new Promise((resolve) => {
        resolveRun = resolve as (value: object) => void;
      }) as never,
    );

    render(<Voice />);
    fireEvent.change(screen.getByLabelText("Услышал"), { target: { value: "удали a.txt" } });
    fireEvent.click(screen.getByRole("button", { name: "Найти" }));
    fireEvent.click(await screen.findByLabelText("разрешить шаг 1"));
    fireEvent.click(await screen.findByRole("button", { name: "Выполнить" }));
    await waitFor(() => expect(vi.mocked(runPlan)).toHaveBeenCalledOnce());

    fireEvent.click(screen.getByRole("button", { name: "Стоп" }));
    expect(await screen.findByText(/Новое не начну/)).toBeTruthy();

    resolveRun({
      goal: "удали a.txt",
      steps: [],
      stopped: null,
      run_id: 1,
      sight: null,
    });
    // Даём обещанию точно доехать: без сверки номера запроса поздний успех
    // подменил бы сказанное после стопа своей фразой.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(screen.queryByText(/проговорить не могу/)).toBeNull();
    expect(screen.queryByText(/сделал, шагов/)).toBeNull();
    expect(screen.getByText(/Новое не начну/)).toBeTruthy();
  });

  it("если движок есть, а модели нет, указывает кнопку карточки", async () => {
    vi.mocked(speechStatus).mockResolvedValue({ ...FOUND, model: null });

    render(<Voice />);

    await waitFor(() => {
      expect(screen.getByText(/движок распознавания есть, а модели нет/)).toBeTruthy();
    });
    expect(screen.getAllByText(/кнопкой в карточке выше/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/локальное распознавание работает здесь/)).toBeNull();
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
      deeds: null,
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
      declared: null, weak: false,
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

  it("слабая машина называет себя словами, а не только числом дел", async () => {
    // Шаг 389: «одно дело» — это ответ, а не причина. Без этой строки человек ищет
    // настройку, которой нет, и думает, что приложение просто ленится.
    vi.mocked(machineState).mockResolvedValueOnce({
      sample: { cpu_percent: 55, ram_free_mb: 900, ram_total_mb: 3_072, idle_seconds: 900 },
      budget: {
        parallel: 1,
        mode: "away",
        reason: "человек отошёл, но свободной памяти 900 МБ — беру одно дело",
        may_start: true,
      },
      available: true,
      note: "машина измеряется честно",
      declared: null,
      weak: true,
    });

    render(<Voice onOpen={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Сейчас перед вами/)).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Услышал"), { target: { value: "что с машиной" } });
    fireEvent.click(screen.getByText("Найти"));
    fireEvent.click(screen.getByText("Что с машиной"));

    await waitFor(() => expect(screen.getByText("Машина")).toBeTruthy());
    expect(screen.getByText(/машина слабая: памяти мало/)).toBeTruthy();
    // И причина от машины остаётся рядом: одна строка не заменяет другую.
    expect(screen.getByText(/беру одно дело/)).toBeTruthy();
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
      declared: null, weak: false,
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

  it("человек говорит прямо «я ухожу» — и слово сильнее таймера", async () => {
    vi.mocked(declarePresence).mockResolvedValue({
      sample: { cpu_percent: 12, ram_free_mb: 9_000, ram_total_mb: 16_384, idle_seconds: 4 },
      budget: {
        parallel: 3,
        mode: "away",
        reason:
          "вы сказали, что уходите, — верю слову, а не таймеру (ввод молчит 4 с): можно три дела сразу",
        may_start: true,
      },
      available: true,
      note: "машина измеряется честно",
      declared: "away", weak: false,
    });

    render(<Voice onOpen={() => {}} />);
    fireEvent.click(screen.getByText("Я ухожу"));

    await waitFor(() => expect(vi.mocked(declarePresence)).toHaveBeenCalledWith("away"));
    // Сказано человеком — и подписано его словами, а не «система решила».
    expect(screen.getByText(/считаю так, пока не скажете обратное/)).toBeTruthy();
    expect(screen.getByText(/3 дела сразу/)).toBeTruthy();
    // Щелчок ничего не запускает: очередь начинается своей кнопкой.
    expect(vi.mocked(runPlan)).not.toHaveBeenCalled();
  });

  it("«я работаю» тоже сильнее длинной тишины", async () => {
    vi.mocked(declarePresence).mockResolvedValue({
      sample: { cpu_percent: 8, ram_free_mb: 9_000, ram_total_mb: 16_384, idle_seconds: 9_000 },
      budget: {
        parallel: 1,
        mode: "near",
        reason:
          "вы сказали, что работаете, — одно дело в фоне, чужие окна не трогаю (хотя ввод молчит уже 9000 с)",
        may_start: true,
      },
      available: true,
      note: "машина измеряется честно",
      declared: "near", weak: false,
    });

    render(<Voice onOpen={() => {}} />);
    fireEvent.click(screen.getByText("Я работаю"));

    await waitFor(() => expect(vi.mocked(declarePresence)).toHaveBeenCalledWith("near"));
    expect(screen.getByText(/вы сказали, что работаете: одно дело в фоне/)).toBeTruthy();
    // И решение машины рядом: одно дело, а не три — слово не добавляет железа.
    expect(screen.getByText(/человек за машиной — одно дело/)).toBeTruthy();
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

  it("ввод в поле спрашивают, а потом показывают, что в поле оказалось", async () => {
    vi.mocked(uiDump).mockResolvedValue({
      title: "Вход",
      process: "chrome.exe",
      elements: [
        { depth: 1, kind: "поле ввода", name: "Логин", id: "login", enabled: true, actions: ["value"] },
      ],
      truncated: false,
      note: "чтение экрана: UI Automation, только чтение",
      text: "Вход (chrome.exe)\n  - поле ввода «Логин» #login [value]",
    });
    vi.mocked(uiType).mockResolvedValue({
      target: { name: "Логин", kind: "поле ввода", id: "login", actions: ["value"] },
      text: "Иван",
      read_back: "Иван",
      verified: true,
      note: "введено и прочитано обратно: поле показывает то же, что просили",
    });

    render(<Voice onOpen={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Сейчас перед вами/)).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Услышал"), { target: { value: "заполни логин" } });
    fireEvent.click(screen.getByText("Что на экране"));

    await waitFor(() => expect(screen.getByLabelText("Что ввести в «Логин»")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Что ввести в «Логин»"), { target: { value: "Иван" } });
    fireEvent.click(screen.getByText("Ввести в «Логин»"));

    // Пока не сказано «да» — не вводим: сначала человек видит текст и поле.
    expect(vi.mocked(uiType)).not.toHaveBeenCalled();
    expect(screen.getByText(/ввести «Иван» в «Логин»\?/)).toBeTruthy();

    fireEvent.click(screen.getByText("Да, ввести"));

    await waitFor(() => expect(vi.mocked(uiType)).toHaveBeenCalledWith("Логин", "Иван", true));
    // Итог — что в поле, а не «вроде ввели».
    await waitFor(() => expect(screen.getByText(/сейчас в поле «Иван»/)).toBeTruthy());
  });

  it("программа не приняла текст — так и говорим, а не «введено»", async () => {
    vi.mocked(uiDump).mockResolvedValue({
      title: "Вход",
      process: "chrome.exe",
      elements: [
        { depth: 1, kind: "поле ввода", name: "Телефон", id: "", enabled: true, actions: ["value"] },
      ],
      truncated: false,
      note: "чтение экрана",
      text: "Вход (chrome.exe)\n  - поле ввода «Телефон» [value]",
    });
    vi.mocked(uiType).mockResolvedValue({
      target: { name: "Телефон", kind: "поле ввода", id: "", actions: ["value"] },
      text: "8 999 123",
      read_back: "+7 999 123",
      verified: false,
      note: "в поле сейчас «+7 999 123» — программа не приняла «8 999 123» как есть (маска, проверка или отказ)",
    });

    render(<Voice onOpen={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Сейчас перед вами/)).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Услышал"), { target: { value: "введи телефон" } });
    fireEvent.click(screen.getByText("Что на экране"));

    await waitFor(() => expect(screen.getByLabelText("Что ввести в «Телефон»")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Что ввести в «Телефон»"), {
      target: { value: "8 999 123" },
    });
    fireEvent.click(screen.getByText("Ввести в «Телефон»"));
    fireEvent.click(screen.getByText("Да, ввести"));

    await waitFor(() => expect(screen.getByText(/программа не приняла/)).toBeTruthy());
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
    vi.mocked(think).mockRejectedValueOnce(new Error("модель не ответила"));
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
    expect(screen.queryByRole("button", { name: "Запустить движок и разобрать эту фразу" })).toBeNull();
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
      deeds: null,
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

  it("большая задача ложится в очередь делами, и ничего не запускается само", async () => {
    vi.mocked(think).mockResolvedValueOnce({
      prompt: "…",
      answer: "…",
      proposal: {
        Split: {
          goal: "наведи порядок в загрузках",
          deeds: ["найди дубликаты в загрузках", "удали старые установщики"],
          why: "две разные работы",
        },
      },
      plan: null,
      learning: null,
      deeds: ["найди дубликаты в загрузках", "удали старые установщики"],
      problem: null,
    });

    render(<Voice onOpen={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Сейчас перед вами/)).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Услышал"), {
      target: { value: "наведи порядок в загрузках" },
    });
    fireEvent.click(screen.getByText("Спросить модель"));

    await waitFor(() => expect(screen.getByText(/разложил «наведи порядок в загрузках» на 2 дела/)).toBeTruthy());
    expect(screen.getByText(/1\. найди дубликаты в загрузках/)).toBeTruthy();

    // Пока человек не нажал — ни одного запуска.
    expect(vi.mocked(runPlan)).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("Поставить все в очередь"));

    // Дела в очереди, ждут и ничего не делают без «Работать без меня».
    await waitFor(() => expect(screen.getAllByText(/^ждёт · /).length).toBe(2));
    expect(vi.mocked(runPlan)).not.toHaveBeenCalled();
  });

  it("после работы показывается, что видно на экране, — а не «готово и точка»", async () => {
    vi.mocked(planFor).mockResolvedValueOnce([]);
    vi.mocked(draftPlan).mockResolvedValueOnce({
      plan: {
        goal: "отправить форму",
        steps: [{ registry: "apps-windows|нажать|кнопку", params: { name: "Отправить" } }],
      },
      problems: [],
      gates: [],
      questions: [],
    });
    vi.mocked(runPlan).mockResolvedValueOnce({
      goal: "отправить форму",
      steps: [
        {
          position: 1,
          registry: "apps-windows|нажать|кнопку",
          status: "ok",
          reason: "нажато, и экран изменился",
          evidence: "ui_changed",
          duration_ms: 40,
        },
      ],
      stopped: null,
      run_id: 7,
      sight: {
        title: "Письмо",
        changed: true,
        comparable: true,
        text: "Письмо (chrome.exe)\n  - текст «Отправлено»",
        note: "экран изменился: видно не то, что было до работы",
      },
    });

    render(<Voice onOpen={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Сейчас перед вами/)).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Услышал"), { target: { value: "отправь форму" } });
    fireEvent.click(screen.getByText("Найти"));

    await waitFor(() => expect(screen.getByText("Выполнить")).toBeTruthy());
    fireEvent.click(screen.getByText("Выполнить"));

    // Итог — не «готово», а «вот что видно после работы».
    await waitFor(() => expect(screen.getByText("Что видно после работы")).toBeTruthy());
    expect(screen.getByText(/экран: экран изменился/)).toBeTruthy();
    expect(screen.getByText(/текст «Отправлено»/)).toBeTruthy();
  });

  it("цепочка модели видна по шагам и не выполняется сама", async () => {
    vi.mocked(think).mockResolvedValueOnce({
      prompt: "…",
      answer: "…",
      proposal: {
        Chain: {
          goal: "оформить заказ",
          steps: [
            { registry: "apps-windows|ввести|текст", params: { name: "Логин" }, why: "вход" },
            { registry: "apps-windows|нажать|кнопку", params: { name: "Войти" }, why: "войти" },
          ],
          why: "по шагам",
        },
      },
      plan: {
        plan: {
          goal: "оформить заказ",
          source: "model-chain",
          steps: [
            { registry: "apps-windows|ввести|текст", params: {}, why: "вход" },
            { registry: "apps-windows|нажать|кнопку", params: {}, why: "войти" },
          ],
        },
        problems: [],
        gates: [],
        questions: [],
      },
      learning: null,
      deeds: null,
      problem: null,
    });

    render(<Voice onOpen={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Сейчас перед вами/)).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Услышал"), { target: { value: "оформи заказ" } });
    fireEvent.click(screen.getByText("Спросить модель"));

    // Цепочка названа цепочкой, и сказано, что она ничего не выполнила.
    await waitFor(() => expect(screen.getByText(/цепочку из 2 шагов/)).toBeTruthy());
    expect(screen.getByText(/1\. apps-windows\|ввести\|текст — вход/)).toBeTruthy();
    expect(screen.getByText(/2\. apps-windows\|нажать\|кнопку — войти/)).toBeTruthy();
    expect(vi.mocked(runPlan)).not.toHaveBeenCalled();
  });

  it("не показывает устаревший текст запроса модели после смены задачи", async () => {
    let resolvePrompt!: (value: string) => void;
    vi.mocked(modelPrompt).mockReturnValueOnce(new Promise((resolve) => { resolvePrompt = resolve; }));
    render(<Voice onOpen={() => {}} />);
    const field = screen.getByLabelText("Услышал");
    fireEvent.change(field, { target: { value: "первая задача" } });
    fireEvent.click(screen.getByText("Что спросим у модели"));
    await waitFor(() => expect(modelPrompt).toHaveBeenCalledTimes(1));

    fireEvent.change(field, { target: { value: "другая задача" } });
    resolvePrompt("устаревшее содержимое запроса");
    await waitFor(() => expect(screen.queryByText("устаревшее содержимое запроса")).toBeNull());
    expect(screen.queryByText(/Модели уйдёт ровно это/)).toBeNull();
  });

  it("смена задачи очищает старый план и его подтверждение", async () => {
    vi.mocked(draftPlan).mockResolvedValueOnce({
      plan: { goal: "опасное старое дело", source: "model", steps: [{ registry: "files|удалить|папку", params: {} }] },
      problems: [],
      questions: [],
      gates: [{ position: 1, registry: "files|удалить|папку", risk: "destructive", decision: "confirm", wants_approval: true }],
    } as never);

    render(<Voice onOpen={() => {}} />);
    const field = screen.getByLabelText("Услышал");
    fireEvent.change(field, { target: { value: "опасное старое дело" } });
    fireEvent.click(screen.getByText("Найти"));
    await screen.findByLabelText("разрешить шаг 1");
    fireEvent.click(screen.getByLabelText("разрешить шаг 1"));

    fireEvent.change(field, { target: { value: "новая задача" } });

    expect(screen.queryByLabelText("разрешить шаг 1")).toBeNull();
    expect(screen.queryByRole("button", { name: "Выполнить" })).toBeNull();
    expect(runPlan).not.toHaveBeenCalled();
  });

  it("порог «слишком долго» задаёт человек, и он действует (шаг 139)", async () => {
    // На слабой машине 4 с — норма, а не зависание; порог должен быть настраиваемым.
    render(<Voice onOpen={() => {}} />);
    await waitFor(() => expect(screen.getByText(/реестр прочитан: 835 действий/)).toBeTruthy());

    // Границы названы, а не спрятаны.
    expect(screen.getByText(/дольше 1–60 с — спрошу, ждать ли/)).toBeTruthy();
    const field = screen.getByLabelText("порог «слишком долго», секунды");
    fireEvent.change(field, { target: { value: "0" } });
    fireEvent.click(screen.getByText("Сохранить порог"));
    // Меньше минуты нельзя — вопросы на ровном месте, и сказано почему.
    await waitFor(() => expect(screen.getByText(/меньше 1 с нельзя — ставлю 1 с/)).toBeTruthy());
    expect(localStorage.getItem("jar.longMs")).toBe("1");

    // И порог действительно действует: при 1 с вопрос приходит быстрее, чем при 4 с.
    vi.mocked(think).mockReturnValueOnce(new Promise(() => {}));
    fireEvent.change(screen.getByLabelText("Услышал"), { target: { value: "переименуй фото" } });
    fireEvent.click(screen.getByText("Спросить модель"));
    await waitFor(
      () => expect(screen.getByText(/«поиск ответа» — это долго \(\d+ с\)\. Ждать\?/)).toBeTruthy(),
      { timeout: 4000 },
    );
    localStorage.removeItem("jar.longMs");
  }, 12_000);

  it("отмена возвращает управление сразу, даже если ядро ещё считает (шаг 138)", async () => {
    // «Стоп» не должен ждать ответа ядра: именно тогда он и нужен.
    let resolveThink!: () => void;
    vi.mocked(think).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveThink = () => resolve(null as never);
      }),
    );
    render(<Voice onOpen={() => {}} />);
    await waitFor(() => expect(screen.getByText(/реестр прочитан: 835 действий/)).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Услышал"), { target: { value: "переименуй фото" } });
    fireEvent.click(screen.getByText("Спросить модель"));
    await waitFor(() => expect(think).toHaveBeenCalled());

    // Ядро всё ещё «считает», а стоп уже работает.
    fireEvent.click(screen.getByRole("button", { name: "Стоп" }));
    await waitFor(() => expect(screen.getByText("Остановлено сразу")).toBeTruthy());
    expect(screen.getByText(/управление у вас; ядро досчитает и его ответ будет выброшен/)).toBeTruthy();
    // И порядок назван: сначала человек свободен, потом просьба ядру.
    expect(screen.getByText(/сначала отпускаю интерфейс, потом прошу ядро остановиться/)).toBeTruthy();

    // Поздний ответ не оживает: «сейчас: свободно», а не «думаю».
    await act(async () => {
      resolveThink();
    });
    await waitFor(() => expect(screen.getByText("сейчас: свободно")).toBeTruthy());
  });

  it("холодный старт и тёплый замеряются отдельно, и оба в журнале (шаг 136)", async () => {
    // «3,4 с, потом 0,4» читалось как нестабильность, а это две разные причины.
    vi.mocked(think).mockResolvedValueOnce({
      prompt: "…",
      answer: "…",
      proposal: { Call: { registry: "storage-backup|проверить|свободное место", params: {}, why: "просил" } },
      plan: {
        plan: {
          goal: "что с диском",
          source: "model",
          steps: [{ registry: "storage-backup|проверить|свободное место", params: {}, why: "первый" }],
        },
        problems: [],
        gates: [],
        questions: [],
      },
      learning: null,
      deeds: null,
      problem: null,
    });
    vi.mocked(runPlan).mockResolvedValueOnce({
      goal: "что с диском",
      steps: [{ position: 1, registry: "проверить место", status: "ok", reason: "", evidence: "120 ГБ", duration_ms: 400 }],
      stopped: null,
      run_id: 3,
      sight: null,
    });

    render(<Voice onOpen={() => {}} />);
    await waitFor(() => expect(screen.getByText(/реестр прочитан: 835 действий/)).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Услышал"), { target: { value: "что с диском" } });
    fireEvent.click(screen.getByText("Спросить модель"));
    await waitFor(() => expect(screen.getByText("Что могу сделать")).toBeTruthy());
    for (const box of screen.queryAllByLabelText(/^разрешить шаг \d+$/)) fireEvent.click(box);
    fireEvent.click(screen.getByRole("button", { name: "Выполнить" }));

    await waitFor(() => expect(screen.getByText("Холодный старт и тёплый — отдельно")).toBeTruthy());
    // Род назван словами у замера, а не угадывается при чтении.
    expect(screen.getAllByText(/· (холодный старт|тёплый)$/).length).toBeGreaterThan(0);
    // И средняя по смеси не выдаётся: роды считаются раздельно.
    expect(screen.getByText(/(холодный старт: \d+, всего \d+ мс|холодных стартов не было)/)).toBeTruthy();
    localStorage.removeItem("jar.startKinds");
  });

  it("опасное дело называет объём до нажатия, а не только слово «удаление» (шаг 162)", async () => {
    // Дефект: человек читал «удаление/перезапись — нужно подтверждение» и не мог
    // узнать, что это: одна пустая папка или 340 файлов.
    vi.mocked(think).mockResolvedValueOnce({
      prompt: "…",
      answer: "…",
      proposal: { Call: { registry: "files|удалить|в корзину", params: {}, why: "просил почистить" } },
      plan: {
        plan: {
          goal: "почистить фото",
          source: "model",
          steps: [
            {
              registry: "files|удалить|в корзину",
              params: { path: "C:\\Фото\\IMG_0001.jpg\nC:\\Фото\\IMG_0002.jpg" },
              why: "убрать старые",
            },
          ],
        },
        problems: [],
        questions: [],
        gates: [
          {
            position: 1,
            registry: "files|удалить|в корзину",
            decision: "confirm",
            risk: "destructive",
            wants_approval: true,
          },
        ],
      },
      learning: null,
      deeds: null,
      problem: null,
    });

    render(<Voice onOpen={() => {}} />);
    await waitFor(() => expect(screen.getByText(/реестр прочитан: 835 действий/)).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Услышал"), { target: { value: "почисти фото" } });
    fireEvent.click(screen.getByText("Спросить модель"));
    await waitFor(() => expect(screen.getByText("Цена ошибки")).toBeTruthy());

    // Объём — числом и с именами: «2 файла», а не «папку».
    // Число названо и без образцов не остаётся: имена — те самые файлы.
    expect(screen.getByText(/последствия: 2 файла, 0 Б: IMG_0001\.jpg, IMG_0002\.jpg/)).toBeTruthy();
    // И обратимость названа рядом: корзина — вернуть можно.
    expect(screen.getByText(/удаление в корзину: вернуть можно/)).toBeTruthy();
  });

  it("перед запуском программы видно, что и откуда, и временная папка настораживает (шаг 173)", async () => {
    // Дефект: путь говорит «где», а не «откуда». `%TEMP%` и `Program Files` в
    // строке выглядят одинаково.
    vi.mocked(think).mockResolvedValueOnce({
      prompt: "…",
      answer: "…",
      proposal: { Call: { registry: "apps-windows|запустить|программу", params: {}, why: "открой" } },
      plan: {
        plan: {
          goal: "открыть программу",
          source: "model",
          steps: [
            {
              registry: "apps-windows|запустить|программу",
              params: { path: "C:\\Users\\test\\AppData\\Local\\Temp\\setup.exe" },
              why: "установить",
            },
          ],
        },
        problems: [],
        questions: [],
        gates: [
          {
            position: 1,
            registry: "apps-windows|запустить|программу",
            decision: "confirm",
            risk: "external",
            wants_approval: true,
          },
        ],
      },
      learning: null,
      deeds: null,
      problem: null,
    });

    render(<Voice onOpen={() => {}} />);
    await waitFor(() => expect(screen.getByText(/реестр прочитан: 835 действий/)).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Услышал"), { target: { value: "открой установщик" } });
    fireEvent.click(screen.getByText("Спросить модель"));
    await waitFor(() => expect(screen.getByText("Цена ошибки")).toBeTruthy());

    // Что запускается и откуда — до нажатия.
    expect(screen.getByText(/запустится setup\.exe — из временной папки/)).toBeTruthy();
    // И это не «обычная программа»: причина названа.
    expect(screen.getByText(/из временной папки: откуда файл — не понять/)).toBeTruthy();
    // Шаг 174: про подпись и хеш сказано прямо — «проверить нечем», а не промолчано.
    expect(screen.getByText(/проверить нечем: подпись проверить не удалось: незнание не разрешение/)).toBeTruthy();
  });

  it("чужой сетевой адрес отклоняется до запуска, подделка через user@ тоже (шаг 172)", async () => {
    // Дефект: ядро проверяло схему, а не хост. «Начинается с https» — не проверка.
    vi.mocked(think).mockResolvedValueOnce({
      prompt: "…",
      answer: "…",
      proposal: { Call: { registry: "files|скачать|файл по ссылке", params: {}, why: "скачать" } },
      plan: {
        plan: {
          goal: "скачать модель",
          source: "model",
          steps: [
            { registry: "files|скачать|файл по ссылке", params: { url: "https://evil.example/m.gguf" }, why: "модель" },
            { registry: "files|скачать|файл по ссылке", params: { url: "https://huggingface.co@evil.example/m.gguf" }, why: "модель" },
          ],
        },
        problems: [],
        questions: [],
        gates: [
          {
            position: 1,
            registry: "files|скачать|файл по ссылке",
            decision: "confirm",
            risk: "external",
            wants_approval: true,
          },
          {
            position: 2,
            registry: "files|скачать|файл по ссылке",
            decision: "confirm",
            risk: "external",
            wants_approval: true,
          },
        ],
      },
      learning: null,
      deeds: null,
      problem: null,
    });

    render(<Voice onOpen={() => {}} />);
    await waitFor(() => expect(screen.getByText(/реестр прочитан: 835 действий/)).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Услышал"), { target: { value: "скачай модель" } });
    fireEvent.click(screen.getByText("Спросить модель"));
    await waitFor(() => expect(screen.getByText("Цена ошибки")).toBeTruthy());

    // Чужой хост: отказ с причиной, а не «наверное, пойдёт».
    expect(screen.getByText(/отказ: хост evil.example не в списке разрешённых/)).toBeTruthy();
    // Подделка: начинается с https, а хост — чужой.
    expect(screen.getByText(/отказ: в адресе есть логин/)).toBeTruthy();
    // До разрешения видно, куда ушёл бы запрос.
    expect(screen.getByText(/наружу уйдёт запрос на evil.example/)).toBeTruthy();
  });

  it("вне списка — только с явным согласием на это дело (шаг 171)", async () => {
    // Дефект: предел был, но выйти за него на одно дело было нельзя — либо
    // правь список навсегда, либо ничего.
    localStorage.setItem("jar.folders", JSON.stringify({ folders: ["C:\\Фото"], except: [] }));
    vi.mocked(think).mockResolvedValueOnce({
      prompt: "…",
      answer: "…",
      proposal: { Call: { registry: "files|удалить|в корзину", params: {}, why: "удали" } },
      plan: {
        plan: {
          goal: "почистить архив",
          source: "model",
          steps: [
            { registry: "files|удалить|в корзину", params: { path: "D:\\Архив\\a.zip" }, why: "старое" },
          ],
        },
        problems: [],
        questions: [],
        gates: [
          {
            position: 1,
            registry: "files|удалить|в корзину",
            decision: "confirm",
            risk: "destructive",
            wants_approval: true,
          },
        ],
      },
      learning: null,
      deeds: null,
      problem: null,
    });

    render(<Voice onOpen={() => {}} />);
    await waitFor(() => expect(screen.getByText(/реестр прочитан: 835 действий/)).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Услышал"), { target: { value: "почисти архив" } });
    fireEvent.click(screen.getByText("Спросить модель"));
    await waitFor(() => expect(screen.getByText("Цена ошибки")).toBeTruthy());

    // До согласия — отказ, и причина названа.
    expect(screen.getByText(/отказ: вне выбранных папок/)).toBeTruthy();
    // Согласие — кнопкой, на это дело.
    fireEvent.click(screen.getByRole("button", { name: "Разрешить на это дело (на час)" }));
    // После согласия тот же путь больше не отказ: иначе разрешение было бы
    // формальностью, а экран продолжал бы говорить «нет».
    await waitFor(() => expect(screen.queryByText(/отказ: вне выбранных папок/)).toBeNull());
    // И сказано, что это именно на дело и до срока.
    expect(screen.getByText(/разрешено на это дело до /)).toBeTruthy();
    localStorage.removeItem("jar.folders");
  });

  it("путь вне выбранных папок — отказ до запуска, и предлагается ближайшая папка (шаг 164)", async () => {
    // Дефект: путь из фразы чистился от кавычек и шёл в дело. `..` в середине
    // выводил наружу, оставаясь «похожим» на путь внутри папки.
    localStorage.setItem("jar.folders", JSON.stringify({ folders: ["C:\\Фото"], except: [] }));
    vi.mocked(think).mockResolvedValueOnce({
      prompt: "…",
      answer: "…",
      proposal: { Call: { registry: "files|удалить|в корзину", params: {}, why: "удали" } },
      plan: {
        plan: {
          goal: "убрать лишнее",
          source: "model",
          steps: [
            {
              registry: "files|удалить|в корзину",
              params: { path: "C:\\Фото\\..\\Windows\\a.dll" },
              why: "почистить",
            },
          ],
        },
        problems: [],
        questions: [],
        gates: [
          {
            position: 1,
            registry: "files|удалить|в корзину",
            decision: "confirm",
            risk: "destructive",
            wants_approval: true,
          },
        ],
      },
      learning: null,
      deeds: null,
      problem: null,
    });

    render(<Voice onOpen={() => {}} />);
    await waitFor(() => expect(screen.getByText(/реестр прочитан: 835 действий/)).toBeTruthy());
    expect(screen.getByText(/выбрано папок: 1 — C:\\Фото/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Услышал"), { target: { value: "почисти фото" } });
    fireEvent.click(screen.getByText("Спросить модель"));
    await waitFor(() => expect(screen.getByText("Цена ошибки")).toBeTruthy());

    // Отказ назван, а не спрятан: путь вне предела, и почему.
    expect(screen.getByText(/отказ: вне выбранных папок/)).toBeTruthy();
    // И предложение — ближайшая папка из самого пути, а не «разрешить всё».
    expect(screen.getByText(/если это правда нужно, разрешите папку C:\\Windows/)).toBeTruthy();
    localStorage.removeItem("jar.folders");
  });

  it("удаление по умолчанию идёт в корзину, и журнал называет, сколько вернёт (шаг 163)", async () => {
    // Дефект: план мог позвать удаление мимо корзины, а фраза «удали» не уточняла,
    // что значит «удали». Человек узнавал разницу после.
    vi.mocked(think).mockResolvedValueOnce({
      prompt: "…",
      answer: "…",
      proposal: { Call: { registry: "files|удалить|в корзину", params: {}, why: "сказал удали" } },
      plan: {
        plan: {
          goal: "убрать старое",
          source: "model",
          steps: [{ registry: "files|удалить|в корзину", params: {}, why: "удали папку Старое" }],
        },
        problems: [],
        questions: [],
        gates: [
          {
            position: 1,
            registry: "files|удалить|в корзину",
            decision: "confirm",
            risk: "destructive",
            wants_approval: true,
          },
        ],
      },
      learning: null,
      deeds: null,
      problem: null,
    });

    render(<Voice onOpen={() => {}} />);
    await waitFor(() => expect(screen.getByText(/реестр прочитан: 835 действий/)).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Услышал"), { target: { value: "удали папку Старое" } });
    fireEvent.click(screen.getByText("Спросить модель"));
    await waitFor(() => expect(screen.getByText("Цена ошибки")).toBeTruthy());

    // Куда уйдёт — до нажатия, и это умолчание, а не догадка.
    expect(screen.getByText(/удаление в корзину · вернуть можно: запись в журнале есть/)).toBeTruthy();

    // Журнал: число, а не «вернуть можно». Один шаг вернётся, второй — нет.
    vi.mocked(undoReport).mockResolvedValueOnce({
      session: "тест",
      steps: [
        {
          entry: { at: 1, session: "тест", kind: "move", from: "C:\\Старое\\a.txt", to: "" },
          refusal: null,
        },
        {
          entry: { at: 2, session: "тест", kind: "move", from: "C:\\Старое\\b.txt", to: "" },
          refusal: "файла уже нет",
        },
      ],
      note: "журнал этой сессии",
    });
    fireEvent.click(screen.getByRole("button", { name: "Что вернёт журнал" }));
    await waitFor(() =>
      expect(screen.getByText(/вернётся 1 из 1: всё на месте · журнал этой сессии/)).toBeTruthy(),
    );
    // Кнопка возврата — только когда вернуть правда есть что.
    expect(screen.getByRole("button", { name: "Вернуть" })).toBeTruthy();

    // Шаг 175: что именно вернётся — предметами, а не номерами шагов.
    // Частичный откат назван числом, и предметы перечислены: не «шаг 2», а файл.
    expect(screen.getByText(/что вернётся: вернётся 1 из 2: остальные вернуть нельзя/)).toBeTruthy();
    // И про тот, что не вернётся, сказано до нажатия, а не после.
    expect(screen.getByText(/b\.txt: вернуть нельзя — файла C:\\Старое\\b\.txt уже нет/)).toBeTruthy();
    expect(screen.getByText(/a\.txt: C:\\Старое\\a\.txt · перемещение/)).toBeTruthy();
  });

  it("согласия — отдельно по каналам, с датой, и отзыв гасит канал сразу (шаги 168–169)", async () => {
    // Дефект: согласия были «по факту пользования» — формально это не согласие,
    // а отсутствие отказа.
    render(<Voice onOpen={() => {}} />);
    await waitFor(() => expect(screen.getByText("Согласия")).toBeTruthy());

    // По умолчанию — нет, и это сказано словами.
    expect(screen.getByText(/микрофон: не разрешён — согласия не давали/)).toBeTruthy();
    expect(screen.getByText(/сеть: не разрешён — согласия не давали/)).toBeTruthy();
    expect(screen.getByText(/файлы: не разрешён — согласия не давали/)).toBeTruthy();

    // Разрешаем микрофон — дата появляется в строке.
    fireEvent.click(screen.getByRole("button", { name: "Разрешить: микрофон" }));
    await waitFor(() => expect(screen.getByText(/микрофон: разрешён \d{4}-\d{2}-\d{2}/)).toBeTruthy());
    // Микрофон разрешён, а сеть и файлы — нет: согласие не расползлось на всё.
    expect(screen.getByText(/сеть: не разрешён/)).toBeTruthy();
    expect(screen.getByText(/файлы: не разрешён/)).toBeTruthy();
    // Согласие сохранено на диск — это не состояние кадра.
    expect(localStorage.getItem("jar.grants.v1")).toContain("mic");

    // Отзыв — сразу: галочка снята, запись говорит про отзыв.
    fireEvent.click(screen.getByRole("button", { name: "Отозвать: микрофон" }));
    await waitFor(() => expect(screen.getByText(/микрофон: отозван \d{4}-\d{2}-\d{2}/)).toBeTruthy());
    // Галочка на экране есть только без локального движка; сам факт отзыва
    // проверяем по записи — она и есть источник правды для канала.
    expect(JSON.parse(localStorage.getItem("jar.grants.v1") ?? "{}").mic.revokedAt).toBeGreaterThan(0);
    localStorage.removeItem("jar.grants.v1");
  });

  it("что уйдёт наружу видно глазами: адрес, тело, когда (шаг 167)", async () => {
    // Дефект: «всё работает локально» было обещанием, которое негде было увидеть.
    render(<Voice onOpen={() => {}} />);
    await waitFor(() => expect(screen.getByText("Что уйдёт наружу")).toBeTruthy());

    // Сколько дверей и что на своей машине — числом.
    expect(screen.getByText("наружу: 2 двери; на своём компьютере — 1")).toBeTruthy();
    // Тело названо: у загрузки — ничего, кроме запроса файла.
    expect(screen.getByText(/модель разговора \(.gguf\) → адрес задаёт ссылка/)).toBeTruthy();
    expect(screen.getByText(/ничего, кроме запроса файла: ни фразы, ни истории/)).toBeTruthy();
    // Локальный движок назван своим компьютером, а не «наружу».
    expect(screen.getByText(/движок модели: запросы к llama-server → свой компьютер \(127\.0\.0\.1\)/)).toBeTruthy();
    expect(screen.getByText(/до своего же компьютера/)).toBeTruthy();
  });

  it("список прав: что делаю и чего не делаю никогда — в одном месте (шаг 161)", async () => {
    // Дефект: правила были верные, но разбросаны (policy.ts, реестр, refusal.ts),
    // и ответ на «что ты вообще можешь» приходил по частям.
    render(<Voice onOpen={() => {}} />);
    await waitFor(() => expect(screen.getByText(/реестр прочитан: 835 действий/)).toBeTruthy());
    await waitFor(() =>
      expect(screen.getByText("готово 626, в работе 198, не делаем никогда 11")).toBeTruthy(),
    );

    // Правила — строкой, и каждое называет место, где срабатывает.
    expect(screen.getByText(/^не делаю: не двигаю деньги/)).toBeTruthy();
    expect(screen.getByText(/не вхожу в учётные записи и не подписываю документы/)).toBeTruthy();

    // «Никогда» — из настоящего реестра, с причиной и с тем, что вместо.
    expect(screen.getByText(/^никогда: купить билет \(только навигатор\); вместо этого — /)).toBeTruthy();
    expect(screen.getByText(/^никогда: оплатить счёт \(/)).toBeTruthy();
    // И «вместо» — не стена, а навигатор до оплаты.
    expect(screen.getAllByText(/доведу до оплаты и покажу сумму — платить будете вы/).length).toBe(4);
  });

  it("повтор спрашивает только про необратимое, и причина названа (шаг 144)", async () => {
    // Дефект: повтор шёл по факту «не получилось», а не по риску. «Прочитать не
    // вышло» повторяется само, «удалить не вышло» — только со слова, и вопрос
    // называет причину: двойное удаление хуже отказа.
    vi.mocked(think).mockResolvedValueOnce({
      prompt: "…",
      answer: "…",
      proposal: { Call: { registry: "storage-backup|проверить|свободное место", params: {}, why: "просил про диск" } },
      plan: {
        plan: {
          goal: "что с диском",
          source: "model",
          steps: [
            { registry: "storage-backup|проверить|свободное место", params: {}, why: "прочитать" },
            { registry: "storage-backup|удалить|старую копию", params: {}, why: "удалить" },
          ],
        },
        problems: [],
        questions: [],
        gates: [
          {
            position: 1,
            registry: "storage-backup|проверить|свободное место",
            decision: "allow",
            risk: "read",
            wants_approval: false,
          },
          {
            position: 2,
            registry: "storage-backup|удалить|старую копию",
            decision: "confirm",
            risk: "destructive",
            wants_approval: true,
          },
        ],
      },
      learning: null,
      deeds: null,
      problem: null,
    });
    vi.mocked(runPlan).mockResolvedValueOnce({
      goal: "что с диском",
      steps: [
        {
          position: 1,
          registry: "storage-backup|проверить|свободное место",
          status: "failed",
          reason: "таймаут",
          evidence: "",
          duration_ms: 900,
        },
        {
          position: 2,
          registry: "storage-backup|удалить|старую копию",
          status: "failed",
          reason: "файл занят",
          evidence: "",
          duration_ms: 700,
        },
      ],
      stopped: null,
      run_id: 3,
      sight: null,
    });

    render(<Voice onOpen={() => {}} />);
    await waitFor(() => expect(screen.getByText(/реестр прочитан: 835 действий/)).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Услышал"), { target: { value: "что с диском" } });
    fireEvent.click(screen.getByText("Спросить модель"));
    await waitFor(() => expect(screen.getByText("Что могу сделать")).toBeTruthy());

    for (const box of screen.queryAllByLabelText(/^разрешить шаг \d+$/)) fireEvent.click(box);
    fireEvent.click(screen.getByRole("button", { name: "Выполнить" }));
    await waitFor(() => expect(vi.mocked(runPlan)).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText("Что сделано")).toBeTruthy());

    // Безопасное чтение: вопроса нет — повтор не требует слова.
    expect(screen.queryByText(/1\. повтор требует слова/)).toBeNull();
    // Необратимое удаление: слово нужно, и причина названа словами про второй объект.
    await waitFor(() =>
      expect(screen.getByText(/2\. повтор требует слова: шаг необратим/)).toBeTruthy(),
    );
    expect(screen.getByText(/может удалить второй объект, а не этот \(файл занят\)/)).toBeTruthy();
    // Причина названа, а не спрятана: вопрос без «потому что» — формальность.
    expect(screen.getByText(/шаг необратим: повтор может удалить второй объект/)).toBeTruthy();
  });

  it("в отчёте у каждого дела свой замер, и он хранится рядом (шаг 135)", async () => {
    // «Шаг 2 не выполнен» без времени не говорил, упал он сразу или висел 20 секунд.
    vi.mocked(think).mockResolvedValueOnce({
      prompt: "…",
      answer: "…",
      proposal: { Call: { registry: "storage-backup|проверить|свободное место", params: {}, why: "просил про диск" } },
      plan: {
        plan: {
          goal: "что с диском",
          source: "model",
          steps: [
            { registry: "storage-backup|проверить|свободное место", params: {}, why: "первый" },
            { registry: "storage-backup|проверить|резервную копию", params: {}, why: "второй" },
          ],
        },
        problems: [],
        gates: [],
        questions: [],
      },
      learning: null,
      deeds: null,
      problem: null,
    });
    vi.mocked(runPlan).mockResolvedValueOnce({
      goal: "что с диском",
      steps: [
        { position: 1, registry: "проверить место", status: "ok", reason: "", evidence: "120 ГБ", duration_ms: 1200 },
        { position: 2, registry: "проверить копию", status: "failed", reason: "нет копии", evidence: "", duration_ms: 2400 },
      ],
      stopped: null,
      run_id: 2,
      sight: null,
    });

    render(<Voice onOpen={() => {}} />);
    await waitFor(() => expect(screen.getByText(/реестр прочитан: 835 действий/)).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Услышал"), { target: { value: "что с диском" } });
    fireEvent.click(screen.getByText("Спросить модель"));
    await waitFor(() => expect(screen.getByText("Что могу сделать")).toBeTruthy());

    // Запуск плана — настоящий путь: сначала согласие на шаги, потом «Выполнить».
    for (const box of screen.queryAllByLabelText(/^разрешить шаг \d+$/)) fireEvent.click(box);
    fireEvent.click(screen.getByRole("button", { name: "Выполнить" }));

    await waitFor(() => expect(vi.mocked(runPlan)).toHaveBeenCalled());
    await waitFor(() => expect(screen.getAllByText(/Сколько шло каждое дело|Что сделано/).length).toBeGreaterThan(0));
    await waitFor(() => expect(screen.getByText("Сколько шло каждое дело")).toBeTruthy());
    // Число шага — из настоящего `duration_ms`, а не выдуманное.
    expect(screen.getByText("1. проверить место · 1200 мс")).toBeTruthy();
    expect(screen.getByText("2. проверить копию · 2400 мс")).toBeTruthy();
    // И самое медленное названо — ответ на «что чинить».
    expect(screen.getByText(/медленнее всего: «проверить копию»/)).toBeTruthy();
    // Отчёт сохранён вместе с числами: сравнить будет с чем.
    expect(localStorage.getItem("jar.deedTiming")).toContain("2400");
    localStorage.removeItem("jar.deedTiming");
  });

  it("у ожидания назван срок и оно не спиннер без конца (шаг 134)", async () => {
    // Спиннер без срока не отличает «ещё работает» от «умерло».
    vi.mocked(think).mockReturnValueOnce(new Promise(() => {}));
    render(<Voice onOpen={() => {}} />);
    await waitFor(() => expect(screen.getByText(/реестр прочитан: 835 действий/)).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Услышал"), { target: { value: "переименуй фото" } });
    fireEvent.click(screen.getByText("Спросить модель"));

    await waitFor(() =>
      expect(screen.getByText(/^модель: 30 с — она думает, и это нормально; если срок выйдет — спрошу, ждать ли дальше$/)).toBeTruthy(),
    );
  });

  it("первая строка «понял, делаю» приходит до плана, одной строкой (шаг 133)", async () => {
    // «Разбираю» говорило «я здесь», но не «я понял» — и человек повторял фразу.
    let resolveThink!: () => void;
    vi.mocked(think).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveThink = () => resolve(null as never);
      }),
    );
    render(<Voice onOpen={() => {}} />);
    await waitFor(() => expect(screen.getByText(/реестр прочитан: 835 действий/)).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Услышал"), { target: { value: "переименуй фото" } });
    fireEvent.click(screen.getByText("Спросить модель"));

    // Признание есть раньше плана: модель ещё думает.
    await waitFor(() => expect(screen.getByText("Понял")).toBeTruthy());
    expect(screen.getByText(/^понял: «переименуй фото»$/)).toBeTruthy();
    expect(think).toHaveBeenCalled();
    await act(async () => {
      resolveThink();
    });
  });

  it("«что умеешь» отвечается сразу и без модели, и сказано, откуда числа (шаг 132)", async () => {
    // Ответ известен заранее — ему незачем ждать чтения реестра или модели.
    render(<Voice onOpen={() => {}} />);
    fireEvent.change(screen.getByLabelText("Услышал"), { target: { value: "что ты умеешь" } });
    fireEvent.click(screen.getByText("Спросить модель"));

    await waitFor(() => expect(screen.getByText("Ответ сразу")).toBeTruthy());
    // Модель не спрашивали вовсе: это условие ответа, а не «повезло».
    expect(think).not.toHaveBeenCalled();
    // И сказано, что это за числа и что ответ занял.
    expect(screen.getByText(/(без чисел: реестр ещё не прочитан|числа из реестра этого запуска|числа из прошлого запуска — могли измениться) · \d+ мс — (в кадре|дольше кадра \(16 мс\): это задержка, а не «мгновенно»)/)).toBeTruthy();
  });

  it("ответ из прошлого запуска не выдаётся за свежий (шаг 132)", async () => {
    // Ответ, сохранённый в прошлый раз, называется прошлым — и всё равно мгновенный.
    localStorage.setItem(
      "jar.instant",
      JSON.stringify([
        { ask: "health", said: "работаю на этой машине; если что-то долго — скажу числом", numbers: "past", version: "800:12:50" },
      ]),
    );
    render(<Voice onOpen={() => {}} />);
    fireEvent.change(screen.getByLabelText("Услышал"), { target: { value: "как дела" } });
    fireEvent.click(screen.getByText("Спросить модель"));

    await waitFor(() =>
      expect(screen.getByText(/^работаю на этой машине; если что-то долго — скажу числом · /)).toBeTruthy(),
    );
    expect(think).not.toHaveBeenCalled();
    localStorage.removeItem("jar.instant");
  });

  it("ядро поднимается в фоне при старте и это названо, а не спрятано (шаг 131)", async () => {
    // Первая фраза платила за старт, хотя окно было открыто давно.
    // Движок и модель на месте — значит поднимать есть что.
    vi.mocked(readinessStatus).mockResolvedValue(readinessFacts({ engine_found: true, model_present: true }) as never);
    vi.mocked(smokeCheck).mockResolvedValue({ ok: true, note: "" } as never);
    render(<Voice onOpen={() => {}} />);
    // Фон назван фактом, а не тайной: быстрый первый ответ иначе выглядит чудом.
    await waitFor(() => expect(screen.getByText("Ядро заранее")).toBeTruthy());
    // И цена подъёма — числом, а не «стало быстрее».
    await waitFor(() => expect(screen.getByText(/^первая фраза: \d+ мс вместо 3100/)).toBeTruthy());
  });

  it("долгое ожидание спрашивает «ждать?» до конца, и «не ждать» останавливает (шаг 129)", async () => {
    // Долгое дело молча шло, и человек уходил, не зная, что можно не ждать.
    vi.mocked(think).mockReturnValueOnce(new Promise(() => {}));
    render(<Voice onOpen={() => {}} />);
    await waitFor(() => expect(screen.getByText(/реестр прочитан: 835 действий/)).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Услышал"), { target: { value: "переименуй фото" } });
    fireEvent.click(screen.getByText("Спросить модель"));
    await waitFor(() => expect(think).toHaveBeenCalled());

    // Порог срабатывает сам, таймером, а не по остаточному глазомеру.
    await waitFor(
      () => expect(screen.getByText(/«поиск ответа» — это долго \(\d+ с\)\. Ждать\?/)).toBeTruthy(),
      { timeout: 6000 },
    );
    // У вопроса оба ответа: выбор, а не уведомление.
    fireEvent.click(screen.getByText("Не ждать"));
    await waitFor(() => expect(screen.getByText(/^останавливаю: не буду ждать$/)).toBeTruthy());
  }, 12_000);

  it("первое слово звучит раньше полного ответа, и его задержка — число (шаг 128)", async () => {
    // Тишина не отвечала на «услышал ли», и человек повторял фразу.
    // Ответ модели ещё не пришёл — а первое слово уже должно быть сказано.
    let resolveThink!: () => void;
    vi.mocked(think).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveThink = () => resolve(null as never);
      }),
    );
    render(<Voice onOpen={() => {}} />);
    await waitFor(() => expect(screen.getByText(/реестр прочитан: 835 действий/)).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Услышал"), { target: { value: "переименуй фото" } });
    fireEvent.click(screen.getByText("Спросить модель"));

    // Модель ещё думает, а первое слово уже сказано — и оно про «услышал», а не про
    // результат.
    await waitFor(() => expect(think).toHaveBeenCalled());
    expect(screen.getByText(/^разбираю — первое слово через \d+ мс$/)).toBeTruthy();

    // Полный ответ приходит следом и не подменяется первым словом.
    await act(async () => {
      resolveThink();
    });
  });

  it("частый вопрос отвечается из реестра, без модели, и говорит откуда (шаг 127)", async () => {
    // «Что ты умеешь» не должно ждать 3 секунды за пересказ того, что уже есть.
    render(<Voice onOpen={() => {}} />);
    // Без чисел реестра кэш молчит — и это видно, а не выдаётся за «ничего не умею».
    expect(screen.getByText(/реестр ещё не прочитан: частые вопросы пока идут к модели/)).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/реестр прочитан: 835 действий, рук 56/)).toBeTruthy());

    // «Что умеешь» с шага 132 отвечается мгновенно и раньше; здесь — вопрос, который
    // кэш реестра знает, а мгновенные ответы нет.
    fireEvent.change(screen.getByLabelText("Услышал"), { target: { value: "помощь" } });
    fireEvent.click(screen.getByText("Спросить модель"));

    await waitFor(() => expect(screen.getByText(/скажите делом: «переименуй фото»/)).toBeTruthy());
    // Сказано, откуда ответ: реестр — не «подумал».
    expect(screen.getByText(/· реестр \d+:\d+:\d+$/)).toBeTruthy();
    // И модель для этого не спрашивали вовсе.
    expect(think).not.toHaveBeenCalled();
    // Промаха не было — кэш говорит числом.
    expect(screen.getByText(/из реестра: 1 из 1, к модели: 0/)).toBeTruthy();
  });

  it("незнакомый вопрос кэш не выдумывает — идёт к модели (шаг 127)", async () => {
    render(<Voice onOpen={() => {}} />);
    await waitFor(() => expect(screen.getByText(/реестр прочитан: 835 действий/)).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Услышал"), { target: { value: "переименуй все фото" } });
    fireEvent.click(screen.getByText("Спросить модель"));

    await waitFor(() => expect(think).toHaveBeenCalled());
    expect(screen.getByText(/из реестра: 0 из 1, к модели: 1/)).toBeTruthy();
  });

  it("план модели становится обычным планом: с подтверждением, а не сразу делом", async () => {
    // Шаг 105: отчёт руки — по шагам. Первый прочитал, второй стёр и необратим.
    vi.mocked(runPlan).mockResolvedValueOnce({
      goal: "что с диском",
      steps: [
        {
          position: 1,
          registry: "storage-backup|проверить|свободное место",
          status: "ok",
          reason: "",
          evidence: "свободно 120 ГБ",
          duration_ms: 20,
        },
        {
          position: 2,
          registry: "storage-backup|проверить|резервную копию",
          status: "failed",
          reason: "нет резервной копии",
          evidence: "",
          duration_ms: 30,
        },
      ],
      stopped: null,
      run_id: 1,
      sight: null,
    });
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
              params: { path: "C:\\Users\\test\\backup.zip", apiKey: "must-not-render" },
              why: "просил про диск",
            },
            {
              registry: "storage-backup|проверить|резервную копию",
              params: {},
              why: "второй подтверждаемый шаг",
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
          {
            position: 2,
            registry: "storage-backup|проверить|резервную копию",
            risk: "destructive",
            decision: "confirm",
            wants_approval: true,
          },
        ],
        questions: [],
      },
      learning: null,
      deeds: null,
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
    expect(
      screen.getByText(
        "1. storage-backup|проверить|свободное место · path: C:\\Users\\test\\backup.zip; apiKey: [скрыто] · просил про диск",
      ),
    ).toBeTruthy();
    expect(screen.getByText(/apiKey: \[скрыто\]/)).toBeTruthy();
    expect(screen.queryByText(/must-not-render/)).toBeNull();
    expect(screen.getAllByText(/нужно ваше разрешение/)).toHaveLength(2);
    // Шаг 104: отмена названа словами до того, как на неё нажали: человек знает,
    // что «сделано» не откатится, и что следующий шаг не начнётся.
    expect(screen.getByText("Отмена")).toBeTruthy();
    expect(screen.getByText("сделано 0 из 2")).toBeTruthy();
    fireEvent.click(screen.getByText("Отменить выполнение"));
    await waitFor(() => expect(screen.getByText(/отменено — не начинал/)).toBeTruthy());
    expect(screen.getByText(/не начнётся — проверка читается перед каждым шагом/)).toBeTruthy();
    const approveFirst = screen.getByLabelText("разрешить шаг 1") as HTMLInputElement;
    const approveSecond = screen.getByLabelText("разрешить шаг 2") as HTMLInputElement;
    const runButton = screen.getByRole("button", { name: "Выполнить" }) as HTMLButtonElement;
    expect(runButton.disabled).toBe(true);

    fireEvent.click(approveFirst);
    expect(approveFirst.checked).toBe(true);
    expect(approveSecond.checked).toBe(false);
    expect(runButton.disabled).toBe(true);
    expect(vi.mocked(runPlan)).not.toHaveBeenCalled();

    fireEvent.click(approveSecond);
    expect(approveSecond.checked).toBe(true);
    expect(runButton.disabled).toBe(false);
    expect(vi.mocked(runPlan)).not.toHaveBeenCalled();

    fireEvent.click(runButton);
    await waitFor(() => expect(vi.mocked(runPlan)).toHaveBeenCalledTimes(1));
    expect(vi.mocked(runPlan).mock.calls[0]?.[1]).toEqual([1, 2]);

    // Шаг 105: отчёт руки — три поля. Второй шаг необратим, и это **видно**:
    // человек узнаёт, что «отменить» не вернёт, до нажатия, а не после.
    await waitFor(() => expect(screen.getByText("Что сделано")).toBeTruthy());
    expect(screen.getByText(/сделанное не отменяется — «отменить» вернёт только то/)).toBeTruthy();
    expect(screen.getByText(/рука ответила полностью: /)).toBeTruthy();
    // Шаг 106: один итог, а не три правды. «Сделано N из M» — числом.
    expect(screen.getByText("сделано 1 из 2, без доказательства 1")).toBeTruthy();
    // Шаг 118: три слова. Второй шаг провален, но доказательство есть — честный
    // ответ «неизвестно», а не наугад «не сделано».
    // Второй шаг провален **без** доказательства — это факт «не сделано», а не
    // «неизвестно»: догадку модуль не выдаёт ни в одну сторону.
    await waitFor(() =>
      expect(screen.getByText("из 2: сделано 1, не сделано 1, неизвестно 0")).toBeTruthy(),
    );

    // Шаг 119: сбой не скрывает сделанного до него. Первая строка — что вышло,
    // потом провал и что делать дальше.
    await waitFor(() => expect(screen.getByText(/^сбой — /)).toBeTruthy());
    expect(screen.getByText(/^сделано до сбоя: 1 — /)).toBeTruthy();
    expect(screen.getByText(/не сделано: шаг 2 «storage-backup\|проверить\|резервную копию» — нет резервной копии/)).toBeTruthy();
    expect(screen.getByText(/продолжить с шага 2: сделанное до него останется/)).toBeTruthy();

    // Шаг 120: откат связан с отчётом. Первый шаг вернуть можно, второй —
    // необратимый (`destructive`), и причина названа, а не спрятана.
    await waitFor(() => expect(screen.getByText(/^откат: вернуть можно 1 из 2/)).toBeTruthy());
    expect(screen.getByText(/1\. storage-backup\|проверить\|свободное место — можно вернуть/)).toBeTruthy();
    expect(screen.getByText(/2\. storage-backup\|проверить\|резервную копию — нельзя вернуть: риск destructive/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Вернуть сделанное" })).toBeTruthy();

    // Шаг 121: задержка замерена по отрезкам на настоящем пути, и самый долгий
    // назван — это ответ на «что чинить».
    await waitFor(() => expect(screen.getByText("Задержка по отрезкам")).toBeTruthy());
    expect(screen.getByText(/дольше всего: (фраза|текст|план|дело) — \d+ мс/)).toBeTruthy();
    expect(screen.getByText(/^всего: \d+ мс$/)).toBeTruthy();

    // Шаг 123: бюджет задержки — числом до первого звука, и нарушение называется
    // дефектом, а не характером машины.
    expect(screen.getByText(/бюджет для средней машины: 1500 мс до первого звука/)).toBeTruthy();
    // Первый звук = всё, кроме дела; в этом прогоне звука не было (напечатано), и
    // это честно сказано, а не превращено в зелёную галочку.
    expect(screen.getByText(/· (в бюджете: \d+ мс из (1500|4000)|нарушение бюджета: \d+ мс вместо (1500|4000)|бюджет до первого звука не проверен: звука не было)/)).toBeTruthy();
    // Шаг 124: нарушение видно рядом с делом и в итоге — числом, а не сноской.
    expect(screen.getByText(/(не замерено|нарушение бюджета: \d+ мс при пределе (1500|4000))$/)).toBeTruthy();
    expect(screen.getAllByText(/(нарушений бюджета: \d+ из \d+|замеров нет)/).length).toBeGreaterThan(0);
    // Шаг 125: холодный старт назван словами и числом — «первый раз долго» без
    // числа нельзя ни планировать, ни чинить.
    expect(screen.getByText(/(ядро поднято один раз: холодный старт \d+ мс|ядро не поднято: первая фраза заплатит за холодный старт|ядро упало.* — следующий запуск снова холодный)/)).toBeTruthy();
    // Шаг 126: занятость названа словами, а не только серой кнопкой.
    expect(screen.getByText(/^сейчас: (свободно|слушаю|распознаю|думаю|собираю план|выполняю|говорю)$/)).toBeTruthy();



    // Шаг 107: повтор показывает разницу **до** вопроса и спрашивает один раз.
    expect(screen.getByText(/шагов плана: сравнивать не с чем — прошлого дела нет/)).toBeTruthy();
    expect(screen.getByText(/уже сделано 1 из 2 — повтор их не тронет/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "повторить?" })).toBeTruthy();

    // Шаг 108: связка рук собрана из фразы, а не из конфига. Порядок и опасность
    // названы до запуска; опасный шаг в связке — отдельное согласие.
    expect(screen.getByText("Связка рук")).toBeTruthy();
    expect(screen.getByText(/дел по словам: 1 · дел в плане: 2/)).toBeTruthy();
    expect(screen.getByText(/в связке есть опасный шаг — согласие по нему отдельное/)).toBeTruthy();

    // Шаг 109: бюджет назван числом до запуска, а не выясняется остановкой.
    expect(screen.getByText("Бюджет дела")).toBeTruthy();
    expect(screen.getByText(/шагов 0 из 10, секунд 0 из 60, память 64 МБ — в пределах/)).toBeTruthy();

    // Шаг 111: у каждого шага своя проверка, названная до запуска. «Готово»
    // говорит проверка, а не удобство.
    expect(screen.getByText("Как проверю результат")).toBeTruthy();
    expect(screen.getByText(/проверок по предмету: \d из 2/)).toBeTruthy();

    // Шаг 112: порядок — из зависимостей, и причина названа. Перестановки ради
    // красоты нет: независимые шаги остаются как записаны.
    expect(screen.getByText("Порядок шагов")).toBeTruthy();
    expect(screen.getByText(/порядок: 2 шагов/)).toBeTruthy();

    // Шаг 113: необратимый шаг помечен до запуска и спрашивает сильнее. Второй шаг
    // плана — `destructive` с ценой «12 файлов», значит вопрос со словом.
    expect(screen.getByText("Цена ошибки")).toBeTruthy();
    expect(screen.getByText(/необратимых 1 из 2/)).toBeTruthy();
    expect(screen.getByText(/НЕ ОТМЕНИТЬ: /)).toBeTruthy();

    // Шаг 114: повтор видит, что уже сделано. Сейчас — ничего, и это сказано
    // числом, а не молчанием.
    expect(screen.getByText("Что уже сделано")).toBeTruthy();
    expect(screen.getByText("сделано раньше: 0 из 2, выполню всё")).toBeTruthy();

    // А после «Запомнить сделанное» шаг, который отчитался `ok`, пропускается:
    // повтор не делает дважды.
    fireEvent.click(screen.getByText("Запомнить сделанное"));
    await waitFor(() => expect(screen.getByText(/сделано раньше: 1 из 2, остальные 1 выполню/)).toBeTruthy());
    expect(screen.getByText(/1\. пропущу — уже сделано в прошлый раз/)).toBeTruthy();

    // Шаг 115: план собирается целиком — ворота есть у обоих шагов, и это сказано
    // до запуска, а не после половины.
    expect(screen.getByText("Собирается ли план")).toBeTruthy();
    expect(screen.getByText("план собирается целиком — можно выполнять")).toBeTruthy();

    // Шаг 116: план правится полями со словами, а не JSON. Подпись — «Куда
    // положить», а не `path`, и правка проверяется до запуска.
    expect(screen.getByText("Поправить план")).toBeTruthy();
    expect(screen.getByLabelText("1. Куда положить")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("1. Куда положить"), { target: { value: "Ерунда" } });
    // Ошибка названа сразу: сломанное поле не ломает остальные.
    await waitFor(() => expect(screen.getByText(/«Куда положить» — нужен полный путь/)).toBeTruthy());
    fireEvent.change(screen.getByLabelText("1. Куда положить"), { target: { value: "E:\\Новое" } });
    expect(screen.getByText(/«Куда положить» — было C:\\Users\\test\\backup.zip, стало E:\\Новое/)).toBeTruthy();
    expect(screen.getByText(/правка меняет шаг — согласие по нему нужно дать заново/)).toBeTruthy();

    // Шаг 117: согласие — на план целиком. Сначала его нет, потом оно в силе, а
    // правка его снимает — с причиной, а не молча.
    expect(screen.getByText("Согласие на план")).toBeTruthy();
    expect(screen.getByText("согласия на план ещё нет — спрошу перед запуском")).toBeTruthy();
    fireEvent.click(screen.getByText("Согласиться на план целиком"));
    await waitFor(() => expect(screen.getByText("план не менялся — согласие в силе")).toBeTruthy());
  });

  // Шаг 122: замер лежит рядом с делом в журнале. Проверяем через **прямой**
  // вызов записи журнала с замером: путь микрофона в браузере недоступен, а
  // подставлять строку журнала — значит проверять подставленное.
  it("замер виден в журнале рядом с делом и назван числом", () => {
    const line: Line = { at: 1, heard: "переименуй фото", understood: "переименовать", did: "переименовал 12", stage: "done", ms: 2400 };
    expect(timingText({ heard: line.heard, did: line.did, ms: line.ms ?? null })).toBe(
      "«переименуй фото» → переименовал 12 · 2,4 с — дольше 1,5 с",
    );
    // Итог говорит, сколько не уложилось, и какое дело медленнее всех.
    expect(sayTiming([{ heard: line.heard, did: line.did, ms: line.ms ?? null }])).toContain(
      "не уложилось в 1,5 с: 1 из 1",
    );
  });

  it("изменение ответа во время перепроверки отменяет запуск устаревшего плана", async () => {
    const initialPlan = {
      plan: {
        goal: "создай папку",
        source: "model",
        steps: [{ registry: "files|создать|папку", params: {}, why: "по просьбе" }],
      },
      problems: [],
      gates: [],
      questions: [{ position: 1, name: "path", label: "Путь", hint: "Путь к папке" }],
    };
    const filledPlan = { ...initialPlan, questions: [], problems: [] };
    let resolveFill!: (value: typeof filledPlan) => void;
    vi.mocked(draftPlan).mockResolvedValueOnce(initialPlan as never);
    vi.mocked(fillPlan).mockReturnValueOnce(new Promise((resolve) => { resolveFill = resolve as (value: typeof filledPlan) => void; }));

    render(<Voice onOpen={() => {}} />);
    fireEvent.change(screen.getByLabelText("Услышал"), { target: { value: "создай папку" } });
    fireEvent.click(screen.getByText("Найти"));

    const path = await screen.findByLabelText("Путь");
    fireEvent.change(path, { target: { value: "C:\\first" } });
    fireEvent.click(screen.getByRole("button", { name: "Ответить и выполнить" }));
    await waitFor(() => expect(fillPlan).toHaveBeenCalledTimes(1));

    fireEvent.change(path, { target: { value: "C:\\second" } });
    resolveFill(filledPlan);
    await waitFor(() => expect(screen.getByRole("button", { name: "Ответить и выполнить" })).toBeTruthy());
    expect(runPlan).not.toHaveBeenCalled();
  });

  it("ответ, меняющий параметры подтверждаемого шага, требует нового согласия", async () => {
    const initialPlan = {
      plan: {
        goal: "удали выбранный файл",
        source: "model",
        steps: [{ registry: "files|удалить|в корзину", params: {}, why: "по просьбе" }],
      },
      problems: [],
      gates: [
        {
          position: 1,
          registry: "files|удалить|в корзину",
          risk: "destructive",
          decision: "confirm" as const,
          wants_approval: true,
        },
      ],
      questions: [{ position: 1, name: "path", label: "Путь", hint: "Путь к файлу" }],
    };
    const filledPlan = {
      ...initialPlan,
      plan: {
        ...initialPlan.plan,
        steps: [
          { registry: "files|удалить|в корзину", params: { path: "C:\\tmp\\target.txt" }, why: "по просьбе" },
        ],
      },
      questions: [],
    };
    vi.mocked(draftPlan).mockResolvedValueOnce(initialPlan);
    vi.mocked(fillPlan).mockResolvedValueOnce(filledPlan);

    render(<Voice onOpen={() => {}} />);
    fireEvent.change(screen.getByLabelText("Услышал"), { target: { value: "удали выбранный файл" } });
    fireEvent.click(screen.getByText("Найти"));

    const path = await screen.findByLabelText("Путь");
    fireEvent.change(path, { target: { value: "C:\\tmp\\target.txt" } });
    fireEvent.click(screen.getByLabelText("разрешить шаг 1"));
    fireEvent.click(screen.getByRole("button", { name: "Ответить и выполнить" }));

    await waitFor(() => expect(vi.mocked(fillPlan)).toHaveBeenCalledTimes(1));
    expect(vi.mocked(fillPlan).mock.calls[0]?.[1]).toHaveLength(1);
    expect(vi.mocked(runPlan)).not.toHaveBeenCalled();
    expect(screen.getByText(/Параметры обновились/)).toBeTruthy();
    expect(
      screen.getByText("1. files|удалить|в корзину · path: C:\\tmp\\target.txt · по просьбе"),
    ).toBeTruthy();
    expect((screen.getByLabelText("разрешить шаг 1") as HTMLInputElement).checked).toBe(false);

    fireEvent.click(screen.getByLabelText("разрешить шаг 1"));
    fireEvent.click(screen.getByRole("button", { name: "Выполнить" }));
    await waitFor(() => expect(vi.mocked(runPlan)).toHaveBeenCalledTimes(1));
    expect(vi.mocked(runPlan).mock.calls[0]?.[1]).toEqual([1]);
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
      deeds: null,
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
      deeds: null,
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

  it("пределы пробы и запрещённое видно до нажатия, а не по факту отказа (шаг 165)", async () => {
    // Дефект: правило жило в ядре и узнавалось после нажатия. «Снимается через
    // 20 секунд» после запуска — факт; до запуска — обещание, по которому решают.
    vi.mocked(think).mockResolvedValueOnce({
      prompt: "…",
      answer: "…",
      proposal: { Learn: { goal: "скачать файл", why: "" } },
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
      deeds: null,
      problem: null,
    });
    // Черновик с запрещённым куском: показывается, но и проверка видна сразу.
    vi.mocked(draftHand).mockResolvedValueOnce({
      key: "storage-backup|проверить|свободное место",
      goal: "скачать отчёт",
      code: "Invoke-WebRequest http://example.invalid/x -OutFile x",
      why: "",
      created_ms: 1,
    });

    render(<Voice onOpen={() => {}} />);
    fireEvent.change(screen.getByLabelText("Услышал"), { target: { value: "сколько места" } });
    fireEvent.click(screen.getByText("Спросить модель"));
    await waitFor(() => expect(screen.getByText("Чему нужно научиться")).toBeTruthy());
    fireEvent.click(screen.getByText("Черновик руки"));

    await waitFor(() => expect(screen.getByText(/Invoke-WebRequest/)).toBeTruthy());
    // Пределы названы числом — до нажатия «Проба».
    expect(screen.getByText(/в клетке: до 20 с, вывод до 2000 знаков/)).toBeTruthy();
    // И запрещённое названо с причиной, а не «нельзя».
    expect(screen.getByText(/чего нельзя: «invoke-webrequest» — скачивание из сети/)).toBeTruthy();
    expect(screen.getByText(/ничего не выполнялось/)).toBeTruthy();
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
      deeds: null,
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
      deeds: null,
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
      cell: "клетка не открылась: ERROR_BAD_ENVIRONMENT; чужой текст без забора не запускается — ничего не выполнялось",
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
      deeds: null,
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
      deeds: null,
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

  it("неотправленная фраза возвращается в поле после закрытия окна (шаг 26)", async () => {
    vi.mocked(speechStatus).mockResolvedValue(null as never);
    // Прошлый запуск: человек набрал и не отправил.
    localStorage.setItem("zshelper.draft.phrase", "убери старые отчёты");

    render(<Voice />);

    // Фраза на месте — её не надо набирать заново.
    expect((screen.getByLabelText("Услышал") as HTMLInputElement).value).toBe(
      "убери старые отчёты",
    );
  });

  it("набранное сохраняется сразу, а не при отправке", async () => {
    vi.mocked(speechStatus).mockResolvedValue(null as never);
    render(<Voice />);

    const field = screen.getByLabelText("Услышал") as HTMLInputElement;
    fireEvent.change(field, { target: { value: "удали временные файлы" } });

    // «Сохранить при уходе» не работает: момент закрытия окна выбрать нельзя.
    expect(localStorage.getItem("zshelper.draft.phrase")).toBe("удали временные файлы");
  });

  it("отмена во время записи выбрасывает сказанное и говорит об этом", async () => {
    vi.mocked(speechStatus).mockResolvedValue(FOUND);
    const wav = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 1]);
    vi.mocked(startRecording).mockResolvedValue({
      stop: vi.fn().mockResolvedValue({ wav, seconds: 1.2, sampleRate: 16_000 }),
    });
    vi.mocked(transcribeLocal).mockResolvedValue("не то");

    render(<Voice />);
    await waitFor(() => expect(screen.getByText(/локальное распознавание работает здесь/)).toBeTruthy());

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
    await waitFor(() => expect(screen.getByText(/локальное распознавание работает здесь/)).toBeTruthy());

    const mic = screen.getByRole("button", { name: "Держать и говорить" });
    fireEvent.pointerDown(mic);
    await waitFor(() => expect(startRecording).toHaveBeenCalled());
    fireEvent.pointerUp(mic);

    await waitFor(() => {
      expect(transcribeLocal).toHaveBeenCalledWith(Array.from(wav), expect.any(AbortSignal));
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
    await waitFor(() => expect(screen.getByText(/локальное распознавание работает здесь/)).toBeTruthy());

    fireEvent.pointerDown(screen.getByRole("button", { name: "Держать и говорить" }));
    await waitFor(() => expect(startRecording).toHaveBeenCalled());
    fireEvent.pointerUp(screen.getByRole("button", { name: "Держать и говорить" }));

    await waitFor(() => {
      expect(screen.getByText(/не открыл порт 8081/)).toBeTruthy();
    });
  });

  it("граница «здесь не проверено» видна до нажатия, а не после (шаг 16)", async () => {
    // Человек имеет право знать, что здесь ещё не проверяли, до того как нажмёт.
    // Иначе первая неудача читается как «приложение сломано», хотя проверять его
    // просто не начинали.
    render(<Voice />);
    await waitFor(() => expect(screen.getByRole("button", { name: /Держать и говорить/ })).toBeTruthy());

    // Пока распознавание не готово — на экране сказано, что проба не проходила.
    expect(screen.getByText(/на этой машине не проверено/)).toBeTruthy();
    // И сказано **до** нажатия: кнопка на месте и не выключена — человек может
    // попробовать, зная границу.
    const button = screen.getByRole("button", { name: /Держать и говорить/ });
    expect((button as HTMLButtonElement).disabled).toBe(false);
  });

  it("«слушаю» и «обрабатываю» различаются не только словом (шаг 52)", async () => {
    // Тот, кто говорит и не смотрит на экран, должен слышать, его очередь или
    // уже нет. Здесь проверяется то, что видно в разметке: цвет и подсказка
    // идут вместе со словом, а не вместо него.
    localStorage.removeItem("zshelper.mic.explained");
    vi.mocked(speechStatus).mockResolvedValue(FOUND);

    render(<Voice />);
    await waitFor(() => expect(screen.getByText(/локальное распознавание работает здесь/)).toBeTruthy());

    // Состояние «не слушаю» — слово есть, звука нет: это покой, а не переход.
    const idle = screen.getByText("не слушаю");
    expect(idle.getAttribute("title")).toBeNull();
    // И у состояния словесное описание для диктора — не только цвет.
    expect(idle.getAttribute("aria-label")).toBeTruthy();
  });

  it("пауза микрофона — одна кнопка туда и обратно (шаг 53)", async () => {
    // Выключить насовсем слишком легко, вернуть — трудно: человек говорит в
    // пустоту и решает, что приложение сломалось.
    localStorage.removeItem("zshelper.mic.explained");
    vi.mocked(speechStatus).mockResolvedValue(FOUND);

    render(<Voice />);
    await waitFor(() => expect(screen.getByText(/локальное распознавание работает здесь/)).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Пауза микрофона" }));

    // Сказано, что микрофон на паузе, что недоговорённое сохранено и как
    // вернуть, — а не просто исчезла иконка.
    expect(screen.getByText(/на паузе, верну через/)).toBeTruthy();
    expect(screen.getByText(/недоговорённое сохранено/)).toBeTruthy();
    // Пауза — это не «выключено»: слово «выключ» только пугает и уводит в
    // настройки. Проверяем именно строку паузы: «выключено» есть в других
    // местах экрана (автозапуск) и к паузе отношения не имеет.
    expect(screen.getByText(/на паузе, верну через/).textContent).not.toMatch(/выключ/i);

    // Возврат — той же самой кнопкой, без ожидания таймера.
    fireEvent.click(screen.getByRole("button", { name: "Вернуть микрофон" }));
    expect(screen.queryByText(/на паузе, верну через/)).toBeNull();
    expect(screen.getByRole("button", { name: "Пауза микрофона" })).toBeTruthy();
    // И снова сказано, что слушаем, а не просто исчезла строчка.
    expect(screen.getByText("не слушаю")).toBeTruthy();
  });

  it("свой словарь: добавил — сразу работает, убрал — убралось (шаг 57)", async () => {
    // «Квартал-3» распознавание не знает, и правка общего словаря не его дело.
    localStorage.removeItem("zshelper.mic.explained");
    localStorage.removeItem("zshelper.asr.words");
    vi.mocked(speechStatus).mockResolvedValue(FOUND);

    render(<Voice />);
    await waitFor(() => expect(screen.getByText(/локальное распознавание работает здесь/)).toBeTruthy());

    // Пустой словарь говорит, что делать, а не молчит.
    expect(screen.getByText(/свой словарь пуст/)).toBeTruthy();

    const field = screen.getByLabelText("Новое слово для словаря");
    fireEvent.change(field, { target: { value: "Квартал-3" } });
    fireEvent.click(screen.getByRole("button", { name: "Добавить" }));

    // Сразу работает: слово в подсказке и сохранено между запусками.
    expect(await screen.findByText(/«Квартал-3» добавлено/)).toBeTruthy();
    expect(screen.getByText(/1 из 50 слов/)).toBeTruthy();
    expect(localStorage.getItem("zshelper.asr.words")).toContain("Квартал-3");

    fireEvent.click(screen.getByRole("button", { name: "Убрать «Квартал-3» из словаря" }));
    expect(await screen.findByText(/«Квартал-3» убрано/)).toBeTruthy();
    expect(screen.getByText(/свой словарь пуст/)).toBeTruthy();
  });

  it("голос выключается одной кнопкой и не врёт про состояние (шаг 59)", async () => {
    // В опенспейсе голос мешает, в наушниках — единственный способ не смотреть
    // на экран. Настройки — место, где ищут и не находят.
    localStorage.removeItem("zshelper.mic.explained");
    vi.mocked(speechStatus).mockResolvedValue(FOUND);

    render(<Voice />);
    await waitFor(() => expect(screen.getByText(/локальное распознавание работает здесь/)).toBeTruthy());

    const button = screen.getByRole("button", { name: "голос включён" });
    // Состояние — словом: значок динамика не читается ни диктором, ни дальтоником.
    expect(button.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(button);
    // Выключенный голос назван «выключен вами» и показывает путь назад.
    expect(
      screen.getByRole("button", { name: "голос выключен вами — нажмите, чтобы включить" }),
    ).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "голос выключен вами — нажмите, чтобы включить" }),
    );
    expect(screen.getByRole("button", { name: "голос включён" })).toBeTruthy();
  });

  it("на экране нет ни квоты, ни счёта (шаг 69)", async () => {
    // Человек, увидев счётчик, начинает считать фразы и говорить короче: он
    // платит вниманием за то, что обещали бесплатно.
    localStorage.removeItem("zshelper.mic.explained");
    vi.mocked(speechStatus).mockResolvedValue(FOUND);

    render(<Voice />);
    await waitFor(() => expect(screen.getByText(/локальное распознавание работает здесь/)).toBeTruthy());

    // Обещание названо, и названы три вещи, которых нет.
    expect(screen.getByText(/ни квоты, ни счёта, ни отправки наружу/)).toBeTruthy();
    // А счётчика — нет: не «не показываем», а нечего показывать.
    const page = document.body.textContent ?? "";
    expect(page).not.toMatch(/осталось \d+ (фраз|запрос)/i);
    expect(page).not.toMatch(/ваш баланс/i);
  });
});

/**
 * Шаг 90: стык «два дела» и «отрицание» проверяется **на экране**, а не только
 * в модулях. Каждое правило по отдельности верно, а вместе они могут дать
 * удаление того, о чём просили не трогать.
 */
describe("стык: два дела и отрицание на экране", () => {
  it("фраза с отрицанием не доходит до исполнения", async () => {
    vi.mocked(draftPlan).mockResolvedValue(null);
    vi.mocked(think).mockResolvedValue(null as never);
    render(<Voice />);
    fireEvent.change(screen.getByLabelText("Услышал"), { target: { value: "не удаляй отчёты" } });
    fireEvent.click(screen.getByRole("button", { name: "Найти" }));

    // Сказано словами, что это запрет, и почему ничего не произошло.
    await waitFor(() => expect(screen.getByText(/не буду: во фразе запрет/)).toBeTruthy());
    expect(screen.getByText(/действие не выполнено/)).toBeTruthy();
  });

  it("фраза из двух дел показывает оба и их порядок", async () => {
    vi.mocked(draftPlan).mockResolvedValue(null);
    vi.mocked(think).mockResolvedValue(null as never);
    render(<Voice />);
    fireEvent.change(screen.getByLabelText("Услышал"), { target: { value: "открой папку и запусти программу" } });
    fireEvent.click(screen.getByRole("button", { name: "Найти" }));

    await waitFor(() => expect(screen.getByLabelText("Услышал")).toBeTruthy());
    // eslint-disable-next-line no-console
    await waitFor(() => expect(screen.getByText(/в фразе 2 дела/)).toBeTruthy());
    // Порядок тот, в котором сказано: первое дело — «открой».
    expect(screen.getByText(/^1\. открой/)).toBeTruthy();
    expect(screen.getByText(/^2\. запусти/)).toBeTruthy();
  });
});
