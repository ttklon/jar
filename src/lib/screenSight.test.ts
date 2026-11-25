import { describe, expect, it } from "vitest";
import { LIFE_MS, begin, end, left, looked, mayLook, warning } from "./screenSight";

/**
 * Шаг 282: Windows Copilot — экран-awareness с явным согласием на сессию.
 *
 * Взято: помощник, который видит экран и отвечает про то, что на нём. Не взято:
 * постоянное зрение, запись кадров, молчаливое продление.
 */

const NOW = 1_800_000_000_000;

describe("зрение — сессия, а не режим", () => {
  it("выключено по умолчанию", () => {
    // Человек не думает о том, что его видят, и забывает.
    const got = mayLook(null, NOW);
    expect(got.ok).toBe(false);
    expect(got.said).toContain("нужно разрешение на сессию");
  });

  it("сессия живёт две минуты — не бессрочно", () => {
    expect(LIFE_MS).toBe(2 * 60 * 1000);
    const { session } = begin("window", NOW);
    expect(session.until).toBe(NOW + LIFE_MS);
  });

  it("кончилась — кадров больше нет", () => {
    const { session } = begin("window", NOW);
    expect(mayLook(session, NOW + LIFE_MS).ok).toBe(false);
    expect(mayLook(session, NOW + LIFE_MS).said).toContain("включите ещё раз");
  });

  it("проверка при каждом кадре, а не один раз в начале", () => {
    // «Проверили при старте» — это забытое согласие с таймером.
    const { session } = begin("window", NOW);
    expect(mayLook(session, NOW + 1000).ok).toBe(true);
    expect(mayLook(session, NOW + LIFE_MS + 1).ok).toBe(false);
  });

  it("посмотрели — считается", () => {
    const { session } = begin("screen", NOW);
    expect(left(looked(session), NOW)).toContain("осталось");
    expect(looked(session).looks).toBe(1);
  });
});

describe("окно называется до начала", () => {
  it("весь экран и одно окно — разная приватность", () => {
    expect(warning("screen")).toContain("весь экран");
    expect(warning("window")).toContain("только это окно");
  });

  it("сказано, что попадёт в кадр, а не только что это приватно", () => {
    // Согласие — это понимание содержимого, а не «ок».
    expect(warning("screen")).toContain("переписка");
    expect(warning("screen")).toContain("не сохраняются");
  });

  it("начало называет срок и обещание не сохранять", () => {
    const got = begin("window", NOW);
    expect(got.said).toContain("две минуты");
    expect(got.said).toContain("не сохраняются");
  });
});

describe("конец — сразу, а не «когда истечёт»", () => {
  it("закрыли разговор — зрение выключено", () => {
    const { session } = begin("window", NOW);
    const got = end(looked(session), NOW + 1000);
    expect(got.session).toBeNull();
  });

  it("сколько посмотрели — сказано числом", () => {
    const { session } = begin("window", NOW);
    const got = end(looked(looked(session)), NOW + 1000);
    expect(got.said).toContain("2 раза");
    expect(got.said).toContain("ничего не сохранили");
  });

  it("ни одного кадра — так и сказано", () => {
    const { session } = begin("window", NOW);
    expect(end(session, NOW).said).toContain("ни одного кадра");
  });

  it("выключать нечего — не ошибка", () => {
    expect(end(null, NOW).said).toContain("и так выключено");
  });
});
