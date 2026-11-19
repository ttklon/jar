import { describe, expect, it } from "vitest";
import { decide, decisionReason } from "./policy";
import type { Risk } from "../ipc";

const status = "v1" as const;

function action(risk: Risk, state: typeof status | "never" = status) {
  return { risk, status: state };
}

describe("политика в браузере повторяет правила ядра", () => {
  it("чтение выполняется без вопроса", () => {
    expect(decide(action("read"))).toBe("allow");
  });

  it("запись, внешнее и разрушительное требуют подтверждения", () => {
    for (const risk of ["write-local", "external", "destructive"] as Risk[]) {
      expect(decide(action(risk)), risk).toBe("confirm");
    }
  });

  it("деньги и личность запрещены", () => {
    expect(decide(action("money"))).toBe("deny");
    expect(decide(action("identity"))).toBe("deny");
  });

  it("never запрещено даже для чтения", () => {
    expect(decide(action("read", "never"))).toBe("deny");
  });

  it("у каждого решения есть объяснение для человека", () => {
    for (const risk of ["read", "write-local", "destructive", "money"] as Risk[]) {
      const reason = decisionReason(decide(action(risk)), risk);
      expect(reason.length).toBeGreaterThan(10);
    }
  });
});
