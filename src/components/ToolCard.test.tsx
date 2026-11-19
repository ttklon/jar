// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ToolView } from "../ipc";
import { ToolCard } from "./ToolCard";

/**
 * Проверяется одно поведение: приложение не заставляет вводить один и тот же путь
 * каждый раз. Память подставляет параметры прошлого удачного запуска.
 */

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverStub);

afterEach(cleanup);

function tool(patch: Partial<ToolView> = {}): ToolView {
  return {
    registry: "files|создать|папку",
    title: "Создать папку",
    summary: "Создаёт папку",
    implementation: "fs.create_dir_all",
    params: [
      { name: "path", label: "Путь", placeholder: "C:\\tmp", hint: "", required: true },
    ],
    risk: "write-local",
    risk_needs_human: true,
    decision: "confirm",
    decision_reason: "изменение в локальной папке",
    needs_token: true,
    last_params: null,
    ...patch,
  };
}

describe("ToolCard", () => {
  it("подставляет параметры прошлого удачного запуска", () => {
    render(<ToolCard tool={tool({ last_params: { path: "C:\\Users\\Имя\\Downloads" } })} />);

    const input = screen.getByPlaceholderText("C:\\tmp") as HTMLInputElement;
    expect(input.value).toBe("C:\\Users\\Имя\\Downloads");
    expect(screen.getByText(/Параметры подставлены из прошлого удачного запуска/)).toBeTruthy();
  });

  it("без памяти поля остаются пустыми", () => {
    render(<ToolCard tool={tool()} />);

    const input = screen.getByPlaceholderText("C:\\tmp") as HTMLInputElement;
    expect(input.value).toBe("");
    expect(screen.queryByText(/подставлены из прошлого/)).toBeNull();
  });
});
