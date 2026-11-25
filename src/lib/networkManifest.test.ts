import { describe, expect, it } from "vitest";
import { allow, MANIFEST, notAllowed, parse, strangers } from "./networkManifest";

/**
 * Шаг 425: нет скрытых сетевых запросов — список разрешённых адресов в сборке.
 */

describe("список короткий и с целью у каждого", () => {
  it("три адреса, и у каждого сказано зачем", () => {
    expect(MANIFEST).toHaveLength(3);
    for (const item of MANIFEST) expect(item.why.length).toBeGreaterThan(10);
  });

  it("скачивание модели — по кнопке", () => {
    expect(MANIFEST.find((m) => m.host === "huggingface.co")!.when).toBe("по кнопке");
  });
});

describe("строгое сравнение, а не «содержит»", () => {
  it("разрешённый адрес — можно, и сказано зачем", () => {
    const got = allow("https://huggingface.co/models/x/resolve/main/model.gguf");
    expect(got.ok).toBe(true);
    expect(got.said).toContain("скачивание модели");
  });

  it("ловушка с доменом в имени — нельзя", () => {
    expect(allow("https://huggingface.co.evil.com/model").ok).toBe(false);
  });

  it("поддомен — другой хост, сам не разрешён", () => {
    expect(allow("https://cdn.huggingface.co/x").ok).toBe(false);
  });

  it("http — нельзя, даже если домен верный", () => {
    const got = allow("http://huggingface.co/x");
    expect(got.ok).toBe(false);
    expect(got.said).toContain("только https");
  });

  it("порт отбрасывается при сравнении", () => {
    expect(parse("https://huggingface.co:443/x")!.host).toBe("huggingface.co");
  });

  it("не разбирается — нельзя", () => {
    expect(allow("не адрес").ok).toBe(false);
    expect(parse("https://user@evil.com/x")).toBeNull();
  });
});

describe("поиск чужих адресов в сборке", () => {
  it("все свои — пустой список", () => {
    expect(strangers(["https://huggingface.co/a", "https://github.com/b"])).toEqual([]);
  });

  it("один чужой — назван", () => {
    expect(strangers(["https://huggingface.co/a", "https://telemetry.example.com/c"])).toEqual(["https://telemetry.example.com/c"]);
  });
});

describe("чего список не разрешает", () => {
  it("три соблазна, включая адрес без цели", () => {
    const got = notAllowed().join();
    expect(got).toContain("должен быть в списке явно");
    expect(got).toContain("обязан объяснить, зачем он");
  });
});
