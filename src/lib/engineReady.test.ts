import { describe, expect, it } from "vitest";
import { installedEngine, isEngineDown } from "./engineReady";
import type { ReadinessStatus } from "../ipc";

function status(partial: Partial<ReadinessStatus>): ReadinessStatus {
  return partial as ReadinessStatus;
}

describe("установленный движок", () => {
  it("отличает «не запущен» от другого отказа", () => {
    expect(isEngineDown("движок не запущен: фраза запустит его сама")).toBe(true);
    expect(isEngineDown("модель не ответила")).toBe(false);
    expect(isEngineDown("нет модели с читаемым заголовком")).toBe(false);
  });

  it("запускает сам только когда оба файла уже на диске", () => {
    expect(installedEngine(null)).toBe("unknown");
    expect(
      installedEngine(status({ engine_found: true, model_present: true, engine_running: true })),
    ).toBe("running");
    expect(
      installedEngine(status({ engine_found: true, model_present: true, engine_running: false })),
    ).toBe("start");
    expect(
      installedEngine(status({ engine_found: true, model_present: false, engine_running: false })),
    ).toBe("missing");
    expect(
      installedEngine(status({ engine_found: false, model_present: true, engine_running: false })),
    ).toBe("missing");
  });
});
