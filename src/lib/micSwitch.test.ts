import { describe, expect, it } from "vitest";
import { sayNoDevices, saySwitch, switchTo, type Devices } from "./micSwitch";
import { inputDevices } from "./recorder";

/**
 * Шаг 54: подключил гарнитуру — она и работает, без перезапуска.
 *
 * Микрофон, взятый один раз при запуске, остаётся прежним: человек говорит в
 * гарнитуру, которая молчит, и это выглядит как поломка.
 */
const usb = { id: "usb-1", label: "Гарнитура USB" };
const builtin = { id: "built-in", label: "Микрофон ноутбука" };

const base = (over: Partial<Devices> = {}): Devices => ({
  inputs: [builtin],
  defaultId: "built-in",
  currentId: "built-in",
  ...over,
});

describe("выбор устройства перед фразой", () => {
  it("гарнитуру подключили — следующая фраза идёт с неё", () => {
    // Без перезапуска: иначе человек ищет в меню «сменить микрофон» и не находит.
    const next = switchTo(base({ inputs: [usb, builtin], defaultId: "usb-1" }));
    expect(next).toBe("usb-1");
  });

  it("на лету не переключаем — фраза не режется на два голоса", () => {
    // Переключение посреди фразы даёт склейку двух записей: первая половина с
    // одного микрофона, вторая — с другого. Распознаётся хуже целой фразы.
    const same = base();
    expect(switchTo(same)).toBeNull();
  });

  it("прежний микрофон отключился — переключаемся обязательно", () => {
    // Иначе запись не начнётся, и человек не поймёт, почему.
    const next = switchTo(base({ currentId: "gone", inputs: [usb], defaultId: "usb-1" }));
    expect(next).toBe("usb-1");
  });

  it("устройств нет — не выдумываем устройство", () => {
    expect(switchTo(base({ inputs: [], defaultId: null, currentId: null }))).toBeNull();
  });
});

describe("человеку сказано, что сменилось", () => {
  it("названо устройство, а не «устройство сменено»", () => {
    // «Сменено» ничего не говорит: человек не знает, на что именно.
    const devices = base({ inputs: [usb, builtin], defaultId: "usb-1", currentId: "built-in" });
    expect(saySwitch(devices, "usb-1")).toContain("Гарнитура USB");
  });

  it("пропажа прежнего — это «отключился», а не «подключился новый»", () => {
    // Разные события, и человеку важно знать, что дальше говорить можно.
    const devices = base({ inputs: [usb], defaultId: "usb-1", currentId: "gone" });
    const said = saySwitch(devices, "usb-1");
    expect(said).toContain("отключился");
    expect(said).toContain("слушаю");
  });

  it("нет устройств — сказано, что делать, а не тишина", () => {
    // Молчание — худший ответ: человек говорит, ничего не происходит.
    expect(sayNoDevices()).toContain("подключите");
    expect(sayNoDevices()).toContain("напечатайте");
  });

  it("без названия не остаёмся с пустыми кавычками", () => {
    // Система может не дать название — тогда говорим «по умолчанию».
    const devices = base({ inputs: [{ id: "x", label: "  " }], defaultId: "x", currentId: null });
    const said = saySwitch(devices, "x");
    expect(said).toContain("по умолчанию");
    expect(said).not.toContain("«»");
  });

describe("чтение устройств подключено, а не только описано", () => {
  it("браузер без списка устройств — не ошибка, берём по умолчанию", async () => {
    // В jsdom mediaDevices нет вовсе: функция обязана вернуть пустой список, а
    // не бросить — запись от этого зависеть не должна.
    const list = await inputDevices();
    expect(list.inputs).toEqual([]);
    expect(list.defaultId).toBeNull();
  });
});
});
