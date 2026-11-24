import { describe, expect, it } from "vitest";
import { blast, countWords, fromParams, kindOf, line, louder, MANY_FILES, sample, weight } from "./blast";

/**
 * Шаг 162: опасное действие — предпросмотр последствий на конкретных путях.
 *
 * «Удалить 340 файлов» понятнее, чем «удалить папку»: согласие дают на объём,
 * а не на название.
 */

const files = (n: number, bytes = 1024) =>
  Array.from({ length: n }, (_, i) => ({ path: `C:\\Users\\test\\Фото\\IMG_${String(i + 1).padStart(4, "0")}.jpg`, bytes }));

describe("число, а не папка", () => {
  it("340 файлов названы числом и весом", () => {
    const got = blast("delete", { files: files(340, 5 * 1024 * 1024) });
    expect(got.count).toBe("340 файлов, 1.66 ГБ");
  });

  it("русские падежи: файл, файла, файлов", () => {
    expect(countWords([{ path: "a", bytes: 1 }])).toBe("1 файл, 1 Б");
    expect(countWords([{ path: "a", bytes: 1 }, { path: "b", bytes: 1 }])).toBe("2 файла, 2 Б");
    expect(countWords(files(11))).toBe("11 файлов, 11 КБ");
    expect(countWords(files(21))).toBe("21 файл, 21 КБ");
  });

  it("вес по-человечески: Б, КБ, МБ, ГБ", () => {
    expect(weight(512)).toBe("512 Б");
    expect(weight(2048)).toBe("2 КБ");
    expect(weight(5 * 1024 * 1024)).toBe("5 МБ");
    expect(weight(Math.round(1.83 * 1024 * 1024 * 1024))).toBe("1.83 ГБ");
  });
});

describe("образцы — три имени, а не триста строк", () => {
  it("три образца и без повторов", () => {
    const got = sample([
      { path: "C:\\a\\IMG_1.jpg" },
      { path: "C:\\b\\IMG_1.jpg" },
      { path: "C:\\a\\IMG_2.jpg" },
      { path: "C:\\a\\IMG_3.jpg" },
    ]);
    expect(got).toEqual(["IMG_1.jpg", "IMG_2.jpg", "IMG_3.jpg"]);
  });

  it("в смете образцы есть, и сказано «и другие»", () => {
    const got = line(blast("delete", { files: files(340) }));
    expect(got).toContain("IMG_0001.jpg, IMG_0002.jpg, IMG_0003.jpg и другие");
    expect(got).toContain("340 файлов");
  });
});

describe("обратимость рядом с числом", () => {
  it("корзина — вернуть можно", () => {
    expect(blast("trash", { files: files(3) }).undo).toContain("вернуть можно");
  });

  it("удаление мимо корзины — не вернуть", () => {
    expect(blast("delete", { files: files(3) }).undo).toContain("не вернуть");
  });

  it("неизвестный вид шага не обещает возврата", () => {
    expect(blast("unknown", { files: files(1) }).undo).toContain("считайте, что не вернуть");
  });
});

describe("что не тронется — тоже сказать", () => {
  it("вложенные папки названы", () => {
    const got = blast("delete", { files: files(3), skippedFolders: 2 });
    expect(got.spared).toBe("вложенные папки не тронутся: 2 папки останутся как есть");
  });

  it("нечего сказать — пусто, а не «ничего не тронется»", () => {
    expect(blast("delete", { files: files(3) }).spared).toBe("");
  });
});

describe("нет снимка — это «неизвестно», а не «мало»", () => {
  it("число не выдаётся за ноль", () => {
    const got = blast("delete", null, "папка не отвечает");
    expect(got.count).toBe("сколько затронется, неизвестно");
    expect(got.count).not.toContain("0");
    expect(got.unknown).toContain("папка не отвечает");
  });

  it("без причины — своя причина, а не пустое место", () => {
    expect(blast("delete", null).unknown).toContain("пока не увижу");
  });

  it("в строке видно и объём-неизвестность, и обратимость", () => {
    expect(line(blast("delete", null))).toContain("последствия: сколько затронется, неизвестно");
  });
});

describe("когда спрашивать громче", () => {
  it("много файлов без возврата — разговор", () => {
    expect(louder(blast("delete", { files: files(MANY_FILES) }), MANY_FILES, "delete").loud).toBe(true);
  });

  it("один файл в корзину — обычная работа", () => {
    const got = louder(blast("trash", { files: files(1) }), 1, "trash");
    expect(got.loud).toBe(false);
  });

  it("объём неизвестен — громче всегда: согласие на неизвестное не согласие", () => {
    expect(louder(blast("delete", null), 0, "delete").why).toContain("согласие на неизвестное");
  });

  it("много копирования — тоже проверка, но мягче", () => {
    expect(louder(blast("copy", { files: files(200) }), 200, "copy").why).toContain("проверьте, что это те файлы");
  });
});

describe("что за шаг — по реестру руки", () => {
  it("корзина и удаление — разные вещи, и потому разные обещания", () => {
    expect(kindOf("files|удалить|в корзину")).toBe("trash");
    expect(kindOf("files|удалить|безвозвратно")).toBe("delete");
  });

  it("перемещение, копирование, переименование названы", () => {
    expect(kindOf("files|переместить|файлы/папки")).toBe("move");
    expect(kindOf("files|скопировать|файлы/папки")).toBe("copy");
    expect(kindOf("files|переименовать|массово по правилу")).toBe("rename");
  });

  it("незнакомая рука не выдаётся за безопасную", () => {
    expect(kindOf("files|сделать|что-то")).toBe("unknown");
  });
});

describe("снимок из параметров шага", () => {
  it("названы конкретные файлы — по ним и смета", () => {
    const got = fromParams({ path: "C:\\Фото\\IMG_1.jpg\nC:\\Фото\\IMG_2.jpg" });
    expect(got?.files).toHaveLength(2);
  });

  it("названа только папка — содержимое неизвестно, а не «ноль файлов»", () => {
    expect(fromParams({ path: "C:\\Фото" })).toBeNull();
  });

  it("смета по папке говорит «неизвестно», а не выдумывает число", () => {
    const seen = fromParams({ path: "C:\\Фото" });
    expect(blast("delete", seen).count).toBe("сколько затронется, неизвестно");
  });
});
