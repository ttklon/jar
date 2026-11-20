// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { assessReadiness, formatSize, hasRoom, planPrepare } from "./readiness";
import type { ReadinessStatus } from "../ipc";

/**
 * Готовность — это правило, а не украшение карточки: пустая установка, настроенная
 * машина, частичные состояния и браузер должны давать разные честные ответы.
 */

function status(partial: Partial<ReadinessStatus> = {}): ReadinessStatus {
  return {
    download_name: null,
    runtime_managed: false,
    runtime_supported: true,
    engine_found: false,
    engine_running: false,
    engine_program: null,
    engine_search_dir: "sidecars",
    model_present: false,
    model_name: null,
    model_bytes: 0,
    models_dir: "models",
    free_bytes: null,
    speech_found: false,
    speech_model: null,
    speech_search_dir: "sidecars",
    speech_runtime_managed: false,
    speech_runtime_spec: {
      id: "w",
      title: "whisper.cpp (Windows x64, CPU)",
      asset: "whisper-bin-x64.zip",
      url: "https://example.com/whisper-bin-x64.zip",
      sha256: "c".repeat(64),
      bytes: 8928640,
      license: "MIT",
      source: "тест",
      program: "whisper-server.exe",
      description: "тест",
    },
    speech_model_spec: {
      id: "wm",
      title: "Whisper base (многоязычная)",
      file: "ggml-base.bin",
      url: "https://example.com/ggml-base.bin",
      sha256: "d".repeat(64),
      bytes: 147951465,
      license: "MIT",
      source: "тест",
      min_ram_gb: 4,
      description: "тест",
    },
    model_spec: {
      id: "m",
      title: "Модель",
      file: "m.gguf",
      url: "https://example.com/m.gguf",
      sha256: "a".repeat(64),
      bytes: 986048768,
      license: "Apache-2.0",
      source: "тест",
      min_ram_gb: 4,
      description: "тест",
    },
    runtime_spec: {
      id: "r",
      title: "Движок",
      asset: "r.zip",
      url: "https://example.com/r.zip",
      sha256: "b".repeat(64),
      bytes: 25696689,
      license: "MIT",
      source: "тест",
      program: "llama-server.exe",
      description: "тест",
    },
    ready: false,
    missing: ["engine", "model"],
    ...partial,
  };
}

describe("оценка готовности", () => {
  it("пустая установка: не хватает и движка, и модели", () => {
    const assessment = assessReadiness(status());
    expect(assessment.ready).toBe(false);
    expect(assessment.missing).toEqual(["engine", "model"]);
  });

  it("настроенная машина: готово", () => {
    const assessment = assessReadiness(
      status({ engine_found: true, model_present: true }),
    );
    expect(assessment.ready).toBe(true);
    expect(assessment.missing).toEqual([]);
  });

  it("только движок: не хватает модели", () => {
    const assessment = assessReadiness(status({ engine_found: true }));
    expect(assessment.ready).toBe(false);
    expect(assessment.missing).toEqual(["model"]);
  });

  it("только модель: не хватает движка", () => {
    const assessment = assessReadiness(status({ model_present: true }));
    expect(assessment.ready).toBe(false);
    expect(assessment.missing).toEqual(["engine"]);
  });

  it("локальное распознавание для первого разговора необязательно", () => {
    const assessment = assessReadiness(
      status({ engine_found: true, model_present: true }),
    );
    expect(assessment.ready).toBe(true);
    expect(assessment.speechLocal).toBe(false);
    expect(assessment.speechMissing).toEqual(["speech-engine", "speech-model"]);
  });

  it("локальное распознавание видно отдельно", () => {
    const assessment = assessReadiness(
      status({
        engine_found: true,
        model_present: true,
        speech_found: true,
        speech_model: "ggml-base.bin",
      }),
    );
    expect(assessment.speechLocal).toBe(true);
    expect(assessment.speechMissing).toEqual([]);
  });

  it("движок без модели распознавания — не локальный голос", () => {
    const assessment = assessReadiness(
      status({ speech_found: true, speech_model: null }),
    );
    expect(assessment.speechLocal).toBe(false);
    expect(assessment.speechMissing).toEqual(["speech-model"]);
  });

  it("модель без движка распознавания — тоже не локальный голос", () => {
    const assessment = assessReadiness(
      status({ speech_found: false, speech_model: "ggml-base.bin" }),
    );
    expect(assessment.speechLocal).toBe(false);
    expect(assessment.speechMissing).toEqual(["speech-engine"]);
  });
});

describe("размер и место", () => {
  it("форматирует размеры человеческим языком", () => {
    expect(formatSize(986048768)).toBe("940 МБ");
    expect(formatSize(25696689)).toBe("25 МБ");
    expect(formatSize(512)).toBe("512 Б");
  });

  it("одним заходом качает обязательное и речь, а движок запускает только последним шагом", () => {
    const plan = planPrepare(status(), true);
    expect(plan.block).toBeNull();
    expect(plan.steps).toEqual(["runtime", "model", "speech-runtime", "speech-model", "smoke"]);
    expect(plan.bytes).toBe(986048768 + 25696689 + 8928640 + 147951465);
  });

  it("без отметки речи не качает whisper и всё равно проверяет разговор", () => {
    const plan = planPrepare(status(), false);
    expect(plan.steps).toEqual(["runtime", "model", "smoke"]);
    expect(plan.speechSkipped).toBeNull();
  });

  it("нехватка места на речь не отменяет разговор", () => {
    const plan = planPrepare(
      status({ free_bytes: 986048768 + 25696689 + 1000 }),
      true,
    );
    expect(plan.block).toBeNull();
    expect(plan.steps).toEqual(["runtime", "model", "smoke"]);
    expect(plan.speechSkipped).toBe("no-room");
  });

  it("нехватка места на модель отменяет весь заход, а не качает движок молча", () => {
    const plan = planPrepare(status({ free_bytes: 30_000_000 }), true);
    expect(plan.block).toBe("no-room");
    expect(plan.steps).toEqual([]);
  });

  it("чужой каталог движка одним заходом не перезаписывается", () => {
    const plan = planPrepare(status({ runtime_managed: true }), true);
    expect(plan.block).toBe("runtime-owned");
    expect(plan.steps).toEqual([]);
  });

  it("нехватка места видит, неизвестное — не блокирует", () => {
    expect(hasRoom(100, 1000)).toBe(false);
    expect(hasRoom(2000, 1000)).toBe(true);
    expect(hasRoom(null, 1000)).toBe(true);
  });
});
