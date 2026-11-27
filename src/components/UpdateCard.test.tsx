// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { UpdateCard } from "./UpdateCard";

/**
 * «Обновление» (шаги 99–100).
 *
 * Главный дефект, который здесь исключается: **«доступно обновление» без единого
 * числа и без слова о проверке**. Человек подтверждает то, чего не видел;
 * поэтому карточка называет установленную версию, порядок проверки (до
 * распаковки) и что будет, если подписи нет.
 */

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);

afterEach(cleanup);

describe("обновление", () => {
  it("называет установленную версию, а не «доступно обновление»", () => {
    render(<UpdateCard />);
    expect(screen.getByText(/Установлено: 0\.1\.0/)).toBeTruthy();
  });

  it("говорит, что проверка идёт до распаковки, и почему", () => {
    render(<UpdateCard />);
    // Аргумент, который приходится повторять: «проверить после» значит
    // «запустить до проверки».
    expect(screen.getByText(/распакованный файл уже лежит в папке программы/)).toBeTruthy();
  });

  it("называет, что проверяется: размер, хеш и подпись", () => {
    render(<UpdateCard />);
    expect(screen.getByText(/размер, хеш и подпись «ZShelper» сошлись — можно применять/)).toBeTruthy();
  });

  it("не обещает установку: здесь только проверка, и это сказано", () => {
    render(<UpdateCard />);
    expect(screen.getByText(/здесь только проверка/)).toBeTruthy();
    // Кнопки «обновить», которая ничего не запускает, нет.
    expect(screen.queryByRole("button", { name: /обновить/i })).toBeNull();
  });

  it("обновление не лезет посреди дела, и ожидание названо", () => {
    render(<UpdateCard />);
    // Работа идёт — обновление ждёт конца дела, и это сказано словами правила.
    // Не «обновится молча»: названа причина ожидания и то, что дело не рвут.
    expect(screen.getByText(/обновление подождёт: сейчас выполняется действие — не будем рвать дело/)).toBeTruthy();
    fireEvent.click(screen.getByText(/что проверяется у файлов сборки/));
    // У каждого файла сборки — своя проверка, а не «всё подписано».
    expect(screen.getAllByText(/zshelper-windows\.exe/).length).toBeGreaterThan(0);
  });

  it("каналы: «новее» и «стабильнее» — разные вещи", () => {
    render(<UpdateCard />);
    fireEvent.click(screen.getByText(/какие каналы и что они обещают/));
    expect(screen.getByText(/«Новее» и «стабильнее» — разные вещи/)).toBeTruthy();
  });
});
