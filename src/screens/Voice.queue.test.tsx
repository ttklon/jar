// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  cancelTool,
  declarePresence,
  draftPlan,
  machineState,
  planFor,
  readinessStatus,
  requestLearning,
  runPlan,
  smokeCheck,
  think,
  uiDump,
  foregroundWindow,
} from "../ipc";
import { readinessFacts } from "./readinessFixture";
import { Voice } from "./Voice";

/**
 * Очередь на экране: несколько дел подряд, пока человек не скажет «стоп».
 *
 * Проверяется главное: очередь идёт сама только когда человек отошёл, не исполняет без
 * него того, что требует его слова, и умеет остановиться.
 */

vi.mock("../ipc", () => ({
  readinessStatus: vi.fn().mockRejectedValue(new Error("статус недоступен в этом тесте")),
  isTauri: () => true,
  planFor: vi.fn().mockResolvedValue([]),
  draftPlan: vi.fn().mockResolvedValue(null),
  requestLearning: vi.fn().mockResolvedValue(null),
  facts: vi.fn().mockResolvedValue([]),
  think: vi.fn().mockResolvedValue(null),
  smokeCheck: vi.fn(),
  cancelTool: vi.fn().mockResolvedValue(undefined),
  uiDump: vi.fn().mockRejectedValue(new Error("нет UI Automation")),
  declarePresence: vi.fn(),
  machineState: vi.fn().mockResolvedValue({
    sample: { cpu_percent: 10, ram_free_mb: 9_000, ram_total_mb: 16_384, idle_seconds: 900 },
    budget: { parallel: 3, mode: "away" as const, reason: "человек отошёл", may_start: true },
    available: true,
    note: "машина измеряется честно",
    declared: null,
  }),
  draftHand: vi.fn(),
  trialHand: vi.fn(),
  speak: vi.fn(),
  modelPrompt: vi.fn().mockResolvedValue(""),
  rememberFact: vi.fn().mockResolvedValue(undefined),
  runPlan: vi.fn(),
  setVoiceTrayStatus: vi.fn().mockResolvedValue(undefined),
  speechStatus: vi.fn().mockResolvedValue({
    found: false,
    program: null,
    model: null,
    search_dir: "C:\\Program Files\\jar",
    models_dir: "C:\\Program Files\\jar\\models",
  }),
  foregroundWindow: vi.fn().mockResolvedValue({
    title: "Видео — браузер",
    process: "chrome.exe",
    pid: 4321,
  }),
  isolationStatus: vi.fn().mockResolvedValue({ available: true, summary: "", note: "" }),
  transcribeLocal: vi.fn(),
}));

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverStub);

const away = {
  sample: { cpu_percent: 10, ram_free_mb: 9_000, ram_total_mb: 16_384, idle_seconds: 900 },
  budget: { parallel: 3, mode: "away" as const, reason: "человек отошёл", may_start: true },
  available: true,
  note: "машина измеряется честно",
  declared: null,
};

const safePlan = {
  plan: { goal: "убавить громкость", steps: [{ registry: "звук|убавить|громкость", params: {} }] },
  problems: [],
  gates: [],
  questions: [],
};

const needsWord = {
  ...safePlan,
  gates: [
    {
      position: 1,
      registry: "файлы|удалить|папка",
      decision: "confirm" as const,
      risk: "destructive",
      wants_approval: true,
    },
  ],
};

afterEach(() => {
  cleanup();
  vi.mocked(draftPlan).mockReset().mockResolvedValue(null);
  vi.mocked(runPlan).mockReset();
  vi.mocked(machineState).mockReset().mockResolvedValue(away as never);
  vi.mocked(planFor).mockReset().mockResolvedValue([]);
  vi.mocked(think).mockReset().mockResolvedValue(null as never);
  vi.mocked(smokeCheck).mockReset();
  vi.mocked(cancelTool).mockReset().mockResolvedValue(undefined);
  vi.mocked(readinessStatus).mockReset().mockRejectedValue(new Error("статус недоступен в этом тесте"));
  vi.mocked(declarePresence).mockReset();
  vi.mocked(requestLearning).mockReset().mockResolvedValue(null);
  vi.mocked(uiDump).mockReset().mockRejectedValue(new Error("нет UI Automation"));
  vi.mocked(machineState).mockReset().mockResolvedValue(away as never);
  vi.mocked(foregroundWindow).mockReset().mockResolvedValue({
    title: "Видео — браузер",
    process: "chrome.exe",
    pid: 4321,
  } as never);
});

/** Очередь набирается тем же полем, которым человек говорит. */
function addToQueue(phrase: string) {
  fireEvent.change(screen.getByLabelText("Услышал"), { target: { value: phrase } });
  fireEvent.click(screen.getByText("В очередь"));
}

describe("очередь дел на экране", () => {
  it("человек отошёл — очередь идёт сама: простое исполняет, на требующем слова встаёт", async () => {
    vi.mocked(draftPlan).mockResolvedValueOnce(safePlan as never).mockResolvedValueOnce(needsWord as never);
    vi.mocked(runPlan).mockResolvedValue({
      goal: "убавить громкость",
      steps: [
        {
          position: 1,
          registry: "звук|убавить|громкость",
          status: "ok",
          reason: "сделано",
          evidence: "system",
          duration_ms: 5,
        },
      ],
      stopped: null,
      run_id: 1,
    } as never);

    render(<Voice onOpen={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Сейчас перед вами/)).toBeTruthy());

    addToQueue("убавить громкость");
    addToQueue("удалить папку");

    fireEvent.click(screen.getByText("Работать без меня"));

    // Первое дело исполнено без человека — это и есть очередь.
    await waitFor(() => expect(vi.mocked(runPlan)).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText(/готово · убавить громкость/)).toBeTruthy());

    // Второе требует подтверждения: не исполнено, а помечено «нужно ваше слово».
    expect(screen.getByText(/нужно ваше слово · удалить папку/)).toBeTruthy();
    expect(vi.mocked(runPlan)).toHaveBeenCalledTimes(1);
  });

  it("дело «нужно ваше слово» берётся в руки с этого же экрана и убирается", async () => {
    vi.mocked(draftPlan).mockResolvedValueOnce(safePlan as never).mockResolvedValueOnce(needsWord as never);
    vi.mocked(runPlan).mockResolvedValue({
      goal: "убавить громкость",
      steps: [
        {
          position: 1,
          registry: "звук|убавить|громкость",
          status: "ok",
          reason: "сделано",
          evidence: "system",
          duration_ms: 5,
        },
      ],
      stopped: null,
      run_id: 1,
    } as never);

    render(<Voice onOpen={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Сейчас перед вами/)).toBeTruthy());

    addToQueue("убавить громкость");
    addToQueue("удалить папку");
    fireEvent.click(screen.getByText("Работать без меня"));

    await waitFor(() => expect(screen.getByText(/нужно ваше слово · удалить папку/)).toBeTruthy());

    // «Взять в руки» возвращает фразу в поле: её не нужно набирать заново.
    fireEvent.click(screen.getByRole("button", { name: "Взять в руки" }));
    expect((screen.getByLabelText("Услышал") as HTMLInputElement).value).toBe("удалить папку");
    expect(screen.getByText(/снова ждёт: фраза разберётся заново/)).toBeTruthy();
    // И дело снова ждёт, а не висит отложенным.
    await waitFor(() => expect(screen.getByText(/ждёт · удалить папку/)).toBeTruthy());

    // «Убрать» убирает ждущее дело из очереди совсем.
    fireEvent.click(screen.getByRole("button", { name: "Убрать" }));
    await waitFor(() => expect(screen.queryByText(/ждёт · удалить папку/)).toBeNull());
    expect(screen.getByText(/готово · убавить громкость/)).toBeTruthy();
  });

  it("два дела без окон идут одновременно, а не по очереди", async () => {
    vi.mocked(draftPlan).mockResolvedValue(safePlan as never);

    // Запуск, который висит, пока его не отпустят: так видно, ждёт ли второе дело первого.
    const releases: Array<() => void> = [];
    vi.mocked(runPlan).mockImplementation(
      () =>
        new Promise((resolve) => {
          releases.push(() =>
            resolve({
              goal: "убавить громкость",
              steps: [
                {
                  position: 1,
                  registry: "звук|убавить|громкость",
                  status: "ok",
                  reason: "сделано",
                  evidence: "system",
                  duration_ms: 5,
                },
              ],
              stopped: null,
              run_id: 1,
            } as never),
          );
        }),
    );

    render(<Voice onOpen={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Сейчас перед вами/)).toBeTruthy());

    addToQueue("убавить громкость");
    addToQueue("проверить свободное место");
    fireEvent.click(screen.getByText("Работать без меня"));

    // Оба дела уже в работе: второй запуск не ждёт первого.
    await waitFor(() => expect(vi.mocked(runPlan)).toHaveBeenCalledTimes(2));
    expect(screen.getAllByText(/^делаю · /).length).toBe(2);

    releases.forEach((release) => release());
    await waitFor(() => expect(screen.getAllByText(/готово · /).length).toBe(2));
  });

  it("два дела в одно окно одновременно не идут: второе честно ждёт", async () => {
    const screenPlan = {
      plan: {
        goal: "нажать",
        steps: [{ registry: "apps-windows|нажать|кнопку", params: { name: "Войти" } }],
      },
      problems: [],
      gates: [],
      questions: [],
    };
    vi.mocked(draftPlan).mockResolvedValue(screenPlan as never);

    const releases: Array<() => void> = [];
    vi.mocked(runPlan).mockImplementation(
      () =>
        new Promise((resolve) => {
          releases.push(() =>
            resolve({ goal: "нажать", steps: [], stopped: null, run_id: 1 } as never),
          );
        }),
    );

    render(<Voice onOpen={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Сейчас перед вами/)).toBeTruthy());

    addToQueue("нажать войти");
    addToQueue("нажать готово");
    fireEvent.click(screen.getByText("Работать без меня"));

    await waitFor(() => expect(vi.mocked(runPlan)).toHaveBeenCalledTimes(1));
    // Второе не запущено: одновременно в окно нельзя.
    expect(vi.mocked(runPlan)).toHaveBeenCalledTimes(1);

    releases.forEach((release) => release());
    await waitFor(() => expect(vi.mocked(runPlan)).toHaveBeenCalledTimes(2));
  });

  it("человек вернулся — очередь новые дела не начинает", async () => {
    vi.mocked(machineState).mockResolvedValue({
      ...away,
      budget: { parallel: 3, mode: "near" as const, reason: "человек за машиной", may_start: true },
    } as never);

    render(<Voice onOpen={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Сейчас перед вами/)).toBeTruthy());

    addToQueue("убавить громкость");
    fireEvent.click(screen.getByText("Работать без меня"));

    await waitFor(() => expect(screen.getByText(/чтобы не мешать/)).toBeTruthy());
    expect(vi.mocked(runPlan)).not.toHaveBeenCalled();
  });

  it("стоп во время ожидания проверки очереди не запускает поздно проверенное дело", async () => {
    let resolveDraft!: (value: typeof safePlan) => void;
    vi.mocked(draftPlan).mockReturnValueOnce(new Promise((resolve) => { resolveDraft = resolve as (value: typeof safePlan) => void; }));

    render(<Voice onOpen={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Сейчас перед вами/)).toBeTruthy());
    addToQueue("убавить громкость");
    fireEvent.click(screen.getByText("Работать без меня"));
    await waitFor(() => expect(draftPlan).toHaveBeenCalledWith("убавить громкость"));

    fireEvent.click(screen.getByText("Стоп"));
    resolveDraft(safePlan);

    await waitFor(() => expect(screen.getByText(/остановлено вами/)).toBeTruthy());
    expect(runPlan).not.toHaveBeenCalled();
  });

  it("стоп во время опроса ресурсов не запускает дело после ответа системы", async () => {
    let resolveMachine!: (value: typeof away) => void;
    vi.mocked(machineState).mockReturnValueOnce(new Promise((resolve) => { resolveMachine = resolve as (value: typeof away) => void; }));

    render(<Voice onOpen={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Сейчас перед вами/)).toBeTruthy());
    addToQueue("убавить громкость");
    fireEvent.click(screen.getByText("Работать без меня"));
    await waitFor(() => expect(machineState).toHaveBeenCalled());

    fireEvent.click(screen.getByText("Стоп"));
    resolveMachine(away);

    await waitFor(() => expect(screen.getByText(/остановлено вами/)).toBeTruthy());
    expect(runPlan).not.toHaveBeenCalled();
  });

  it("«стоп» останавливает то, что ещё не начиналось", async () => {
    render(<Voice onOpen={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Сейчас перед вами/)).toBeTruthy());

    addToQueue("первое дело");
    addToQueue("второе дело");
    fireEvent.click(screen.getByText("Стоп"));

    await waitFor(() => expect(screen.getAllByText(/остановлено · /).length).toBe(2));
    expect(vi.mocked(runPlan)).not.toHaveBeenCalled();
  });

  it("цель не закрыта — очередь спрашивает модель, что дальше, и продолжает делами", async () => {
    const splitThought = {
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
    };

    const nextThought = {
      prompt: "…",
      answer: "…",
      proposal: {
        Next: {
          goal: "наведи порядок в загрузках",
          done: false,
          deeds: ["проверь, что осталось в загрузках"],
          why: "старые установщики ещё там",
        },
      },
      plan: null,
      learning: null,
      deeds: ["проверь, что осталось в загрузках"],
      problem: null,
    };

    vi.mocked(draftPlan).mockResolvedValue(safePlan as never);
    vi.mocked(runPlan).mockResolvedValue({
      goal: "найди дубликаты в загрузках",
      steps: [
        {
          position: 1,
          registry: "звук|убавить|громкость",
          status: "ok",
          reason: "сделано",
          evidence: "system",
          duration_ms: 5,
        },
      ],
      stopped: null,
      run_id: 1,
    } as never);

    // Первый ответ — разложение, второй — продолжение, дальше модель молчит:
    // очередь не должна придумывать дела за неё.
    vi.mocked(think)
      .mockResolvedValue(null as never)
      .mockResolvedValueOnce(splitThought as never)
      .mockResolvedValueOnce(nextThought as never);

    render(<Voice onOpen={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Сейчас перед вами/)).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Услышал"), {
      target: { value: "наведи порядок в загрузках" },
    });
    fireEvent.click(screen.getByText("Спросить модель"));
    await waitFor(() => expect(screen.getByText(/разложил/)).toBeTruthy());

    fireEvent.click(screen.getByText("Поставить все в очередь"));
    fireEvent.click(screen.getByText("Работать без меня"));

    // Два дела из разложения и одно из продолжения — очередь не остановилась на первом.
    await waitFor(() => expect(vi.mocked(runPlan)).toHaveBeenCalledTimes(3));

    expect(vi.mocked(think).mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(vi.mocked(think).mock.calls[1]?.[0]).toContain("Цель: «наведи порядок в загрузках»");

    // Счёт по цели и потолок в час видны на экране, а не подразумеваются.
    await waitFor(() =>
      expect(screen.getByText(/цель «наведи порядок в загрузках»: сделано 3/)).toBeTruthy(),
    );

    // Петля считает круги, а не время: три удачных круга — это видно и проверяемо.
    await waitFor(() =>
      expect(
        screen.getByText(
          /цель «наведи порядок в загрузках»: кругов 3, из них сделано 3 — последний сделан/,
        ),
      ).toBeTruthy(),
    );
    expect(screen.getByText(/за этот час сам начал 3 из 12/)).toBeTruthy();

    // Модель промолчала про продолжение — так и сказано, а не «всё сделано».
    await waitFor(() =>
      expect(screen.getByText(/модель не сказала, что делать дальше/)).toBeTruthy(),
    );
  });

  it("очереди нужен движок, а файлов нет — это не «модель промолчала» и не скачивание", async () => {
    vi.mocked(draftPlan).mockResolvedValue(safePlan as never);
    vi.mocked(runPlan).mockResolvedValue({
      goal: "найди дубликаты в загрузках",
      steps: [
        {
          position: 1,
          registry: "звук|убавить|громкость",
          status: "ok",
          reason: "сделано",
          evidence: "system",
          duration_ms: 5,
        },
      ],
      stopped: null,
      run_id: 1,
    } as never);
    vi.mocked(readinessStatus).mockResolvedValue(readinessFacts());
    vi.mocked(think)
      .mockResolvedValue(null as never)
      .mockResolvedValueOnce({
        prompt: "…",
        answer: "…",
        proposal: {
          Split: {
            goal: "наведи порядок в загрузках",
            deeds: ["найди дубликаты в загрузках"],
            why: "одна работа",
          },
        },
        plan: null,
        learning: null,
        deeds: ["найди дубликаты в загрузках"],
        problem: null,
      } as never)
      .mockRejectedValueOnce(new Error("движок не запущен"));

    render(<Voice onOpen={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Сейчас перед вами/)).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Услышал"), {
      target: { value: "наведи порядок в загрузках" },
    });
    fireEvent.click(screen.getByText("Спросить модель"));
    await waitFor(() => expect(screen.getByText(/разложил/)).toBeTruthy());
    fireEvent.click(screen.getByText("Поставить все в очередь"));
    fireEvent.click(screen.getByText("Работать без меня"));

    await waitFor(() => expect(screen.getAllByText(/Само ничего не скачиваю/).length).toBeGreaterThan(0));
    expect(vi.mocked(smokeCheck)).not.toHaveBeenCalled();
    expect(screen.queryByText(/модель не сказала, что делать дальше/)).toBeNull();
  });

  it("дело по цели не сделалось — очередь просит одну поправку, а не придумывает новые", async () => {
    vi.mocked(draftPlan).mockResolvedValue(safePlan as never);
    vi.mocked(runPlan).mockResolvedValue({
      goal: "найди дубликаты в загрузках",
      steps: [],
      stopped: "шаг 1: нет доступа",
      run_id: 1,
    } as never);

    vi.mocked(think).mockResolvedValue({
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
    } as never);

    render(<Voice onOpen={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Сейчас перед вами/)).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Услышал"), {
      target: { value: "наведи порядок в загрузках" },
    });
    fireEvent.click(screen.getByText("Спросить модель"));
    await waitFor(() => expect(screen.getByText(/разложил/)).toBeTruthy());

    fireEvent.click(screen.getByText("Поставить все в очередь"));
    fireEvent.click(screen.getByText("Работать без меня"));

    // Оба дела не сделались. Каждое получило по одной повторной попытке (пустая
    // неудача), и это предел: два дела × две попытки.
    await waitFor(() => expect(vi.mocked(runPlan)).toHaveBeenCalledTimes(4));
    await waitFor(() => expect(screen.getAllByText(/попыток уже 2/).length).toBe(2));

    // Второй вопрос к модели — про поправку, а не про «что улучшить дальше»: в нём видно,
    // что именно не сделалось.
    await waitFor(() => expect(vi.mocked(think)).toHaveBeenCalledTimes(2));
    expect(vi.mocked(think).mock.calls[1]?.[0]).toContain("не удался");
    expect(vi.mocked(think).mock.calls[1]?.[0]).toContain("найди дубликаты в загрузках");

    // Модель ответила не поправкой — так и сказано, и новых дел не появилось.
    await waitFor(() => expect(screen.getByText(/модель ответила не продолжением/)).toBeTruthy());
    expect(vi.mocked(runPlan)).toHaveBeenCalledTimes(4);
  });

  it("поправка тоже не помогла — петля останавливается и говорит об этом", async () => {
    vi.mocked(draftPlan).mockResolvedValue(safePlan as never);
    vi.mocked(runPlan).mockResolvedValue({
      goal: "найди дубликаты в загрузках",
      steps: [],
      stopped: "шаг 1: нет доступа",
      run_id: 1,
    } as never);

    const split = {
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
    };

    // Первый вопрос — разложение на дела, второй — поправка сбоя. Третьего быть не должно:
    // поправка уже потрачена, и повторять её — долбёжка, а не усердие.
    const fix = {
      prompt: "…",
      answer: "…",
      proposal: {
        Next: {
          goal: "наведи порядок в загрузках",
          deeds: ["проверь доступ к папке загрузок"],
          done: false,
          why: "мешает доступ",
        },
      },
      plan: null,
      learning: null,
      deeds: ["проверь доступ к папке загрузок"],
      problem: null,
    };

    vi.mocked(think)
      .mockResolvedValueOnce(split as never)
      .mockResolvedValue(fix as never);

    render(<Voice onOpen={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Сейчас перед вами/)).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Услышал"), {
      target: { value: "наведи порядок в загрузках" },
    });
    fireEvent.click(screen.getByText("Спросить модель"));
    await waitFor(() => expect(screen.getByText(/разложил/)).toBeTruthy());

    fireEvent.click(screen.getByText("Поставить все в очередь"));
    fireEvent.click(screen.getByText("Работать без меня"));

    // Два дела по две попытки и одно дело-поправка по две попытки.
    await waitFor(() => expect(vi.mocked(runPlan)).toHaveBeenCalledTimes(6));
    await waitFor(() =>
      expect(screen.getByText(/поправка тоже — топчемся на месте/)).toBeTruthy(),
    );

    // Третий вопрос к модели не задан: петля остановилась сама и сказала почему.
    expect(vi.mocked(think)).toHaveBeenCalledTimes(2);
  });

  it("с первого раза ничего не сделалось — очередь пробует ещё раз, и это видно", async () => {
    vi.mocked(draftPlan).mockResolvedValue(safePlan as never);

    const okReport = {
      goal: "убавить громкость",
      steps: [
        {
          position: 1,
          registry: "звук|убавить|громкость",
          status: "ok",
          reason: "сделано",
          evidence: "system",
          duration_ms: 5,
        },
      ],
      stopped: null,
      run_id: 1,
    };

    vi.mocked(runPlan)
      // Первый раз — пустая неудача: ни один шаг не сделался, значит повторять нечего бояться.
      .mockResolvedValueOnce({
        goal: "убавить громкость",
        steps: [],
        stopped: "шаг 1: окно не открылось",
        run_id: 1,
      } as never)
      .mockResolvedValueOnce(okReport as never);

    render(<Voice onOpen={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Сейчас перед вами/)).toBeTruthy());

    addToQueue("убавить громкость");
    fireEvent.click(screen.getByText("Работать без меня"));

    await waitFor(() => expect(vi.mocked(runPlan)).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByText(/готово · убавить громкость/)).toBeTruthy());
  });

  it("хоть что-то сделалось — второй раз не пробуем, чтобы не сделать дважды", async () => {
    vi.mocked(draftPlan).mockResolvedValue(safePlan as never);
    vi.mocked(runPlan).mockResolvedValue({
      goal: "убавить громкость",
      steps: [
        {
          position: 1,
          registry: "звук|убавить|громкость",
          status: "ok",
          reason: "сделано",
          evidence: "system",
          duration_ms: 5,
        },
        {
          position: 2,
          registry: "звук|убавить|громкость",
          status: "failed",
          reason: "нет доступа",
          evidence: "system",
          duration_ms: 5,
        },
      ],
      stopped: "шаг 2: нет доступа",
      run_id: 1,
    } as never);

    render(<Voice onOpen={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Сейчас перед вами/)).toBeTruthy());

    addToQueue("убавить громкость");
    fireEvent.click(screen.getByText("Работать без меня"));

    await waitFor(() => expect(screen.getByText(/1 шаг уже сделано — второй прогон/)).toBeTruthy());
    expect(vi.mocked(runPlan)).toHaveBeenCalledTimes(1);
  });

  it("«стоп по цели» останавливает одну работу, а другую — нет", async () => {
    vi.mocked(think).mockResolvedValue({
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
    } as never);

    render(<Voice onOpen={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Сейчас перед вами/)).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Услышал"), {
      target: { value: "наведи порядок в загрузках" },
    });
    fireEvent.click(screen.getByText("Спросить модель"));
    await waitFor(() => expect(screen.getByText(/разложил/)).toBeTruthy());

    // Вторая работа человека — не часть этой цели, и «стоп по цели» её не касается.
    fireEvent.change(screen.getByLabelText("Услышал"), { target: { value: "убавить громкость" } });
    fireEvent.click(screen.getByText("В очередь"));
    fireEvent.click(screen.getByText("Поставить все в очередь"));

    await waitFor(() => expect(screen.getAllByText(/^ждёт · /).length).toBe(3));

    fireEvent.click(screen.getByText("Стоп по цели"));

    await waitFor(() => expect(screen.getAllByText(/^остановлено · /).length).toBe(2));
    expect(screen.getByText(/^ждёт · убавить громкость/)).toBeTruthy();
    expect(screen.getByText(/цель «наведи порядок в загрузках» остановлена вами/)).toBeTruthy();
    expect(vi.mocked(runPlan)).not.toHaveBeenCalled();
  });

  it("модель говорит «цель закрыта» — рядом виден экран, а не только слова", async () => {
    const splitThought = {
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
    };

    vi.mocked(draftPlan).mockResolvedValue(safePlan as never);
    vi.mocked(runPlan).mockResolvedValue({
      goal: "найди дубликаты в загрузках",
      steps: [
        {
          position: 1,
          registry: "звук|убавить|громкость",
          status: "ok",
          reason: "сделано",
          evidence: "system",
          duration_ms: 5,
        },
      ],
      stopped: null,
      run_id: 1,
    } as never);

    vi.mocked(think)
      .mockResolvedValue(null as never)
      .mockResolvedValueOnce(splitThought as never)
      .mockResolvedValueOnce({
        prompt: "…",
        answer: "…",
        proposal: {
          Next: {
            goal: "наведи порядок в загрузках",
            done: true,
            deeds: [],
            why: "дубликатов не осталось",
          },
        },
        plan: null,
        learning: null,
        deeds: null,
        problem: null,
      } as never);

    // Экран читается честно: вот он. Это не проверка, а взгляд — решает человек.
    vi.mocked(uiDump).mockResolvedValue({
      title: "Загрузки — проводник",
      process: "explorer.exe",
      elements: [],
      truncated: false,
      note: "прочитано UI Automation",
      text: "Папка Загрузки\nФайлов: 12",
    } as never);

    render(<Voice onOpen={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Сейчас перед вами/)).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Услышал"), {
      target: { value: "наведи порядок в загрузках" },
    });
    fireEvent.click(screen.getByText("Спросить модель"));
    await waitFor(() => expect(screen.getByText(/разложил/)).toBeTruthy());

    fireEvent.click(screen.getByText("Поставить все в очередь"));
    fireEvent.click(screen.getByText("Работать без меня"));

    await waitFor(() =>
      expect(
        screen.getByText(/модель считает, что цель «наведи порядок в загрузках» закрыта/),
      ).toBeTruthy(),
    );
    // И рядом — то, что видно: слова модели отдельно, экран отдельно.
    await waitFor(() => expect(screen.getByText(/Файлов: 12/)).toBeTruthy());
    expect(screen.getByText(/проверить можете только вы/)).toBeTruthy();
  });
});
