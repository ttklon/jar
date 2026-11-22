import { describe, expect, it } from "vitest";
import { adviceFor, adviceForVerdict, failedCount } from "./repair";

/**
 * Шаг 341: «Проверка себя» объясняет отказ и предлагает ремонт.
 *
 * Зачем тест. Совет — это текст, и текст ломается молча: «попробуйте
 * перезапустить» проходит любую проверку и не помогает никому. Поэтому
 * проверяем не наличие строки, а три свойства:
 *
 *  * у каждого отказа из ядра есть ответ, и он — глагол;
 *  * у того, что приложение починить не может, кнопки нет, и это сказано;
 *  * у неизвестного имени совета нет — а не «попробуйте ещё раз».
 */

describe("что делать при отказе", () => {
  it("у отказа по модели — «скачать заново», а не «попробуйте ещё раз»", () => {
    const advice = adviceFor("модель");
    expect(advice.action).toBe("Скачать модель заново");
    expect(advice.repair).toBe("download-model");
    // Причина названа и она про механизм: SHA-256, а не «так надёжнее».
    expect(advice.why).toContain("SHA-256");
  });

  it("обновление Windows не обещает кнопки, которой нет", () => {
    // Шаг 358: обновление не откатить. Пустое действие — лучше кнопки,
    // которая ничего не делает, но выглядит как решение.
    const advice = adviceFor("обновление Windows");
    expect(advice.repair).toBe("none");
    expect(advice.action).toBe("");
    expect(advice.why).toContain("не откатить");
  });

  it("у отказа по движку — переустановка отдельно от модели", () => {
    const advice = adviceFor("движок llama.cpp");
    expect(advice.action).toBe("Переустановить движок");
    // Главное обещание ремонта: чинится часть, а не всё приложение.
    expect(advice.why).toContain("не трогая ни модель, ни память");
  });

  it("папка данных чинится сбросом кеша, и это не «удалить всё»", () => {
    const advice = adviceFor("папка данных");
    expect(advice.action).toBe("Сбросить кеш");
    expect(advice.why).toContain("журнал");
  });

  it("память чинится пересозданием базы с копией, а не потерей журнала", () => {
    const advice = adviceFor("память");
    expect(advice.action).toBe("Пересоздать базу памяти");
    expect(advice.why).toContain("копией");
  });

  it("автозапуск и версия не получают кнопки, которая ничего не делает", () => {
    // Кнопка без действия хуже её отсутствия: человек нажмёт и решит, что
    // приложение сломано сильнее, чем было.
    for (const name of ["автозапуск", "версия"]) {
      const advice = adviceFor(name);
      expect(advice.action, name).toBe("");
      expect(advice.repair, name).toBe("none");
      expect(advice.why.length, name).toBeGreaterThan(10);
    }
  });

  it("неизвестная проверка не получает выдуманного совета", () => {
    // Новое имя в ядре — это «действия нет», а не «попробуйте ещё раз»:
    // второй вариант звучит как совет и не советует ничего.
    const advice = adviceFor("новая проверка из будущего");
    expect(advice.action).toBe("");
    expect(advice.repair).toBe("none");
    expect(advice.why).toContain("готового действия нет");
  });

  it("прошедшая проверка не предлагает ничего чинить", () => {
    // Совет у зелёной галочки — шум: он предлагает лечить то, что здорово.
    expect(adviceForVerdict({ name: "модель", passed: true })).toBeNull();
    expect(adviceForVerdict({ name: "модель", passed: false })).not.toBeNull();
  });

  it("имя с уточнением после двоеточия тоже узнаётся", () => {
    // Ядро может назвать проверку подробнее («модель: файл ggml-base.bin»);
    // совет должен найтись, иначе подробность отнимает у человека действие.
    expect(adviceFor("модель: файл ggml-base.bin").repair).toBe("download-model");
    expect(adviceFor("  ДВИЖОК  ").repair).toBe("reinstall-engine");
  });

  it("число отказов считается числом, а не «есть проблемы»", () => {
    expect(failedCount([{ passed: true }, { passed: false }, { passed: false }])).toBe(2);
    expect(failedCount([])).toBe(0);
  });
});
