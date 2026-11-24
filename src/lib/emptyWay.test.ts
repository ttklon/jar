import { describe, expect, it } from "vitest";
import { again, screen, usable, type Kind } from "./emptyWay";

/**
 * Шаг 188: пустота с выходом, а не тупик.
 *
 * «Ничего не нашлось» отвечает на «есть ли это здесь» и молчит на «что делать».
 */

const KINDS: Kind[] = ["unknown", "blocked", "unclear", "nothing-yet", "failed"];

describe("пустота бывает разной, и это видно", () => {
  it("пять видов — пять разных ответов, а не один текст", () => {
    const titles = KINDS.map((kind) => screen(kind, "почисти диск").title);
    expect(new Set(titles).size).toBe(KINDS.length);
  });

  it("«не понял» не выдаётся за «такого нет» — иначе человек ищет несуществующее", () => {
    expect(screen("unclear", "почисти").title).toContain("не понял");
    expect(screen("unclear", "почисти").why).toContain("разница между «не понял» и «нет такого»");
    expect(screen("unknown", "почисти").title).toContain("ничего нет");
  });

  it("сбой поиска не сваливает вину на человека", () => {
    const got = screen("failed");
    expect(got.title).toContain("это не «ничего не нашлось»");
    expect(got.steps.map((step) => step.said).join(" ")).not.toContain("переформулируйте");
  });

  it("«есть, но не выполнится» — отдельный вид: там предел, а не отсутствие", () => {
    expect(screen("blocked").why).toContain("упирается в предел");
  });
});

describe("три шага, и у каждого действие", () => {
  it("ровно три на каждом виде пустоты", () => {
    for (const kind of KINDS) {
      const got = screen(kind, "что-нибудь");
      expect(got.steps, `вид ${kind}`).toHaveLength(3);
      expect(usable(got).ok, `вид ${kind}: ${usable(got).why}`).toBe(true);
    }
  });

  it("совет без адреса — не шаг", () => {
    const got = { kind: "unknown" as Kind, title: "", why: "", steps: [{ said: "переформулируйте", act: "" }] };
    expect(usable(got).ok).toBe(false);
    expect(usable(got).why).toContain("без действия");
  });

  it("десять шагов — меню, а не выбор", () => {
    const many = {
      kind: "unknown" as Kind,
      title: "",
      why: "",
      steps: Array.from({ length: 10 }, () => ({ said: "x", act: "y" })),
    };
    expect(usable(many).why).toContain("больше — меню");
  });

  it("у «нет такого» первый шаг — тот же смысл другими словами, а не «повторите»", () => {
    const first = screen("unknown", "почисти").steps[0]!;
    expect(first.said).toContain("по действию, а не по названию программы");
    expect(first.act.length).toBeGreaterThan(0);
  });
});

describe("повтор не выглядит как «нажатие не сработало»", () => {
  it("второй раз то же слово — названо", () => {
    expect(again("unknown", "почисти", ["почисти"])).toBe("«почисти» уже искали — ответ тот же");
  });

  it("первый раз — молчание", () => {
    expect(again("unknown", "почисти", [])).toBe("");
    expect(again("unknown", "почисти", ["другое"])).toBe("");
  });

  it("пустой запрос не повторяется: искать нечего", () => {
    expect(again("unknown", "  ", ["  "])).toBe("");
  });
});
