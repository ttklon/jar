import { describe, expect, it } from "vitest";
import { audit, checked, dangerous, line, STALE_MS, summary, type Event } from "./dangerAudit";

/**
 * Шаг 166: аудит опасных рук — что **реально** проверено, а что только отказывали.
 *
 * «Запросили и отказали» — не проверка: рука не работала, и мы о ней ничего не знаем.
 */

const NOW = Date.parse("2026-11-20T12:00:00Z");
const day = 24 * 60 * 60 * 1000;

const run = (subject: string, risk: string, at: number, outcome = "ok"): Event[] => [
  { subject, risk, kind: "started", outcome: "", at_ms: at },
  { subject, risk, kind: "finished", outcome, at_ms: at },
];

describe("«проверено» — это запуск, а не событие", () => {
  it("отказ политики не проверяет руку", () => {
    const rows = audit([
      { subject: "files|удалить|папку", risk: "destructive", kind: "requested", outcome: "", at_ms: NOW - day },
      { subject: "files|удалить|папку", risk: "destructive", kind: "denied", outcome: "denied: policy", at_ms: NOW - day },
    ]);
    const row = rows[0]!;
    expect(row.started).toBe(0);
    expect(row.denied).toBe(1);
    expect(checked(row)).toBe(false);
    expect(line(row, NOW)).toContain("не проверено — политика отказала 1 раз, рука не запускалась");
  });

  it("спросили человека и не нажали — тоже не проверка", () => {
    const rows = audit([
      { subject: "money|оплатить|счёт", risk: "money", kind: "requested", outcome: "", at_ms: NOW },
      { subject: "money|оплатить|счёт", risk: "money", kind: "confirmed", outcome: "", at_ms: NOW },
    ]);
    expect(rows[0]!.started).toBe(0);
    expect(rows[0]!.asked).toBe(2);
  });

  it("запуск и итог — проверка, и итог сохранён", () => {
    const rows = audit(run("files|удалить|папку", "destructive", NOW - day));
    const row = rows[0]!;
    expect(row.started).toBe(1);
    expect(row.ok).toBe(1);
    expect(checked(row)).toBe(true);
    expect(line(row, NOW)).toContain("запускали 1 раз, удачно 1, последний — вчера");
  });

  it("упавший запуск — это тоже проверка, и результат «не работает»", () => {
    const rows = audit(run("apps|закрыть|программу", "external", NOW, "error: нет окна"));
    expect(checked(rows[0]!)).toBe(true);
    expect(line(rows[0]!, NOW)).toContain("с ошибкой 1");
  });

  it("начало потерялось, а итог есть — запуск не теряется", () => {
    const rows = audit([{ subject: "x|y|z", risk: "external", kind: "finished", outcome: "ok", at_ms: NOW }]);
    expect(rows[0]!.started).toBe(1);
    expect(rows[0]!.ok).toBe(1);
  });
});

describe("счёт — числом", () => {
  it("несколько запусков складываются, а не показываются последним", () => {
    const rows = audit([
      ...run("files|удалить|папку", "destructive", NOW - 5 * day, "ok"),
      ...run("files|удалить|папку", "destructive", NOW - 2 * day, "error: занято"),
      ...run("files|удалить|папку", "destructive", NOW - day, "ok"),
    ]);
    const row = rows[0]!;
    expect(row.started).toBe(3);
    expect(row.ok).toBe(2);
    expect(row.failed).toBe(1);
    expect(row.lastOutcome).toBe("ok");
    expect(line(row, NOW)).toContain("запускали 3 раз");
  });

  it("риск берётся самый высокий из встреченных: занизить опасность хуже", () => {
    const rows = audit([
      { subject: "files|удалить|папку", risk: "read", kind: "requested", outcome: "", at_ms: NOW },
      { subject: "files|удалить|папку", risk: "destructive", kind: "requested", outcome: "", at_ms: NOW },
    ]);
    expect(rows[0]!.risk).toBe("destructive");
  });

  it("событие без ключа в аудит не попадает", () => {
    expect(audit([{ subject: "  ", risk: "read", kind: "started", outcome: "", at_ms: NOW }])).toHaveLength(0);
  });
});

describe("опасное — первым, и проверенное раньше непроверенного", () => {
  it("сначала то, что действительно пробовали; затем риск", () => {
    const rows = audit([
      ...run("files|скопировать|файлы", "write-local", NOW),
      ...run("files|удалить|папку", "destructive", NOW),
      { subject: "money|оплатить|счёт", risk: "money", kind: "requested", outcome: "", at_ms: NOW },
      { subject: "accounts|сменить|пароль", risk: "identity", kind: "denied", outcome: "denied", at_ms: NOW },
    ]);
    const order = dangerous(rows).map((row) => row.subject);
    expect(order[0]).toBe("files|удалить|папку");
    // Непроверенные — после, и среди них выше риск.
    expect(order.indexOf("money|оплатить|счёт")).toBeLessThan(order.indexOf("accounts|сменить|пароль"));
    // Безопасное в опасный список не попадает вовсе.
    expect(order).not.toContain("files|скопировать|файлы");
  });
});

describe("старое называется старым", () => {
  it("проверка старше месяца — не проверка на сегодня", () => {
    const rows = audit(run("files|удалить|папку", "destructive", NOW - 40 * day));
    const got = line(rows[0]!, NOW);
    expect(got).toContain("проверка старая: с тех пор прошло больше месяца");
    expect(STALE_MS).toBe(30 * day);
  });

  it("недавняя — без предупреждения", () => {
    const rows = audit(run("files|удалить|папку", "destructive", NOW - 2 * day));
    expect(line(rows[0]!, NOW)).not.toContain("старая");
  });
});

describe("сводка отвечает «что реально проверено»", () => {
  it("числом: сколько опасных, сколько проверено, сколько не запускали", () => {
    const rows = audit([
      ...run("files|удалить|папку", "destructive", NOW),
      { subject: "money|оплатить|счёт", risk: "money", kind: "requested", outcome: "", at_ms: NOW },
      { subject: "apps|закрыть|программу", risk: "external", kind: "denied", outcome: "denied", at_ms: NOW },
    ]);
    const got = summary(rows);
    expect(got.said).toBe("опасных рук: 3, проверено запуском: 1, ни разу не запускали: 2");
    expect(got.failed).toBe(0);
  });

  it("«запускали и всё время падало» — отдельный факт, а не «проверено»", () => {
    const rows = audit(run("files|удалить|папку", "destructive", NOW, "error: отказ"));
    expect(summary(rows).failed).toBe(1);
  });

  it("пусто — сказано прямо, а не пустой строкой", () => {
    expect(summary([]).said).toBe("опасных рук в журнале нет — проверять нечего");
  });
});
