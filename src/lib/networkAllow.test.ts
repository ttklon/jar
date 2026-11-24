import { describe, expect, it } from "vitest";
import { allow, askBefore, DEFAULT_HOSTS, hostOf, say, under } from "./networkAllow";

/**
 * Шаг 172: сетевые адреса по умолчанию запрещены, кроме явно разрешённых.
 *
 * Пока «начинается с https» считается проверкой, слово «локально» — слово.
 */

describe("разбор адреса — факт, отдельно от правила", () => {
  it("обычный адрес даёт хост", () => {
    expect(hostOf("https://huggingface.co/x/y.gguf")).toEqual({ host: "huggingface.co", why: "" });
  });

  it("порт не меняет хост", () => {
    expect(hostOf("https://huggingface.co:8443/x").host).toBe("huggingface.co");
  });

  it("`user@host` — отказ: это способ показать один хост и открыть другой", () => {
    const got = hostOf("https://huggingface.co@evil.example/x.gguf");
    expect(got.why).toContain("логин");
  });

  it("схема кроме http(s) — отказ", () => {
    expect(hostOf("file:///C:/a.gguf").why).toContain("схема file");
    expect(hostOf("ftp://a/b").why).toContain("схема ftp");
  });

  it("голый IP — отказ", () => {
    expect(hostOf("http://93.184.216.34/x").why).toContain("голый IP");
  });

  it("кириллица в домене — отказ: похожий домен не тот домен", () => {
    expect(hostOf("https://huggіngface.co/x").why).toContain("не латинские буквы");
  });

  it("пустое и мусор — отказ, а не «наверное, нормально»", () => {
    expect(hostOf("").why).toContain("пуст");
    expect(hostOf("huggingface.co/x").why).toContain("нет схемы");
    expect(hostOf("https://").why).toContain("нет хоста");
  });
});

describe("сравнение по границе домена, а не по началу строки", () => {
  it("сам домен и его поддомены — внутри", () => {
    expect(under("huggingface.co", "huggingface.co")).toBe(true);
    expect(under("cdn.huggingface.co", "huggingface.co")).toBe(true);
  });

  it("сосед с похожим именем — вне", () => {
    expect(under("nothuggingface.co", "huggingface.co")).toBe(false);
    expect(under("huggingface.co.evil.example", "huggingface.co")).toBe(false);
  });
});

describe("по умолчанию — только список", () => {
  it("huggingface пускают по умолчанию", () => {
    const got = allow("https://huggingface.co/x/y.gguf");
    expect(got.ok).toBe(true);
    expect(got.by).toBe("default");
    expect(DEFAULT_HOSTS).toEqual(["huggingface.co"]);
  });

  it("чужой хост — отказ, и он назван", () => {
    const got = allow("https://evil.example/x.gguf");
    expect(got.ok).toBe(false);
    expect(got.why).toContain("хост evil.example не в списке разрешённых");
    expect(got.why).toContain("huggingface.co");
  });

  it("подделка через user@ — отказ, хотя начинается с https", () => {
    const got = allow("https://huggingface.co@evil.example/x.gguf");
    expect(got.ok).toBe(false);
    expect(got.why).toContain("логин");
  });

  it("похожий домен — отказ, хотя начинается так же", () => {
    expect(allow("https://huggingface.co.evil.example/x").ok).toBe(false);
  });
});

describe("явное разрешение — с датой и по имени", () => {
  const at = Date.parse("2026-11-20T12:00:00Z");

  it("разрешённый хост пускают, и сказано, кем и когда", () => {
    const got = allow("https://my-mirror.example/m.gguf", [{ host: "my-mirror.example", at }]);
    expect(got.ok).toBe(true);
    expect(got.by).toBe("granted");
    expect(got.why).toBe("разрешено вами 2026-11-20");
  });

  it("разрешение на домен покрывает его поддомены, но не соседей", () => {
    const granted = [{ host: "example.org", at }];
    expect(allow("https://cdn.example.org/m.gguf", granted).ok).toBe(true);
    expect(allow("https://example.org.evil.example/m.gguf", granted).ok).toBe(false);
  });

  it("разрешение другого хоста не помогает этому", () => {
    expect(allow("https://evil.example/x", [{ host: "mirror.example", at }]).ok).toBe(false);
  });
});

describe("до разрешения человек видит, куда уйдёт запрос", () => {
  it("хост назван, и сказано, что без разрешения ничего не начнётся", () => {
    const got = askBefore("https://my-mirror.example/m.gguf");
    expect(got.host).toBe("my-mirror.example");
    expect(got.said).toContain("без разрешения скачивание не начнётся");
  });

  it("непонятный адрес — «разрешать нечего», а не «разрешить?»", () => {
    expect(askBefore("ftp://a/b").said).toContain("разрешать нечего");
  });
});

describe("строка для экрана", () => {
  it("отказ называет причину", () => {
    expect(say(allow("https://evil.example/x"))).toContain("отказ: хост evil.example");
  });

  it("разрешённое по умолчанию названо списком", () => {
    expect(say(allow("https://huggingface.co/x"))).toBe("huggingface.co: в списке разрешённых");
  });
});
