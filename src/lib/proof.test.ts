import { describe, expect, it } from "vitest";
import {
  STALE_DAYS,
  ageDays,
  ageLabel,
  borderLine,
  complete,
  isProof,
  proofLabel,
  stale,
  stillHolds,
  type Verdict,
} from "./proof";

/**
 * Шаги 3 и 4: вердикт вместе с машиной, и граница «доказано / не доказано».
 *
 * Блокер не в том, что мы мало знаем, а в том, что мы **не знаем, чего мы не
 * знаем**: «работает» без машины и даты нельзя ни опровергнуть, ни повторить.
 * Поэтому половина проверок здесь — про отказ от слова «доказано».
 */
const proof = {
  machine: "DESKTOP-7",
  os: "Windows 11 23H2",
  appVersion: "0.1.0",
  checkedAt: "2026-11-19",
};

const verdict = (over: Partial<Verdict> = {}): Verdict => ({
  what: "Движок отвечает",
  passed: true,
  proof,
  ...over,
});

describe("вердикт", () => {
  it("без машины, ОС, версии или даты — не доказательство", () => {
    // Любое отсутствующее поле ломает воспроизводимость: без ОС не повторить,
    // без версии не отнести к сборке, без даты не понять, актуально ли.
    expect(isProof(verdict())).toBe(true);
    for (const field of ["machine", "os", "appVersion", "checkedAt"] as const) {
      const partial = { ...proof, [field]: "" };
      expect(isProof(verdict({ proof: partial }))).toBe(false);
      // Пробел — тот же пробел: `machine: " "` не говорит, на какой машине.
      expect(complete({ ...proof, [field]: "   " })).toBe(false);
    }
    expect(isProof(verdict({ proof: null }))).toBe(false);
  });

  it("провал — провал, даже если всё записано", () => {
    expect(isProof(verdict({ passed: false }))).toBe(false);
    expect(proofLabel(verdict({ passed: false }))).toBe("провал");
  });

  it("слово «доказано» не появляется без записи, где именно", () => {
    // Именно из-за этого «готово» уже один раз вводило в заблуждение.
    expect(proofLabel(verdict({ proof: null }))).toBe("не доказано");
    expect(proofLabel(verdict({ proof: { ...proof, os: "" } }))).toBe("не доказано");
    expect(proofLabel(verdict())).toBe("доказано на этой машине");
  });
});

describe("доказательство держится, пока условия те же", () => {
  it("другая версия приложения — другое доказательство", () => {
    // Код другой, и старое доказательство к нему не относится. Истечение по
    // календарю было бы догадкой; смена версии — факт.
    expect(stillHolds(verdict(), { os: proof.os, appVersion: "0.1.0" })).toBe(true);
    expect(stillHolds(verdict(), { os: proof.os, appVersion: "0.2.0" })).toBe(false);
  });

  it("другая ОС — другие условия", () => {
    expect(stillHolds(verdict(), { os: "Windows 10 22H2", appVersion: proof.appVersion })).toBe(false);
  });

  it("условий не знаем — не утверждаем, что держится", () => {
    // Молчание не должно читаться как «да».
    expect(stillHolds(verdict(), null)).toBe(false);
    expect(stillHolds(verdict({ proof: null }), { os: proof.os, appVersion: proof.appVersion })).toBe(false);
  });
});

describe("граница рядом с экраном (шаг 4)", () => {
  const now = { os: proof.os, appVersion: proof.appVersion };

  it("доказано всё — так и говорится, с числом", () => {
    expect(borderLine([verdict(), verdict()], now)).toBe("на этой машине доказано: 2 проверки");
    expect(borderLine([verdict()], now)).toBe("на этой машине доказано: 1 проверка");
  });

  it("одно непроверенное — граница есть, и число названо", () => {
    // «Не доказано» без числа — упрёк; с числом — работа, которую видно.
    expect(borderLine([verdict(), verdict({ proof: null }), verdict()], now)).toBe(
      "на этой машине не доказано: 1 из 3 проверок",
    );
  });

  it("пусто — не «всё хорошо», а «не проверяли»", () => {
    // Пустой список выглядит как «всё хорошо» — ровно та ошибка, от которой шаг.
    expect(borderLine([], now)).toBe("на этой машине не доказано: проверок не было");
  });

  it("доказательство с другой версии не считается", () => {
    expect(borderLine([verdict()], { os: proof.os, appVersion: "9.9.9" })).toBe(
      "на этой машине не доказано: 1 из 1 проверки",
    );
  });
});

describe("возраст доказательства (шаг 12)", () => {
  // «Работало месяц назад» — это не «работает». Возраст отвечает на вопрос «как
  // давно смотрели», которого `stillHolds` не задаёт.
  const today = new Date(2026, 10, 20); // 20 ноября 2026

  it("возраст считается по календарю, а не по часам", () => {
    // Иначе один и тот же вердикт утром и вечером назывался бы по-разному.
    expect(ageDays("2026-11-20", today)).toBe(0);
    expect(ageDays("2026-11-19", today)).toBe(1);
    expect(ageDays("2026-11-13", today)).toBe(7);
    expect(ageDays("2026-10-21", today)).toBe(30);
  });

  it("возраст называется датой, а не оценкой", () => {
    // Порог — догадка, дата — факт. Слово «старое» только для действительно
    // старого, иначе оно перестанет значить что-либо.
    expect(ageLabel("2026-11-20", today)).toBe("проверено сегодня");
    expect(ageLabel("2026-11-19", today)).toBe("проверено вчера");
    expect(ageLabel("2026-11-17", today)).toBe("проверено 3 дня назад");
    expect(ageLabel("2026-11-06", today)).toBe("проверено 2 недели назад");
    expect(ageLabel("2026-08-22", today)).toBe("проверено 3 месяца назад");
    expect(ageLabel("2024-11-20", today)).toBe("проверено 2 года назад — старое");
  });

  it("нет даты — нет и возраста", () => {
    // Молчание не должно читаться как «свежо».
    expect(ageDays("", today)).toBeNull();
    expect(ageDays("не дата", today)).toBeNull();
    expect(ageLabel("", today)).toBe("дата проверки не записана");
  });

  it("дата из будущего — ошибка записи, а не «свежо»", () => {
    expect(ageDays("2026-12-01", today)).toBeNull();
    expect(stale("2026-12-01", today)).toBe(true);
  });

  it("пора перепроверить — порог назван и он один", () => {
    // 90 дней: за квартал успевает смениться и Windows, и приложение. Порог в
    // одном месте, чтобы его можно было пересмотреть, а не искать по коду.
    expect(STALE_DAYS).toBe(90);
    expect(stale("2026-11-20", today)).toBe(false);
    expect(stale("2026-08-21", today)).toBe(true); // 91 день — уже старое
    expect(stale("2026-08-22", today)).toBe(false); // 90 дней ровно — ещё нет
    expect(stale("2026-06-01", today)).toBe(true);
  });
});
