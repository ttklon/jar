import { describe, expect, it } from "vitest";
import { executable, line, needsAsk, origin } from "./launchOrigin";

/**
 * Шаг 173: перед запуском внешней программы — показать, что запускается и откуда.
 *
 * Путь говорит «где», а не «откуда»: `Program Files` и `%TEMP%` выглядят одинаково
 * в строке и означают разное.
 */

describe("источник называется словом", () => {
  it("Program Files — ставилась установщиком", () => {
    const got = origin("C:\\Program Files\\Notepad++\\notepad++.exe");
    expect(got.origin).toBe("program-files");
    expect(got.said).toBe("из Program Files");
    expect(got.name).toBe("notepad++.exe");
    expect(got.warn).toBe("");
  });

  it("временная папка — самый опасный источник, и это сказано", () => {
    const got = origin("C:\\Users\\test\\AppData\\Local\\Temp\\setup.exe");
    expect(got.origin).toBe("temp");
    expect(got.warn).toContain("пишет кто угодно");
  });

  it("загрузки — пришёл из интернета", () => {
    const got = origin("C:\\Users\\test\\Downloads\\tool.exe");
    expect(got.origin).toBe("downloads");
    expect(got.warn).toContain("пришёл из интернета");
  });

  it("системная папка названа системной", () => {
    expect(origin("C:\\Windows\\System32\\notepad.exe").origin).toBe("system");
    expect(origin("C:\\Windows\\System32\\notepad.exe").said).toBe("системная, из Windows");
  });

  it("своя папка и AppData — разные источники", () => {
    expect(origin("C:\\Users\\test\\Desktop\\a.exe").origin).toBe("user");
    expect(origin("C:\\Users\\test\\AppData\\Roaming\\App\\a.exe").origin).toBe("appdata");
  });

  it("диск не `C:` — съёмный, и это видно", () => {
    const got = origin("E:\\portable\\tool.exe");
    expect(got.origin).toBe("removable");
    expect(got.warn).toContain("проверьте, что это ваш носитель");
  });

  it("сетевой диск — файл не на этой машине", () => {
    const got = origin("\\\\server\\share\\tool.exe");
    expect(got.origin).toBe("network");
    expect(got.said).toContain("\\\\server");
    expect(got.warn).toContain("не на этой машине");
  });

  it("чего не понять — названо честно, а не «программа»", () => {
    expect(origin("\\\\?\\C:\\a.exe").origin).not.toBe("other");
    expect(origin("D:\\a.exe").origin).toBe("removable");
    expect(origin("").said).toContain("путь пуст");
  });

  it("прямые слэши и кавычки не мешают", () => {
    expect(origin('"C:/Program Files/App/app.exe"').origin).toBe("program-files");
  });
});

describe("строка — что и откуда, до нажатия", () => {
  it("имя, источник и папка", () => {
    const got = line(origin("C:\\Program Files\\App\\app.exe"));
    expect(got).toBe("запустится app.exe — из Program Files (C:\\Program Files\\App)");
  });

  it("предупреждение — отдельной фразой, а не знаком вопроса", () => {
    const got = line(origin("C:\\Users\\test\\AppData\\Local\\Temp\\x.exe"));
    expect(got).toContain("запустится x.exe — из временной папки");
    expect(got).toContain("· во временную папку пишет кто угодно");
  });
});

describe("когда спрашивать отдельно", () => {
  it("Program Files — обычная работа, вопроса нет", () => {
    expect(needsAsk(origin("C:\\Program Files\\App\\a.exe")).ask).toBe(false);
  });

  it("временная папка, сеть, флешка, загрузки — вопрос", () => {
    expect(needsAsk(origin("C:\\Temp\\a.exe")).ask).toBe(true);
    expect(needsAsk(origin("\\\\srv\\share\\a.exe")).ask).toBe(true);
    expect(needsAsk(origin("E:\\a.exe")).ask).toBe(true);
    expect(needsAsk(origin("C:\\Users\\test\\Downloads\\a.exe")).ask).toBe(true);
  });

  it("непонятный источник — «незнание не разрешение»", () => {
    expect(needsAsk(origin("")).why).toContain("незнание не разрешение");
  });
});

describe("что годится к запуску по имени", () => {
  it(".exe — да", () => {
    expect(executable("C:\\Program Files\\App\\a.exe").ok).toBe(true);
  });

  it("ярлык — нет: его цель не видна", () => {
    const got = executable("C:\\Users\\test\\Desktop\\a.lnk");
    expect(got.ok).toBe(false);
    expect(got.said).toContain("цель не видна");
  });

  it("скрипт — нет: он исполняется по строкам", () => {
    expect(executable("C:\\a.ps1").said).toContain("скрипт, а не программа");
    expect(executable("C:\\a.bat").ok).toBe(false);
  });

  it("файл данных — нет, и сказано почему", () => {
    expect(executable("C:\\a.docx").said).toContain("не .exe");
  });
});
