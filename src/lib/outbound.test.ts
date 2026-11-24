import { describe, expect, it } from "vitest";
import { EXITS, exits, happened, hostOf, isLocal, line, LOCAL, summary, whenOffline } from "./outbound";

/**
 * Шаг 167: что уйдёт наружу — адреса, тела, когда.
 *
 * «Всё локально» было обещанием, которое негде было увидеть. Приватность —
 * наблюдаемое свойство: либо человек видит список, либо это не приватность.
 */

describe("локальное — не «наружу»", () => {
  it("127.0.0.1 и localhost — свой компьютер", () => {
    expect(isLocal("127.0.0.1:8080")).toBe(true);
    expect(isLocal("localhost")).toBe(true);
    expect(isLocal("::1")).toBe(true);
    expect(isLocal("[::1]:8080")).toBe(true);
  });

  it("huggingface — не свой компьютер", () => {
    expect(isLocal("huggingface.co")).toBe(false);
    expect(isLocal(null)).toBe(false);
  });
});

describe("адрес называется или честно не называется", () => {
  it("хост из настоящей ссылки", () => {
    expect(hostOf("https://huggingface.co/x/y.gguf")).toBe("huggingface.co");
    expect(hostOf("http://127.0.0.1:8080/a")).toBe("127.0.0.1:8080");
  });

  it("не ссылка — не адрес", () => {
    expect(hostOf("модель.gguf")).toBeNull();
    expect(hostOf("file:///C:/a.gguf")).toBeNull();
  });

  it("ссылки не названы — «адрес задаёт ссылка», а не выдуманный сервер", () => {
    const got = exits([]);
    const outside = got.filter((exit) => exit.place === "outside");
    expect(outside.every((exit) => exit.host === null)).toBe(true);
    expect(line(outside[0]!)).toContain("адрес задаёт ссылка");
  });

  it("ссылки названы — они и стоят в списке", () => {
    const got = exits(["https://huggingface.co/x/qwen.gguf"]);
    expect(got[0]!.host).toBe("huggingface.co");
  });
});

describe("тело названо, а не «данные»", () => {
  it("у загрузки тела нет — и это сказано словами", () => {
    expect(EXITS[0]!.body).toContain("ничего, кроме запроса файла");
    expect(EXITS[0]!.body).toContain("ни фразы, ни истории");
  });

  it("у локального обращения тело есть, но оно до своей машины", () => {
    expect(LOCAL[0]!.body).toContain("до своего же компьютера");
  });

  it("когда — момент, а не «иногда»", () => {
    expect(EXITS[0]!.when).toContain("только по нажатию «Скачать»");
  });
});

describe("сводка — числом", () => {
  it("сколько дверей наружу и сколько локального", () => {
    expect(summary(exits())).toBe("наружу: 2 двери; на своём компьютере — 1");
  });

  it("наружу пусто — так и сказано, а локальное названо отдельно", () => {
    expect(summary(LOCAL)).toBe("наружу не уходит ничего; на своём компьютере — 1 обращение");
    expect(summary([])).toBe("наружу не уходит ничего: ни одного адреса вне машины");
  });
});

describe("сеть выключена — наружу пусто", () => {
  it("при выключенной сети обязательных дверей наружу нет", () => {
    expect(whenOffline(exits(["https://huggingface.co/x.gguf"]))).toEqual([]);
  });

  it("скачивание — необязательное: без него работает всё остальное", () => {
    expect(exits().filter((exit) => exit.place === "outside").every((exit) => exit.optional)).toBe(true);
  });
});

describe("«не было» и «не может быть» — разные факты", () => {
  it("скачиваний не было — так и сказано, без «ничего не ушло» наугад", () => {
    expect(happened([])).toContain("скачиваний не было");
  });

  it("скачивание было — число названо", () => {
    const got = happened([
      { subject: "models|скачать|модель разговора", kind: "finished" },
      { subject: "models|скачать|модель разговора", kind: "started" },
    ]);
    expect(got).toContain("скачиваний было 1");
  });
});
