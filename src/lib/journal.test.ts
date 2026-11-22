import { describe, expect, it } from "vitest";
import { groupReasons, reasonOf } from "./journal";

/**
 * Шаг 343: журнал ошибок сгруппирован по причинам, а не по времени.
 *
 * Зачем тест. Группировка — это утверждение «двадцать строк — одна причина», и
 * она ломается в обе стороны: слишком грубая склеивает разное, слишком точная
 * размножает одинаковое. Поэтому проверяем и то, что склеивается, и то, что
 * нет, и то, что не узнанное не исчезает.
 */

describe("причина ошибки", () => {
  it("узнаёт офлайн по любому из слов, которыми он приходит", () => {
    // Текст ошибки приходит из разных мест: Windows, curl, наших сообщений.
    // Причина одна, и человеку важно видеть одну строку, а не семь.
    for (const text of [
      "error: нет сети",
      "error: could not resolve host: huggingface.co",
      "error: network is unreachable",
      "error: нет соединения с сервером",
    ]) {
      expect(reasonOf(text), text).toBe("нет сети");
    }
  });

  it("офлайн важнее таймаута: таймаут — следствие, а не причина", () => {
    // Порядок правил — часть решения. «Нет сети» и «не дождались» — разные
    // советы человеку: в первом случае ждать бессмысленно.
    expect(reasonOf("error: сеть не ответила за timeout 30 с")).toBe("нет сети");
  });

  it("отличает права от занятого файла и от нехватки места", () => {
    expect(reasonOf("error: доступ запрещён")).toBe("не хватает прав");
    expect(reasonOf("error: файл занят другим процессом")).toBe("файл занят");
    expect(reasonOf("error: не хватает места на диске")).toBe("не хватает места");
  });

  it("успех и решения политики не считаются ошибками", () => {
    // Иначе журнал ошибок начнёт показывать то, что сработало.
    expect(reasonOf("ok")).toBe("");
    expect(reasonOf("denied: риск выше разрешённого")).toBe("не хватает прав");
    expect(reasonOf("")).toBe("");
  });

  it("неизвестная ошибка не исчезает: она «другое» с текстом", () => {
    // Пропавшая ошибка — худший вид лжи в журнале.
    expect(reasonOf("error: что-то странное случилось")).toBe("другое");
  });
});

describe("группировка журнала", () => {
  it("склеивает одинаковые причины и считает их числом", () => {
    const groups = groupReasons([
      { outcome: "error: нет сети", at_ms: 100 },
      { outcome: "error: could not resolve host: x", at_ms: 200 },
      { outcome: "error: нет соединения", at_ms: 300 },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.reason).toBe("нет сети");
    expect(groups[0]!.times).toBe(3);
    expect(groups[0]!.lastMs).toBe(300);
    // Пример — самый свежий: ошибка могла измениться, и старый текст врёт.
    expect(groups[0]!.sample).toBe("error: нет соединения");
  });

  it("разные причины остаются разными строками", () => {
    const groups = groupReasons([
      { outcome: "error: нет сети", at_ms: 1 },
      { outcome: "error: файл занят", at_ms: 2 },
      { outcome: "error: не хватает прав", at_ms: 3 },
    ]);
    expect(groups.map((group) => group.reason).sort()).toEqual([
      "не хватает прав",
      "нет сети",
      "файл занят",
    ]);
  });

  it("сначала то, что болит чаще; при равенстве — что свежее", () => {
    const groups = groupReasons([
      { outcome: "error: файл занят", at_ms: 10 },
      { outcome: "error: нет сети", at_ms: 100 },
      { outcome: "error: no network", at_ms: 200 },
      { outcome: "error: нет сети", at_ms: 300 },
    ]);
    // 3 > 1: «нет сети» впереди, хотя последний случай «файла занят» не
    // сравнивается — считаем так же, как код: три строки про сеть, одна про
    // занятый файл.
    expect(groups[0]!.reason).toBe("нет сети");
    expect(groups[0]!.times).toBe(3);
  });

  it("успехи в журнал ошибок не попадают, и пустой вход — пустой список", () => {
    expect(groupReasons([{ outcome: "ok", at_ms: 1 }])).toEqual([]);
    expect(groupReasons([])).toEqual([]);
  });

  it("сортирует по числу, даже когда порядок входа обратный", () => {
    const lines = [
      { outcome: "error: файл занят", at_ms: 1 },
      { outcome: "error: файл занят", at_ms: 2 },
      { outcome: "error: файл занят", at_ms: 3 },
      { outcome: "error: нет сети", at_ms: 4 },
    ];
    const groups = groupReasons(lines);
    expect(groups[0]!.times).toBe(3);
    expect(groups[1]!.times).toBe(1);
  });
});
