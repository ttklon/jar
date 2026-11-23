// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NetworkCard, weight } from "./NetworkCard";
import { models } from "../i18n/ru";

/**
 * «Куда приложение ходит в сети» — список, а не обещание.
 *
 * Зачем тест. Список адресов живёт в ядре; карточка только показывает. Значит
 * проверять надо три вещи, и все три ломаются молча:
 *
 *  * **каждый адрес на экране.** Пропущенный адрес — это не «стало короче», это
 *    неполное обещание;
 *  * **обязательное отделено от необязательного.** Голос не обязателен для
 *    первого разговора; если это потеряется, человек решит, что без 140 МБ
 *    распознавания приложение не заработает;
 *  * **вес числом.** «Небольшая модель» не значит ничего.
 */

const list = vi.hoisted(() => ({
  addresses: [] as unknown[],
  fail: false,
  probes: [] as unknown[],
  probeFail: false,
  probeCalls: 0,
}));

vi.mock("../ipc", () => ({
  networkAddresses: async () => {
    if (list.fail) throw new Error("ядро не ответило");
    return list.addresses;
  },
  probeNetwork: async () => {
    list.probeCalls += 1;
    if (list.probeFail) throw new Error("проверка не запустилась");
    return list.probes;
  },
}));

afterEach(() => {
  cleanup();
  list.addresses = [];
  list.fail = false;
  list.probes = [];
  list.probeFail = false;
  list.probeCalls = 0;
});

function four() {
  return [
    {
      purpose: "модель для разговора",
      url: "https://huggingface.co/x/model.gguf",
      bytes: 986048768,
      needed: true,
      reason: "единственный разговорный движок",
      pinned_sha256: "a".repeat(64),
    },
    {
      purpose: "движок llama.cpp",
      url: "https://github.com/ggml-org/llama.cpp/releases/download/b12535/x.zip",
      bytes: 25696689,
      needed: true,
      reason: "pinned-релиз",
      pinned_sha256: "b".repeat(64),
    },
    {
      purpose: "движок распознавания речи",
      url: "https://github.com/ggml-org/whisper.cpp/releases/download/b5454/w.zip",
      bytes: 14000000,
      needed: false,
      reason: "нужен только для голоса",
      pinned_sha256: "c".repeat(64),
    },
    {
      purpose: "модель распознавания речи",
      url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin",
      bytes: 147951465,
      needed: false,
      reason: "нужна только для голоса",
      pinned_sha256: "d".repeat(64),
    },
  ];
}

describe("сетевой след приложения", () => {
  it("показывает каждый адрес, а не только те, что нужны", async () => {
    list.addresses = four();
    render(<NetworkCard />);

    await screen.findByText("https://huggingface.co/x/model.gguf");
    // Четыре строки — четыре адреса. Пропуск одного значит «список неполон», а
    // неполный список хуже отсутствующего: он выглядит исчерпывающим.
    const items = await screen.findAllByRole("listitem");
    expect(items).toHaveLength(4);
    expect(screen.getByText(/ggml-base\.bin/)).toBeTruthy();
  });

  it("говорит, что нужно для разговора, а что только для голоса", async () => {
    list.addresses = four();
    render(<NetworkCard />);

    await screen.findAllByRole("listitem");
    expect(screen.getAllByText(models.networkNeeded)).toHaveLength(2);
    expect(screen.getAllByText(models.networkOptional)).toHaveLength(2);
  });

  it("называет вес числом, а не словом «небольшая»", async () => {
    list.addresses = four();
    render(<NetworkCard />);

    await screen.findAllByRole("listitem");
    // 986048768 байт — это 940 МБ, и именно это должен увидеть человек.
    expect(screen.getByText("940 МБ")).toBeTruthy();
    expect(screen.getByText("25 МБ")).toBeTruthy();
    expect(screen.getByText("141 МБ")).toBeTruthy();
  });

  it("вес считается в человеческих единицах", () => {
    expect(weight(986048768)).toBe("940 МБ");
    expect(weight(147951465)).toBe("141 МБ");
    // 25, а не 24: 25 696 689 / 1024² = 24,5 → округление вверх. Ожидание должно
    // считать так же, как код, иначе тест проверяет мою арифметику, а не код.
    expect(weight(25696689)).toBe("25 МБ");
    expect(weight(2 * 1024 * 1024 * 1024)).toBe("2.00 ГБ");
    expect(weight(0)).toBe(models.networkUnknownSize);
    expect(weight(500)).toBe(models.networkSmall);
  });

  it("ошибка ядра не превращается в пустой список", async () => {
    // Пустота читалась бы как «никуда не ходит» — это ложь в самую опасную
    // сторону. Честный ответ: список неизвестен, обещать нельзя.
    list.fail = true;
    render(<NetworkCard />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("не получен");
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });

  it("называет цену числом, а не словом «бесплатно»", async () => {
    // Шаги 208 и 215. «Бесплатно» ничего не значит рядом с «бесплатно на 7
    // дней»; 0 ₽ — значит. И причина рядом, иначе это лозунг, а не обещание.
    list.addresses = four();
    render(<NetworkCard />);

    expect(screen.getByText(/0 ₽/)).toBeTruthy();
    // Причина названа: платить некому.
    expect(screen.getByText(/Платить некому/)).toBeTruthy();
  });

  it("проверяет адреса только по кнопке, а не при открытии экрана", async () => {
    // При открытии экрана каждый адрес — настоящий запрос. Это было бы «тихое
    // скачивание» в миниатюре: человек не просил, а приложение сходило в сеть.
    list.addresses = four();
    render(<NetworkCard />);
    await screen.findAllByRole("listitem");

    expect(list.probeCalls).toBe(0);

    fireEvent.click(screen.getByRole("button", { name: models.probeAsk }));

    // Ядро ответило пустым списком — это и есть признак, что вызов дошёл:
    // строка итога появляется только после ответа `probe_network`.
    await screen.findByText(/Проверять нечего/);
    expect(list.probeCalls).toBe(1);
  });

  it("говорит, сколько адресов ответило, и называет остальные поимённо", async () => {
    const addresses = four();
    list.addresses = addresses;
    list.probes = [
      { url: addresses[0]!.url, status: 200, bytes: 986048768, tag: "\"a\"", problem: null },
      { url: addresses[1]!.url, status: 404, bytes: null, tag: null, problem: "адрес ответил кодом 404" },
    ];
    render(<NetworkCard />);
    await screen.findAllByRole("listitem");

    fireEvent.click(screen.getByRole("button", { name: models.probeAsk }));

    // Один из двух — это не «всё хорошо»: число названо числом.
    const status = await screen.findByText(/Ответили 1 из 2/);
    expect(status.textContent).toContain("1 из 2");
    expect(screen.getByText(/движок llama\.cpp: адрес ответил кодом 404/)).toBeTruthy();
  });

  it("пустой ответ ядра не выдаёт за «все адреса живы»", async () => {
    // Так выглядит браузерная сборка: ядра нет, проверять нечего. «Все 0
    // адресов ответили» было бы успехом, которого не было.
    list.addresses = four();
    list.probes = [];
    render(<NetworkCard />);
    await screen.findAllByRole("listitem");

    fireEvent.click(screen.getByRole("button", { name: models.probeAsk }));
    expect(await screen.findByText(/Проверять нечего/)).toBeTruthy();
  });

  it("ошибку проверки называет, а не прячет за кнопкой", async () => {
    list.addresses = four();
    list.probeFail = true;
    render(<NetworkCard />);
    await screen.findAllByRole("listitem");

    fireEvent.click(screen.getByRole("button", { name: models.probeAsk }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("проверка не выполнена");
  });

  it("говорит про обновления так, что офлайн не выглядит поломкой", () => {
    // Шаг 205. «Не удалось проверить обновления» в офлайне — отказ, которого
    // не должно быть: проверки нет вовсе, и это сказано до того, как человек
    // выключит сеть. Заодно проверяем, что фраза не обещает фоновую проверку,
    // которой в ядре нет: обещание обновиться само — тоже обещание.
    list.addresses = four();
    render(<NetworkCard />);

    const text = screen.getByText(new RegExp(models.networkUpdates.slice(0, 30)));
    expect(text.textContent).toContain("Обновлений в фоне нет вовсе");
    // Слово «ошибка» здесь запрещено: офлайн — режим, а не сбой.
    expect(text.textContent?.toLowerCase()).not.toContain("ошибк");
  });
});
