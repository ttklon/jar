// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { models, readiness } from "../i18n/ru";
import { NetworkCard } from "./NetworkCard";

/**
 * Шаг 346: диагностика сети отдельно от диагностики модели.
 *
 * Зачем тест. Причины смешиваются незаметно: «не скачалось» одинаково звучит
 * и когда нет сети, и когда не хватает места, и когда файл битый. Человек
 * тогда чинит не то — перезагружает роутер при заполненном диске.
 *
 * Проверяем разделение на уровне карточек, потому что именно карточки читает
 * человек: сетевой экран отвечает за адреса, готовность — за файлы на диске.
 * Сетевая карточка не должна говорить о модели на диске, а карточка
 * готовности — о сети: у каждой своя причина и свой совет.
 */

vi.mock("../ipc", () => ({
  isTauri: () => true,
  networkAddresses: async () => [
    {
      purpose: "модель для разговора",
      url: "https://huggingface.co/x/model.gguf",
      bytes: 986048768,
      needed: true,
      reason: "единственный разговорный движок",
      pinned_sha256: "a".repeat(64),
    },
  ],
  probeNetwork: async () => [],
  readinessStatus: async () => ({
    engine: { state: "missing", note: "" },
    model: { present: false, name: "", note: "" },
    free_gb: 12,
    can_start: false,
    blockers: [],
  }),
}));

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverStub);

afterEach(() => {
  cleanup();
});

describe("причины не смешиваются", () => {
  it("сетевая карточка говорит об адресах, а не о файлах на диске", async () => {
    render(<NetworkCard />);
    await screen.findByText("https://huggingface.co/x/model.gguf");

    const card = screen.getByLabelText(models.networkTitle);
    const text = card.textContent ?? "";
    // Про сеть — да.
    expect(text).toContain("адрес");
    // Про состояние модели на диске — нет: это ответ карточки готовности, и
    // два ответа на один вопрос расходятся.
    expect(text).not.toContain("модель не скачана");
    expect(text).not.toContain("движок не установлен");
  });

  it("у сетевой карточки свой заголовок, отличный от готовности", () => {
    // Разные вопросы — разные заголовки. Одинаковый заголовок заставил бы
    // человека искать причину не там.
    expect(models.networkTitle).not.toBe(readiness.title);
    expect(models.networkTitle).toContain("сети");
  });

  it("совет сетевой карточки — про сеть, а не про переустановку", async () => {
    render(<NetworkCard />);
    await screen.findByText("https://huggingface.co/x/model.gguf");

    fireEvent.click(screen.getByRole("button", { name: models.probeAsk }));
    const card = screen.getByLabelText(models.networkTitle);
    const text = card.textContent ?? "";
    // Проверка адресов — про доступность; «переустановить движок» здесь
    // прозвучало бы как совет из другой комнаты.
    expect(text).not.toContain("Переустановить движок");
  });
});
