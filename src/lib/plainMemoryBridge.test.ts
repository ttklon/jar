import { describe, expect, it } from "vitest";
import { accept, carriedCount, fileText, toSourced } from "./plainMemoryBridge";
import { HEADER } from "./plainMemory";

/**
 * Шаг 41, остаток: файл памяти руками (`plainMemory`), подключённый к экрану.
 *
 * `plainMemory` умел писать и читать текст, но никто его не звал: человек не
 * мог ни увидеть свою память файлом, ни поправить её блокнотом. Здесь
 * проверяется мост от настоящих пар ядра к этому файлу — и то, что мост **не
 * врёт** о том, чего не знает.
 */

const STORED = [
  // Ответ человека на вопрос плана: значение — в `value` (тест ядра
  // `facts_are_read_back_and_forgotten`).
  { key: "вопрос:путь", value: "D:\\Отчёты" },
  // Привычка: значение — в ключе.
  { key: "folder:D:\\Фото", value: "фото" },
  { key: "voice:Алла", value: "Алла" },
  // Служебное: рабочий кэш, не память о человеке.
  { key: "model.sha256:qwen", value: "abc123" },
  { key: "params:paint", value: "{\"size\":\"A4\"}" },
  { key: "os-build", value: "26100" },
];

describe("файл памяти из настоящей памяти", () => {
  it("ответ человека попадает в файл его словами", () => {
    const got = fileText(STORED);
    expect(got.text).toContain("D:\\Отчёты");
    expect(got.text).toContain("вы сказали");
  });

  it("служебное в файл не попадает — и это названо числом", () => {
    const got = fileText(STORED);
    // Отпечаток модели — не память о человеке; в файле ему нечего делать.
    expect(got.text).not.toContain("abc123");
    expect(got.text).not.toContain("26100");
    // Но и молчать нельзя: человек не должен гадать, потеряли или не брали.
    expect(got.said).toContain("служебных строк не переносил: 3");
  });

  it("привычка названа догадкой, а не словом человека", () => {
    // Приложение вывело её по повторам. Записать её как «вы сказали» значило бы
    // приписать человеку то, чего он не говорил — и на другом компьютере эта
    // ложь стала бы его словом.
    const [, habit] = fileText([
      { key: "вопрос:путь", value: "D:\\Отчёты" },
      { key: "folder:D:\\Фото", value: "фото" },
    ]).text.split("\n").filter((line) => /^folder:/.test(line));
    expect(habit).toContain("приложение заметило");
  });

  it("в файле есть шапка, объясняющая человеку, что это", () => {
    const got = fileText([{ key: "voice:Алла", value: "Алла" }]);
    expect(got.text.startsWith(HEADER)).toBe(true);
  });

  it("пустая память — файл с шапкой и честное «фактов нет»", () => {
    const got = fileText([]);
    expect(got.text).toContain("Память приложения");
    expect(got.said).toContain("нет ни одного факта");
  });
});

describe("круговой обход и его граница", () => {
  it("значения переживают запись и чтение", () => {
    const back = accept(fileText(STORED).text);
    expect(back.pairs.map((pair) => pair.value)).toEqual(["D:\\Отчёты", "D:\\Фото", "Алла"]);
  });

  it("ключи привычек не меняются — правка файла не плодит дубли", () => {
    // Первый вариант моста приклеивал к значению имя поля («путь: D:\\Отчёты»),
    // и обратное чтение давало ключ `folder:путь: D:\\Отчёты` — то есть файл
    // создавал новый факт вместо правки старого.
    const back = accept(fileText([{ key: "folder:D:\\Фото", value: "фото" }]).text);
    expect(back.pairs.map((pair) => pair.key)).toEqual(["folder:D:\\Фото"]);
  });

  it("граница названа: ответ на вопрос возвращается папкой, и это сказано", () => {
    // Ключ ядра в файл не пишется — файл читают люди. Значит обратное чтение
    // заводит запись с другим ключом, и молчать об этом нельзя.
    const text = fileText([{ key: "вопрос:путь", value: "D:\\Отчёты" }]).text;
    const back = accept(text);
    expect(back.pairs[0]?.key).toBe("folder:D:\\Отчёты");
    expect(back.carried).toBe(1);
  });

  it("пометка про вопрос переживает шапку файла", () => {
    // Шапка тоже говорит про ответы; считать надо только строки фактов, иначе
    // число «перенесено» окажется больше правды.
    const text = fileText([{ key: "вопрос:путь", value: "D:\\Отчёты" }]).text;
    expect(carriedCount(text)).toBe(1);
  });
});

describe("руками поправленный файл", () => {
  it("непонятная строка называется, а не пропадает молча", () => {
    const back = accept(`${HEADER}folder: D:\\Архив — вы сказали\nэто я так, заметка\n`);
    expect(back.facts).toHaveLength(1);
    expect(back.said).toContain("пропущено 1");
    expect(back.said).toContain("заметка");
  });

  it("своя пометка человека не считается ошибкой", () => {
    // `#` и `>` — заголовки и цитаты: человек вправе писать в своём файле.
    const back = accept(`${HEADER}# мои заметки\n> не забыть\nfolder: D:\\Архив — вы сказали\n`);
    expect(back.said).toBe("прочитано 1");
  });

  it("служебные виды не превращаются в факты при чтении", () => {
    const got = toSourced([{ key: "custom:моя_рука", value: "{}" }]);
    expect(got.facts).toHaveLength(0);
    expect(got.skippedService).toBe(1);
  });
});
