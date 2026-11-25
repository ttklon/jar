import { describe, expect, it } from "vitest";
import { absent, checks, contents, notAll, where, worksOffline } from "./localProfile";

/**
 * Шаг 406: локальные профили — без аккаунта и без сети.
 */

describe("в профиле только то, что человек сказал", () => {
  it("три вещи", () => {
    expect(contents().length).toBe(3);
  });

  it("пароля нет, потому что нет входа", () => {
    expect(absent().join()).toContain("его нет, потому что нет входа");
  });

  it("ни почты, ни привязки к устройству", () => {
    const got = absent().join();
    expect(got).toContain("почта и телефон");
    expect(got).toContain("не привязан к машине");
  });
});

describe("работает всегда, сеть не нужна", () => {
  it("с сетью — и не использует её", () => {
    expect(worksOffline(true).said).toContain("не нужна и не используется");
  });

  it("без сети — работает", () => {
    const got = worksOffline(false);
    expect(got.ok).toBe(true);
    expect(got.said).toContain("в файле на диске");
  });
});

describe("где лежит — путь, и это всё", () => {
  it("папка profiles в данных программы", () => {
    expect(where("C:\\ZShelper\\data")).toBe("C:\\ZShelper\\data\\profiles");
    expect(where("/home/u/.zshelper")).toBe("/home/u/.zshelper/profiles");
  });
});

describe("обещание проверяется, а не объявляется", () => {
  it("три проверки, включая «ни одного запроса»", () => {
    expect(checks().length).toBe(3);
    expect(checks().join()).toContain("ни одного сетевого запроса");
  });

  it("«без аккаунта» ≠ «без сети вообще» — сказано честно", () => {
    expect(notAll()).toContain("но профиль от этого не зависит");
  });
});
