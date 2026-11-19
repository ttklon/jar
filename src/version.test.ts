import { describe, expect, it } from "vitest";
import pkg from "../package.json";
import { APP_VERSION } from "./version";

describe("версия", () => {
  it("совпадает с package.json", () => {
    // Версия живёт в двух местах: в манифесте npm и в UI/логах. Разъезд означает,
    // что пользователь видит в «Настройках» не ту версию, что установлена.
    expect(APP_VERSION).toBe(pkg.version);
  });
});
