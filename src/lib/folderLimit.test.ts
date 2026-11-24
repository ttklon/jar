import { describe, expect, it } from "vitest";
import { allow, allowWith, canon, CONSENT_MS, consented, consentTo, inside, NOTHING, say, suggest, type Limits } from "./folderLimit";

/**
 * Шаг 164: выход за выбранные папки запрещён, исключение — явное.
 *
 * `..` в пути — обычный способ выйти из папки, и он не про архив.
 */

const фото: Limits = { folders: ["C:\\Фото"], except: [] };

describe("канон: сравнивать можно только приведённое", () => {
  it("разделители и регистр не делают вторую папку", () => {
    expect(canon("c:/ФОТО/")).toBe("C:\\ФОТО");
  });

  it("точка и две точки схлопываются до сравнения", () => {
    expect(canon("C:\\Фото\\..\\Фото\\снимок.jpg")).toBe("C:\\Фото\\снимок.jpg");
  });

  it("выход выше корня не «схлопывается в корень», а не понять", () => {
    // `C:\..\Windows` привёл бы в `C:\Windows` — но человек просил не это.
    expect(canon("C:\\..\\Windows")).toBeNull();
  });

  it("пустое и «только буква диска» — не путь", () => {
    expect(canon("   ")).toBeNull();
    expect(canon("C:\\")).toBe("C:\\");
  });

  it("оболочка `\\\\?\\` не мешает сравнению", () => {
    expect(canon("\\\\?\\C:\\Фото\\a.jpg")).toBe("C:\\Фото\\a.jpg");
  });
});

describe("внутри — по границе части пути, а не по началу строки", () => {
  it("файл внутри папки — внутри", () => {
    expect(inside("C:\\Фото\\a.jpg", "C:\\Фото")).toBe(true);
  });

  it("соседняя папка с похожим именем — не внутри", () => {
    // `C:\Фото2` начинается так же, но это другая папка: пропустить её значит
    // сломать ровно то, от чего защищает предел.
    expect(inside("C:\\Фото2\\a.jpg", "C:\\Фото")).toBe(false);
  });

  it("`..` выводит наружу, и это видно", () => {
    expect(inside("C:\\Фото\\..\\Windows\\system32", "C:\\Фото")).toBe(false);
  });
});

describe("предел — список папок, и пустой список не разрешение", () => {
  it("внутри выбранной папки — пускаем", () => {
    const got = allow("C:\\Фото\\a.jpg", фото);
    expect(got.ok).toBe(true);
    expect(got.by).toBe("C:\\Фото");
  });

  it("вне — отказ, и сказано, чего не хватило", () => {
    const got = allow("D:\\Архив\\a.zip", фото);
    expect(got.ok).toBe(false);
    expect(got.why).toContain("вне выбранных папок");
    expect(got.why).toContain("C:\\Фото");
  });

  it("папки не выбраны — можно ничего: «не задали» не «разрешено всё»", () => {
    const got = allow("C:\\Фото\\a.jpg", NOTHING);
    expect(got.ok).toBe(false);
    expect(got.why).toContain("это не разрешение");
  });

  it("непонятный путь — отказ, а не «наверное, внутри»", () => {
    const got = allow("..\\..\\Windows", фото);
    expect(got.ok).toBe(false);
    expect(got.why).toContain("не понять");
  });

  it("ноль байт не делает путь относительным… а относительный путь не пускается", () => {
    expect(allow("отчёт.txt", фото).ok).toBe(false);
  });
});

describe("исключение — явное и названное", () => {
  const сИсключением: Limits = { folders: ["C:\\Фото"], except: ["D:\\Архив"] };

  it("исключение пускает и говорит, что это оно", () => {
    const got = allow("D:\\Архив\\a.zip", сИсключением);
    expect(got.ok).toBe(true);
    expect(got.why).toContain("разрешено исключением");
  });

  it("исключение не расширяет предел молча", () => {
    expect(allow("D:\\Другое\\a.zip", сИсключением).ok).toBe(false);
  });

  it("исключение — папка, а не «всё»: корень диска не впускается папкой", () => {
    // Корень `D:\` — это весь диск, и он **не** внутри `D:\Архив`: исключение
    // папки не должно превращаться в разрешение на диск.
    expect(allow("D:\\", сИсключением).ok).toBe(false);
    expect(allow("D:\\Архив\\2026\\a.zip", сИсключением).ok).toBe(true);
    expect(allow("E:\\a.txt", сИсключением).ok).toBe(false);
  });
});

describe("что предложить вместо «разрешить всё»", () => {
  it("ближайшая папка файла, а не диск", () => {
    expect(suggest("D:\\Архив\\2026\\a.zip")).toBe("D:\\Архив\\2026");
  });

  it("из корня предложить нечего — и это честно", () => {
    expect(suggest("D:\\")).toBeNull();
  });
});

describe("строка для экрана", () => {
  it("отказ называет причину, а не просто «нет»", () => {
    expect(say(allow("D:\\Архив\\a.zip", фото))).toContain("отказ: вне выбранных папок");
  });

  it("разрешение называет канон пути", () => {
    expect(say(allow("c:/фото/a.jpg", фото))).toContain("путь в пределах: C:\\фото\\a.jpg");
  });
});

describe("согласие на работу вне списка — на дело и на час (шаг 171)", () => {
  const NOW = Date.parse("2026-11-20T12:00:00Z");
  const фото: Limits = { folders: ["C:\\Фото"], except: [] };

  it("без согласия — отказ, и сказано, чего не хватает", () => {
    const got = allowWith("D:\\Архив\\a.zip", фото, null, "почистить архив", NOW);
    expect(got.ok).toBe(false);
    expect(got.why).toContain("согласия на работу вне списка нет");
  });

  it("согласие на это дело пускает и называет срок", () => {
    const consent = consentTo("почистить архив", NOW);
    const got = allowWith("D:\\Архив\\a.zip", фото, consent, "почистить архив", NOW + 1000);
    expect(got.ok).toBe(true);
    expect(got.why).toContain("вне списка");
  });

  it("согласие на одно дело — не разрешение на всё", () => {
    const consent = consentTo("почистить архив", NOW);
    const got = allowWith("D:\\Архив\\a.zip", фото, consent, "другое дело", NOW);
    expect(got.ok).toBe(false);
    expect(got.why).toContain("не разрешение на всё");
  });

  it("через час согласие кончается само", () => {
    const consent = consentTo("дело", NOW);
    expect(allowWith("D:\\a", фото, consent, "дело", NOW + CONSENT_MS + 1).ok).toBe(false);
    expect(allowWith("D:\\a", фото, consent, "дело", NOW + CONSENT_MS - 1).ok).toBe(true);
  });

  it("пустой ключ не считается согласием — иначе это дыра", () => {
    const consent = consentTo("   ", NOW);
    expect(consented(consent, "  ", NOW).ok).toBe(false);
  });

  it("путь внутри списка согласия не спрашивает", () => {
    const got = allowWith("C:\\Фото\\a.jpg", фото, null, "дело", NOW);
    expect(got.ok).toBe(true);
  });
});
