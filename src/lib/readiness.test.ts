// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { assessReadiness, formatSize, hasRoom } from "./readiness";
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
  });

  it("движок без модели распознавания — не локальный голос", () => {
    const assessment = assessReadiness(
      status({ speech_found: true, speech_model: null }),
    );
    expect(assessment.speechLocal).toBe(false);
  });
});

describe("размер и место", () => {
  it("форматирует размеры человеческим языком", () => {
    expect(formatSize(986048768)).toBe("940 МБ");
    expect(formatSize(25696689)).toBe("25 МБ");
    expect(formatSize(512)).toBe("512 Б");
  });

  it("нехватку места видит, неизвестное — не блокирует", () => {
    expect(hasRoom(100, 1000)).toBe(false);
    expect(hasRoom(2000, 1000)).toBe(true);
    expect(hasRoom(null, 1000)).toBe(true);
  });
});
