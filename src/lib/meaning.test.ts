import { describe, expect, it } from "vitest";
import { conceptOf, distance, layout, near, search, wants } from "./meaning";
import type { Fact } from "./memoryView";

/**
 * Шаг 275: память ищется по-русски и по смыслу, а не по точным словам.
 *
 * `recall` (268) сводит окончания и не путает путь со словом, но ищет точные
 * слова. Человек их не помнит: говорит «директория» про папку, ошибается в
 * наборе, забывает переключить раскладку.
 */

const fact = (over: Partial<Fact> = {}): Fact => ({
  id: "folder:D:\\Отчёты",
  kind: "folder",
  label: "папка D:\\Отчёты",
  why: "открывали 4 раза",
  removable: true,
  because: "",
  ...over,
});

const MEMORY: Fact[] = [
  fact(),
  fact({ id: "folder:D:\\Фото", label: "папка D:\\Фото", why: "открывали 2 раза" }),
  fact({ id: "voice:Алла", kind: "voice", label: "голос Алла", why: "выбирали 3 раза" }),
  fact({ id: "program:Chrome", kind: "program", label: "программа Chrome", why: "запускали 5 раз" }),
  fact({ id: "method:переименуй фото", kind: "method", label: "способ: переименуй фото", why: "повторяли дважды" }),
];

describe("синоним — это та же вещь под другим словом", () => {
  it("«директория» находит папку", () => {
    // В памяти «папка», человек спрашивает «директория». Слова разные, вещь одна.
    const got = search(MEMORY, "директория");
    expect(got.hits.length).toBe(2);
    expect(got.hits.every((hit) => hit.fact.kind === "folder")).toBe(true);
  });

  it("«каталог с отчётами» находит папку отчётов", () => {
    const got = search(MEMORY, "каталог отчёты");
    expect(got.hits.length).toBe(1);
    expect(got.hits[0]!.fact.label).toContain("Отчёты");
  });

  it("«озвучка» находит голос, а не программу", () => {
    const got = search(MEMORY, "озвучка");
    expect(got.hits.length).toBe(1);
    expect(got.hits[0]!.fact.kind).toBe("voice");
  });

  it("«приложение» находит программу", () => {
    const got = search(MEMORY, "приложение");
    expect(got.hits.map((hit) => hit.fact.kind)).toEqual(["program"]);
  });

  it("понятие названо в причине: «это папка»", () => {
    expect(search(MEMORY, "директория").hits[0]!.because).toContain("это папка");
  });

  it("синоним не склеивает разные вещи", () => {
    // «Звук» — про громкость, а не про голос: иначе поиск угадывает поверх верного.
    const got = search(MEMORY, "звук");
    expect(got.hits.length).toBe(0);
  });
});

describe("опечатка прощается, но не любой ценой", () => {
  it("«отчоты» находит «Отчёты»", () => {
    const got = search(MEMORY, "отчоты");
    expect(got.hits.length).toBe(1);
    expect(got.hits[0]!.how).toBe("typo");
    expect(got.hits[0]!.because).toContain("похоже на «отчоты»");
  });

  it("«фтоо» находит «фото»", () => {
    expect(search(MEMORY, "фтоо").hits.length).toBeGreaterThan(0);
  });

  it("короткие слова не прощаются: «дом» и «дым» — разные", () => {
    // Одна правка в коротком слове — уже другое слово.
    expect(near("дом", "дым")).toBe(false);
    expect(near("отчоты", "отчеты")).toBe(true);
  });

  it("длинное слово прощает две правки, короткое — одну", () => {
    expect(distance("переименовать", "переименвоать")).toBeLessThanOrEqual(2);
    expect(near("переименовать", "переименвоать")).toBe(true);
    expect(near("фото", "фтпх")).toBe(false);
  });
});

describe("раскладка не имеет отношения к тому, что человек ищет", () => {
  it("«Gfgrf» — это «Папка»", () => {
    expect(layout("Gfgrf")).toBe("папка");
    const got = search(MEMORY, "Gfgrf");
    expect(got.hits.length).toBe(2);
  });

  it("другое слово в латинице переводится так же", () => {
    // п=g е=t р=h е=t и=b м=v е=t н=y у=e й=q
    expect(layout("gthtbvtyeq")).toBe("переименуй");
  });

  it("русское слово не переводится в латиницу", () => {
    // Обратное направление не нужно: искать по-английски в русской памяти нечего.
    expect(layout("папка")).toBe("папка");
  });

  it("смешанная строка не считается раскладкой", () => {
    // «D:\Фото» — это путь, а не забытая раскладка.
    expect(wants("D:\\Фото").words).toContain("фото");
  });
});

describe("слово действия в вопросе не мешает", () => {
  it("«куда я сохранял отчёты» — вопрос про папку", () => {
    const got = search(MEMORY, "куда я сохранял отчёты");
    expect(got.hits.length).toBe(1);
    expect(got.hits[0]!.fact.label).toContain("Отчёты");
  });

  it("«где открывал фото» находит фото, а не способ действия", () => {
    // «Где» и «открывал» — слова действия: в памяти их нет, и требовать их
    // значит отвечать «ничего не нашлось» на верный вопрос.
    const got = search(MEMORY, "где открывал фото");
    expect(got.hits.length).toBeGreaterThan(0);
    expect(got.hits.some((hit) => hit.fact.label.includes("Фото"))).toBe(true);
  });
});

describe("порядок: буквальное важнее догадки", () => {
  it("точное слово идёт раньше найденного по синониму", () => {
    // Человек, написавший ровно то, что в памяти, должен увидеть это первым.
    // Факт с точным словом в подписи — против факта, найденного по понятию
    // «директория»: они оба папки, и различить их может только `how`.
    // Два попадания: одно нашлось словом «отчёты», другое — только понятием
    // «директория» (в его подписи слова «отчёты» нет). Порядок проверяется
    // только когда есть с чем сравнивать.
    const exact = fact({ id: "folder:D:\\Отчёты", label: "папка D:\\Отчёты" });
    const also = fact({ id: "folder:D:\\Архив", label: "папка D:\\Архив", why: "открывали редко" });
    const byConcept = fact({ id: "folder:D:\\Фото", label: "папка D:\\Фото" });
    const got = search([byConcept, exact, also], "директория");
    expect(got.hits.length).toBe(3);
    expect(got.hits.every((hit) => hit.how === "concept")).toBe(true);

    const byWord = search([byConcept, exact], "директория отчёты");
    expect(byWord.hits.length).toBe(1);
    expect(byWord.hits[0]!.how).toBe("exact");

    // Все три вида сразу: без этого перевёрнутый порядок проверять не на чем —
    // `exact` и `concept` просто не встречаются вместе с `typo`.
    // Три вида сразу — единственный способ проверить порядок: если в выдаче
    // меньше двух видов, сортировка не проверяется вовсе.
    const list = [
      fact({ id: "folder:D:\\Отчоты", label: "папка D:\\Отчоты" }),
      fact({ id: "folder:D:\\Архив", label: "папка D:\\Архив", why: "открывали редко" }),
      fact({ id: "folder:D:\\Отчёты", label: "папка D:\\Отчёты" }),
    ];
    const mixed = search(list, "директория отчёты");
    // «Архив» не содержит обязательного слова «отчёты» — он и не должен
    // находиться: понятие спрашивает о виде, а не отменяет остальные слова.
    expect(mixed.hits.length).toBe(2);
    expect(mixed.hits[0]!.how).toBe("exact");
    expect(mixed.hits[1]!.how).toBe("typo");

    // А вот когда обязательных слов нет вовсе, порядок виден по понятию:
    const onlyConcept = search(list, "директория");
    expect(onlyConcept.hits.length).toBe(3);
    expect(onlyConcept.hits.every((hit) => hit.how === "concept")).toBe(true);
  });

  it("причина у каждого найденного названа", () => {
    const got = search(MEMORY, "папка");
    expect(got.hits.every((hit) => hit.because !== "")).toBe(true);
  });
});

describe("пустой ответ подсказывает, а не молчит", () => {
  it("«может быть, вы имели в виду»", () => {
    // Пустой ответ без подсказки заставляет гадать, есть ли это в памяти вообще.
    const got = search(MEMORY, "отчётики");
    expect(got.hits.length).toBe(0);
    expect(got.meant).toBeDefined();
    expect(got.said).toContain("может быть");
  });

  it("память пуста отличается от «не нашлось»", () => {
    expect(search([], "папка").said).toContain("память пуста");
  });

  it("вопрос из одних действий — «скажите, что искать»", () => {
    expect(search(MEMORY, "куда где").said).toContain("что искать");
  });

  it("нашлось — названо числом", () => {
    expect(search(MEMORY, "папка").said).toContain("нашлось 2 факта");
  });
});

describe("понятие определяется по слову", () => {
  it("папка, каталог, директория — одно понятие", () => {
    expect(conceptOf("папка")).toBe("folder");
    expect(conceptOf("каталог")).toBe("folder");
    expect(conceptOf("директория")).toBe("folder");
  });

  it("обычное слово — не понятие", () => {
    expect(conceptOf("отчёты")).toBeNull();
  });
});
