// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import dataJson from "../../data/licenses.json";
import { Licenses } from "./Licenses";
import type { LicenseData } from "../lib/licenses";

/**
 * Шаг 217: лицензии всего встроенного — одной таблицей **в приложении**.
 *
 * Проверяется не «отрисовалось», а что человек видит счёт, источник и отдельно —
 * то, чего таблица не знает.
 */

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);
afterEach(cleanup);

const data = dataJson as unknown as LicenseData;

describe("таблица на экране", () => {
  it("каждая группа из данных есть в таблице, с числом", () => {
    render(<Licenses data={data} />);
    for (const row of data.groups) {
      expect(screen.getByText(row.license)).toBeTruthy();
      expect(screen.getAllByText(String(row.count)).length).toBeGreaterThanOrEqual(1);
    }
  });

  it("итог назван числом и совпадает с суммой строк", () => {
    render(<Licenses data={data} />);
    const sum = data.groups.reduce((total, row) => total + row.count, 0);
    expect(sum).toBe(data.total);
    expect(screen.getByText(`Всего ${data.total} пакетов: npm ${data.kinds.npm}, cargo ${data.kinds.cargo}.`)).toBeTruthy();
  });

  it("«не объявлено» помечено на экране, а не только в данных", () => {
    // Пустая клетка читается как «всё хорошо», хотя это «не знаем».
    render(<Licenses data={data} />);
    expect(screen.getByText(/не значит «нет лицензии»/)).toBeTruthy();
  });

  it("источник назван: без него это цифры, а не проверяемые цифры", () => {
    render(<Licenses data={data} />);
    expect(screen.getByText(/Из блокировок проекта/)).toBeTruthy();
  });

  it("скачиваемое отдельно названо: иначе таблица выглядит полной", () => {
    render(<Licenses data={data} />);
    expect(screen.getByText(/скачиваются отдельно/)).toBeTruthy();
  });
});

describe("таблица, которая не сходится, говорит об этом первой", () => {
  it("расхождение — громко и с числом", () => {
    const broken = { ...data, total: data.total + 1 };
    render(<Licenses data={broken} />);
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("не сходится");
    expect(alert.textContent).toContain(String(data.total + 1));
  });

  it("копилефт назван до таблицы, а не спрятан в списке", () => {
    const withGpl: LicenseData = {
      ...data,
      packages: [...data.packages, { name: "копилефт-пакет", version: "1", license: "AGPL-3.0", kind: "npm" }],
    };
    render(<Licenses data={withGpl} />);
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("копилефт-пакет");
    expect(alert.textContent).toContain("AGPL-3.0");
  });
});
