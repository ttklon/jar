import { describe, expect, it } from "vitest";
import { NEVER, allowed, guard, guardAll, purge, sweep, type Fact } from "./memoryGuard";
import { clean } from "./secrets";

/**
 * Шаг 269: память не хранит секреты — пароли, ключи, токены не попадают.
 *
 * Разрыв: `secrets.ts` (шаг 98) умеет вычищать секрет из **фразы** перед
 * отправкой модели. Но память — другой склад, и проверка к ней подключена не
 * была: фраза вычищалась до отправки, а в память писалась как есть. Секрет не
 * уходил наружу и **оставался на диске** — что ничем не лучше.
 *
 * Проверка стоит **на записи**, а не на чтении: вычищать при чтении значит
 * хранить секрет и надеяться, что все читатели вспомнят о проверке. Рано или
 * поздно один не вспомнит — экспорт памяти, поиск, отчёт.
 */

const fact = (value: string, kind = "folder"): Fact => ({ kind, value });

describe("секрет не попадает в память (шаг 269)", () => {
  it("ключ по префиксу вычищается до записи", () => {
    const got = guard(fact("sk-abcdefghijklmnopqrstuvwxyz012345"));
    expect(got.secret).toBe(true);
    expect(got.fact.value).not.toContain("sk-abcdefghij");
    expect(got.fact.value).toContain("[секрет]");
  });

  it("«пароль: …» вычищается, а слово «пароль» остаётся", () => {
    // Иначе разбор не поймёт, о чём речь: «сохрани в файл» — другая просьба.
    const got = guard(fact("пароль: hunter2xyz"));
    expect(got.secret).toBe(true);
    expect(got.fact.value).not.toContain("hunter2xyz");
    expect(got.fact.value).toContain("пароль");
  });

  it("токен GitHub и Slack — тоже секреты, а не только «пароль»", () => {
    expect(guard(fact("ghp_abcdefghijklmnopqrstuvwxyz0123456789")).secret).toBe(true);
    expect(guard(fact("xoxb-1234567890-abcdefghij")).secret).toBe(true);
  });

  it("обычная папка не задевается: правило узкое, а не «всё подряд»", () => {
    // Широкое правило запретило бы запоминать что угодно длинное — и память
    // стала бы бесполезной вместе с безопасной.
    const got = guard(fact("D:\\Отчёты\\2026"));
    expect(got.secret).toBe(false);
    expect(got.fact.value).toBe("D:\\Отчёты\\2026");
    expect(got.said).toBe("");
  });
});

describe("сказано что нашли, но не само значение", () => {
  it("сообщение не повторяет секрет", () => {
    // Иначе он попадёт в журнал, из которого его не убрать.
    const secret = "sk-abcdefghijklmnopqrstuvwxyz012345";
    const got = guard(fact(secret));
    expect(got.said).not.toContain(secret);
    expect(got.said).toContain("не храню");
  });

  it("и называет вид находки", () => {
    const got = guard(fact("ghp_abcdefghijklmnopqrstuvwxyz0123456789"));
    expect(got.found.length).toBeGreaterThan(0);
    expect(got.said).toContain("не храню");
  });

  it("в памяти остаётся маркер, а не пустота", () => {
    // «Какой ключ я давал» — вопрос, на который память честно отвечает «был
    // ключ, не храню».
    const got = guard(fact("пароль: qwerty12345"));
    expect(got.fact.value).toContain("[секрет]");
    expect(got.fact.value.length).toBeGreaterThan("[секрет]".length);
  });
});

describe("проверка стоит на записи, а не на чтении", () => {
  it("вычищается до записи — в памяти секрета нет вовсе", () => {
    // Вычистить при чтении значит хранить секрет и надеяться, что все читатели
    // вспомнят о проверке.
    const secret = "sk-abcdefghijklmnopqrstuvwxyz012345";
    const got = guard(fact(secret));
    expect(clean(got.fact.value).any).toBe(false);
  });

  it("пакет проверяет **каждый** факт, а не первый", () => {
    // Именно так проверка и пропадает: на третьем вызове из пяти забыли.
    const got = guardAll([
      fact("D:\\Отчёты"),
      fact("sk-abcdefghijklmnopqrstuvwxyz012345"),
      fact("Code", "program"),
      fact("пароль: qwerty12345"),
    ]);
    expect(got.secrets).toBe(2);
    expect(got.saved.length).toBe(4);
    expect(got.saved.every((saved) => clean(saved.value).any === false)).toBe(true);
  });

  it("факт с секретом не выбрасывается целиком", () => {
    // «Папка с паролем» — всё ещё папка: забыть её значит забыть полезное
    // вместе с опасным.
    const got = guardAll([fact("D:\\Отчёты пароль: qwerty12345")]);
    expect(got.saved.length).toBe(1);
    expect(got.saved[0]!.value).toContain("D:\\Отчёты");
    expect(got.saved[0]!.value).not.toContain("qwerty12345");
  });
});

describe("записи, сделанные до правила, проверяются отдельно", () => {
  it("найденное называется числом и видами, но не значениями", () => {
    // Записи до этой правки никто не вычищал — и молчать о них нельзя.
    const got = sweep([fact("D:\\Отчёты"), fact("sk-abcdefghijklmnopqrstuvwxyz012345")]);
    expect(got.dirty.length).toBe(1);
    expect(got.said).toContain("1 запись");
    expect(got.said).toContain("надо вычистить");
    expect(got.said).not.toContain("sk-abcdefghij");
  });

  it("чистая память — так и сказано", () => {
    expect(sweep([fact("D:\\Отчёты")]).said).toBe("в памяти секретов нет");
  });

  it("чистка убирает значение, а не только прячет", () => {
    const secret = "sk-abcdefghijklmnopqrstuvwxyz012345";
    const got = purge([fact(secret), fact("D:\\Отчёты")]);
    expect(got.clean.every((saved) => !saved.value.includes(secret))).toBe(true);
    expect(got.said).toContain("значения не сохранены");
    // И после чистки проверка молчит — иначе она будет кричать вечно.
    expect(sweep(got.clean).dirty.length).toBe(0);
  });

  it("чистить нечего — сказано, а не пустая строка", () => {
    expect(purge([fact("D:\\Отчёты")]).said).toBe("чистить нечего");
  });
});

describe("есть виды, которых в памяти быть не должно", () => {
  it("пароль, токен, ключ — не вид памяти, а запрет", () => {
    // Это правило, а не надежда на вычистку: секрет может выглядеть как обычная
    // строка и не совпасть ни с одним шаблоном.
    expect(NEVER).toContain("password");
    expect(NEVER).toContain("token");
    expect(NEVER).toContain("api-key");
    expect(allowed("password").ok).toBe(false);
    expect(allowed("password").said).toContain("не хранится");
  });

  it("обычные виды разрешены", () => {
    expect(allowed("folder").ok).toBe(true);
    expect(allowed("voice").ok).toBe(true);
  });
});
