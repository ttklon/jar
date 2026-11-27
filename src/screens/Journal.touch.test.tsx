// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { auditTail, memoryRuns } from "../ipc";
import { Journal } from "./Journal";

/**
 * Поле поиска в журнале — цель в 44 px (шаг 196 применили к поиску).
 *
 * Настоящий дефект, найденный e2e на 540 px: поле поиска было высотой 30 px.
 * Обещание «цель, в которую попадает палец и дрожащая рука» действовало для
 * поля в шапке приложения и **не** действовало для поиска в журнале — то есть
 * человек с дрожащей рукой промахивался ровно там, где ищет вчерашнее дело.
 *
 * jsdom не считает вёрстку, поэтому проверяется объявленная мера: стиль
 * `searchField` в самом экране. Пиксели проверяет Chromium
 * (`e2e/zoom.pw.ts`), и без этого теста правка стиля отвалилась бы молча.
 */

vi.mock("../ipc", () => ({
  isTauri: () => true,
  auditTail: vi.fn(async () => []),
  memoryRuns: vi.fn(async () => []),
}));

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverStub);

afterEach(() => {
  cleanup();
  vi.mocked(auditTail).mockClear();
  vi.mocked(memoryRuns).mockClear();
});

describe("поле поиска в журнале", () => {
  it("объявлена мера 44 px — та же, что у главного входа", () => {
    // `import.meta.url` в jsdom — не `file:`, поэтому путь берётся от корня
    // проекта: тест запускается из него (так же делают другие тесты исходников).
    const source = readFileSync(resolve(process.cwd(), "src/screens/Journal.tsx"), "utf8");
    // Мера живёт в стиле `searchField` и применяется к самому полю: стиль без
    // применения ничего не значит.
    // Мера стоит **и** на обёртке Fluent `Input`, и на самом поле: обёртка
    // держала свою высоту, и одного `minHeight` на `input` не хватило (42 px).
    expect(source).toMatch(/searchField: \{[\s\S]*?minHeight: "44px"[\s\S]*?& input[\s\S]*?minHeight: "44px"/);
    expect(source).toContain("className={styles.searchField}");
  });

  it("поле поиска вообще есть и названо словами человека", async () => {
    render(<Journal />);
    // Метка — из словаря: «Что я уже делал?». Не «поиск».
    expect(await screen.findByLabelText("Что я уже делал?")).toBeTruthy();
  });
});
