import { describe, expect, it } from "vitest";
import { bodyLines, local, mask, place, saveable, warning } from "./remoteRoute";

/**
 * Шаг 216: если включён удалённый путь — предупреждение с адресом и телом запроса.
 *
 * Фраза «её маршрут настраивается отдельно» обещала настройку, которой нет.
 */

describe("адрес — это адрес, а не «внешний сервис»", () => {
  it("схема и хост, без пути", () => {
    expect(place("https://api.example.com/v1/chat")).toBe("https://api.example.com");
  });

  it("логин в адресе — не адрес", () => {
    // «https://api.example.com@evil.example/» ведёт не туда, куда выглядит.
    expect(place("https://api.example.com@evil.example/v1")).toBeNull();
  });

  it("пусто и без схемы — не адрес", () => {
    expect(place("")).toBeNull();
    expect(place("api.example.com/v1")).toBeNull();
  });

  it("свой компьютер — не интернет", () => {
    expect(local("http://127.0.0.1:8080")).toBe(true);
    expect(local("http://localhost:11434")).toBe(true);
    expect(local("https://api.example.com")).toBe(false);
  });
});

describe("нет маршрута — так и сказано, а не пустое место", () => {
  it("пустой адрес: модель на этом компьютере", () => {
    const got = warning({ url: "" }, []);
    expect(got.remote).toBe(false);
    expect(got.said).toContain("модель работает на этом компьютере");
  });

  it("непонятный адрес назван, а не проглочен", () => {
    expect(warning({ url: "api.example.com" }, []).said).toContain("не понять");
  });

  it("свой компьютер предупреждения не требует", () => {
    const got = warning({ url: "http://127.0.0.1:8080/v1" }, ["привет"]);
    expect(got.remote).toBe(false);
    expect(got.said).toContain("это свой компьютер, а не интернет");
    // И тела нет: показывать нечего.
    expect(bodyLines(got)).toEqual([]);
  });
});

describe("удалённый путь — адрес, тело и что останется", () => {
  const got = warning({ url: "https://api.example.com/v1", model: "gpt-4o" }, [
    "фраза: почисти диск",
    "история: 6 реплик",
  ]);

  it("адрес и модель названы", () => {
    expect(got.where).toBe("https://api.example.com");
    expect(got.said).toContain("модель gpt-4o");
  });

  it("тело — дословно, в несколько строк", () => {
    expect(bodyLines(got)).toEqual(["фраза: почисти диск", "история: 6 реплик"]);
  });

  it("что останется — сказано отдельно, иначе человек думает, что уходит всё", () => {
    expect(got.stays).toContain("файлы, журнал и память остаются");
  });
});

describe("предупреждение не маскируется целиком", () => {
  it("ключ маскируется, текст — нет", () => {
    const got = mask("ключ sk-abcdef123456 и фраза «почисти диск»");
    expect(got).toContain("sk-…");
    // Текст фразы остаётся: иначе это сокрытие, а не предупреждение.
    expect(got).toContain("почисти диск");
  });

  it("Bearer и api_key тоже", () => {
    expect(mask("Authorization: Bearer abc123def456")).toContain("Bearer …");
    expect(mask("api_key=supersecret123")).toContain("api_key=…");
  });

  it("тело целиком остаётся видимым, кроме ключей", () => {
    const got = warning({ url: "https://api.example.com/v1" }, ["sk-abcdef12345678 и весь текст фразы"]);
    expect(got.body).toContain("и весь текст фразы");
    expect(got.body).toContain("sk-…");
  });
});

describe("такой маршрут можно сохранить?", () => {
  it("пусто — можно: это «выключено»", () => {
    expect(saveable({ url: "" }).ok).toBe(true);
  });

  it("нормальный адрес — можно", () => {
    expect(saveable({ url: "https://api.example.com/v1" }).ok).toBe(true);
  });

  it("логин в адресе и отсутствие схемы — нельзя, с причиной", () => {
    expect(saveable({ url: "https://a@b.example" }).why).toContain("уводит не туда");
    expect(saveable({ url: "api.example.com" }).why).toContain("должен начинаться с https://");
  });
});

describe("текст согласия не обещает того, чего нет (шаг 216)", () => {
  it("фраза «маршрут настраивается отдельно» убрана: настройки не существует", async () => {
    // Было: «её маршрут настраивается отдельно». Маршрута нет вовсе, и фраза
    // отправляла человека искать настройку. Обещание настройки — это приглашение.
    //
    // Важно: строка живёт **не в `t`**, а в `ask` и `voice`. Первая версия теста
    // смотрела только в `t` — и падала на «не содержит», хотя правка была на
    // месте. Поэтому берём весь модуль, а не один словарь: иначе тест проверяет
    // свою же слепоту.
    const all = await import("../i18n/ru");
    const text = JSON.stringify(all);
    expect(text).not.toContain("маршрут настраивается отдельно");
    expect(text).toContain("удалённого пути в программе нет");
  });
});
