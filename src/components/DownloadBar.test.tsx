// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { DownloadBar, useDownloadProgress, type Progress } from "./DownloadBar";

const mocks = vi.hoisted(() => ({
  status: vi.fn(),
  progress: vi.fn(),
  cancel: vi.fn(),
}));

vi.mock("../ipc", () => ({
  readinessStatus: mocks.status,
  downloadProgress: mocks.progress,
  cancelDownload: mocks.cancel,
}));

function Harness() {
  const progress = useDownloadProgress();
  return <DownloadBar progress={progress} />;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

/**
 * Последнее значение прогресса — ссылкой, а не копией.
 *
 * Счётчик рендеров для этой проверки не годится: `tick()` запускается при
 * монтировании и резолвится в конце очереди микрозадач, поэтому «рендер между
 * первым и вторым тиком» оказывается чужим, и тест падал бы на верном коде.
 * Ссылка же не зависит от того, сколько раз React перерисовал: если состояние не
 * менялось, объект остаётся тем же.
 */
const latest: { value: Progress | null } = { value: null };

function TrackingHarness() {
  const progress = useDownloadProgress();
  latest.value = progress;
  return <DownloadBar progress={progress} />;
}

describe("загрузка видна с любого экрана (шаг 33)", () => {
  it("одни и те же показания — тот же объект, а не новый", async () => {
    // Найденная поломка: на каждый опрос создавался **новый** объект
    // `{ name, bytes }`. React видел изменение и перерисовывал экран раз в
    // секунду; поля ввода при этом пересоздавались и теряли фокус — в e2e входа
    // это выглядело как «element was detached from the DOM»: человек начинал
    // печатать и терял каретку.
    vi.useFakeTimers();
    mocks.status.mockResolvedValue({ download_name: "m.gguf" } as never);
    // `download_progress` отдаёт **число** байтов. Мок с объектом проходил, но
    // сравнивать было нечего — лишний рендер шёл от выдуманного типа.
    mocks.progress.mockResolvedValue(100);

    render(<TrackingHarness />);

    // Даём опросу устояться: до этого момента состояние законно меняется.
    await vi.advanceTimersByTimeAsync(2000);
    const steady = latest.value;
    expect(steady, "прогресс так и не появился").not.toBeNull();
    expect(steady?.name).toBe("m.gguf");

    await vi.advanceTimersByTimeAsync(3000);
    // Тот же объект: `setProgress` вернул прежнее значение, значит React не
    // увидел изменения и перерисовки не было.
    expect(latest.value, "опрос создаёт новое состояние при тех же показаниях").toBe(steady);
  });

  it("без загрузки не рисуется ничего и нет опроса в фоне", async () => {
    vi.useFakeTimers();
    mocks.status.mockResolvedValue({ download_name: null } as never);

    const { unmount } = render(<Harness />);
    // Первый тик сказал «качать нечего» — таймер снят.
    await vi.waitFor(() => expect(mocks.status).toHaveBeenCalledTimes(1));

    await vi.advanceTimersByTimeAsync(5000);
    // Простой не стоит ничего: шаг 384 — фоновая работа без дела запрещена.
    expect(mocks.status).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("status")).toBeNull();
    unmount();
  });

  it("во время загрузки назван файл и есть отмена", async () => {
    mocks.status.mockResolvedValue({ download_name: "Qwen2.5-1.5B.gguf" } as never);
    mocks.progress.mockResolvedValue(40 * 1024 * 1024);

    render(<Harness />);

    // Имя файла — а не «идёт загрузка»: иначе человек не знает, что качается.
    await waitFor(() => expect(screen.getByText(/Qwen2\.5-1\.5B\.gguf/)).toBeTruthy());
    expect(screen.getByText(/40 МБ/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Отменить" })).toBeTruthy();
  });

  it("размер неизвестен — сказано «качаю», без выдуманных нулей", async () => {
    mocks.status.mockResolvedValue({ download_name: "модель.gguf" } as never);
    mocks.progress.mockResolvedValue(null);

    render(<Harness />);
    await waitFor(() => expect(screen.getByText("качаю модель.gguf")).toBeTruthy());
    // «0 МБ» было бы утверждением о прогрессе, которого нет.
    expect(screen.queryByText(/0 МБ/)).toBeNull();
  });

  it("статус не прочитался — полоска молчит, а не падает", async () => {
    mocks.status.mockRejectedValue(new Error("нет связи с ядром"));

    render(<Harness />);
    await waitFor(() => expect(mocks.status).toHaveBeenCalled());
    expect(screen.queryByRole("status")).toBeNull();
  });
});
