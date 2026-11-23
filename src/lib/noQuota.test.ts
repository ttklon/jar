import { describe, expect, it } from "vitest";
import { asFile, can, damage, intact, looksLikeQuota, missing, promise, type File } from "./noQuota";

/**
 * Шаг 69: квот нет, счёта нет — модели локальные файлы с проверкой хеша.
 *
 * Человек, увидев счётчик, начинает считать фразы и говорить короче: он платит
 * вниманием за то, что обещали бесплатно.
 */
const file: File = { name: "qwen-1.5b-q4.gguf", sha256: "abc123", size: 1_100_000_000 };

describe("бесплатность — отсутствие механизма, а не обещание", () => {
  it("обещание называет три вещи, которых нет", () => {
    // Нечему ломаться — сильнее, чем «мы не будем».
    const said = promise();
    expect(said).toContain("квоты");
    expect(said).toContain("счёта");
    expect(said).toContain("наружу");
  });

  it("нет файла — нет работы, и путь назван", () => {
    // Человек ждёт «регистрации» или «ключика», потому что так бывает везде.
    expect(can(null, "abc123")).toBe(false);
    expect(missing(file.name)).toContain("без интернета");
    expect(missing(file.name)).toContain("один раз");
  });

  it("счётчика в интерфейсе нет — и это проверяется, а не предполагается", () => {
    // Появился баланс или «осталось фраз» — обещание сломано, и это должно
    // падать на тесте.
    expect(looksLikeQuota("осталось 5 фраз")).toBe(true);
    expect(looksLikeQuota("лимит бесплатных запросов")).toBe(true);
    expect(looksLikeQuota("баланс: 0")).toBe(true);
    expect(looksLikeQuota(promise())).toBe(false);
  });
});

describe("хеш — для целостности, а не для счёта", () => {
  it("совпал — работаем", () => {
    expect(intact(file, "abc123")).toBe(true);
    expect(can(file, "abc123")).toBe(true);
  });

  it("регистр не важен: хеши пишут по-разному", () => {
    expect(intact(file, "ABC123")).toBe(true);
    expect(intact(file, " abc123 ")).toBe(true);
  });

  it("не совпал — файл не запускается", () => {
    // Это разница между «модель» и «что угодно, названное моделью».
    expect(can(file, "def456")).toBe(false);
  });

  it("сказано, что случилось и что делать", () => {
    // «Ошибка хеша» человек прочитает как «приложение сломалось».
    const said = damage(file);
    expect(said).toContain("повреждён");
    expect(said).toContain("скачайте");
    expect(said).toContain(file.name);
  });

  it("нет хеша вовсе — не запускаем", () => {
    expect(can(file, null)).toBe(false);
  });
});

describe("модель — вещь, а не сервис", () => {
  it("названа как файл с размером", () => {
    // «Файл 1.1 ГБ» можно потрогать; «план Pro» можно отобрать.
    const said = asFile(file);
    expect(said).toContain("файл");
    expect(said).toContain("1.1 ГБ");
    expect(said).toContain("без интернета");
  });
});
