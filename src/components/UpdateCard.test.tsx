// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { UpdateCard } from "./UpdateCard";

/** Файл предыдущей версии: по умолчанию — нет. */
let previous = { file: "", bytes: 0, looked_in: "C:\\Program Files\\ZShelper" };
vi.mock("../ipc", () => ({
  rollbackFile: async () => previous,
}));

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

afterEach(() => {
  cleanup();
  previous = { file: "", bytes: 0, looked_in: "C:\\Program Files\\ZShelper" };
});

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
    // «Не заменяет хеш подписью» — разные проверки, и это названо.
    expect(screen.getByText(/не заменяет хеш подписью: хеш ловит битый файл, подпись — подмену/)).toBeTruthy();
  });

  it("каналы: «новее» и «стабильнее» — разные вещи", () => {
    render(<UpdateCard />);
    fireEvent.click(screen.getByText(/какие каналы и что они обещают/));
    expect(screen.getByText(/«Новее» и «стабильнее» — разные вещи/)).toBeTruthy();
  });
});

describe("откат: есть он или нет — по файлу на диске", () => {
  it("файла нет — сказано словами и куда его положить, а не серая кнопка", async () => {
    render(<UpdateCard />);
    expect(await screen.findByText(/файла предыдущей версии рядом нет — откат недоступен/)).toBeTruthy();
    // Где искали — чтобы человек знал, куда положить файл.
    expect(screen.getByText(/смотрели: C:\\Program Files\\ZShelper/)).toBeTruthy();
  });

  it("файл нашёлся — откат называется действием с размером", async () => {
    previous = { file: "zshelper-0.0.9.exe", bytes: 6_000_000, looked_in: "C:\\Program Files\\ZShelper" };
    render(<UpdateCard />);

    expect(await screen.findByText(/найден: zshelper-0\.0\.9\.exe \(6000000 байт\)/)).toBeTruthy();
    // Данные не откатываются молча: копия называется до нажатия.
    expect(screen.getByText(/перед откатом делается копия data-до-отката-схема-1\.bak/)).toBeTruthy();
  });

  it("откат без сети: файл ищется рядом, а не на сервере", async () => {
    render(<UpdateCard />);
    expect(await screen.findByText(/в папке программы рядом с текущей версией/)).toBeTruthy();
  });
});
