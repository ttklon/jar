import { describe, expect, it } from "vitest";
import {
  LIMIT,
  append,
  attempt,
  loadExceptions,
  loadLog,
  saveExceptions,
  saveLog,
  view,
  type Entry,
  type Store,
} from "./memoryJournal";
import type { Exception } from "./dontStore";

/**
 * Шаг 270: «не запоминай» — факт не появился после перезапуска, и это видно
 * в журнале. И это видно в журнале.
 *
 * Просьбу без следа нельзя проверить: человек сказал «не запоминай это», закрыл
 * приложение, открыл — и не понял, почему факта нет. Или хуже: почему факт есть.
 * Обе беды из одного — решение жило в памяти процесса.
 */

const NOW = 1_800_000_000_000;
const DAY = 24 * 60 * 60 * 1000;
const folder = { kind: "folder", value: "D:\\Личное" };
const exception: Exception = { kind: "folder", value: "D:\\Личное", at: NOW, said: "не запоминай это" };

/** Хранилище, которое переживает «перезапуск»: это один и тот же объект. */
function disk(): Store & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
  };
}

const entry = (over: Partial<Entry> = {}): Entry => ({
  at: NOW,
  label: "папка D:\\Личное",
  written: false,
  because: "вы просили не запоминать папку D:\\Личное",
  ...over,
});

describe("исключение переживает перезапуск", () => {
  it("сохранённое читается после нового запуска", () => {
    // Это и есть шаг: просьба обещает вещи, которые должны пережить перезапуск.
    const store = disk();
    saveExceptions(store, [exception]);
    const got = loadExceptions(store);
    expect(got.exceptions.length).toBe(1);
    expect(got.exceptions[0]!.value).toBe("D:\\Личное");
    expect(got.said).toBe("");
  });

  it("пустое хранилище — не ошибка", () => {
    expect(loadExceptions(disk()).exceptions).toEqual([]);
  });

  it("недоступное хранилище — честно сказано, а не тишина", () => {
    const got = saveExceptions(null, [exception]);
    expect(got.ok).toBe(false);
    expect(got.said).toContain("не переживёт перезапуск");
    expect(loadExceptions(null).exceptions).toEqual([]);
    expect(loadExceptions(null).said).toContain("не переживут перезапуск");
  });

  it("испорченное хранилище — причина, а не падение", () => {
    const store = disk();
    store.setItem("jar.dontStore.v1", "{это не json");
    const got = loadExceptions(store);
    expect(got.exceptions).toEqual([]);
    expect(got.said).toContain("повреждены");
  });

  it("мусор в списке пропускается, остальное сохраняется", () => {
    const store = disk();
    store.setItem("jar.dontStore.v1", JSON.stringify([exception, { kind: "folder" }, null, { kind: "", at: 1 }]));
    expect(loadExceptions(store).exceptions.length).toBe(1);
  });
});

describe("факт после перезапуска не появляется", () => {
  it("исключение с диска запрещает запись в новом процессе", () => {
    const store = disk();
    saveExceptions(store, [exception]);
    // «Перезапуск»: берём исключения только из хранилища, как это сделает
    // новый процесс, — и факт всё равно не записывается.
    const got = attempt(folder, loadExceptions(store).exceptions, NOW + DAY);
    expect(got.write).toBe(false);
    expect(got.said).toContain("не запомню");
  });

  it("после истечения срока факт записывается", () => {
    const store = disk();
    saveExceptions(store, [exception]);
    const got = attempt(folder, loadExceptions(store).exceptions, NOW + 100 * DAY);
    expect(got.write).toBe(true);
  });

  it("другой факт записывается, несмотря на исключение", () => {
    // Это главное: «не запоминай это» не значит «не запоминай ничего».
    const got = attempt({ kind: "folder", value: "D:\\Отчёты" }, [exception], NOW);
    expect(got.write).toBe(true);
    expect(got.said).toContain("запомню");
  });
});

describe("решение видно в журнале", () => {
  it("отказ записывается с причиной", () => {
    // «Не записалось» и «записалось, но не показывается» — разные беды,
    // и различает их только причина.
    const got = attempt(folder, [exception], NOW);
    expect(got.entry.written).toBe(false);
    expect(got.entry.because).toContain("просили не запоминать");
    expect(got.entry.label).toBe("папка D:\\Личное");
  });

  it("запись тоже попадает в журнал — с пустой причиной", () => {
    const got = attempt({ kind: "folder", value: "D:\\Отчёты" }, [exception], NOW);
    expect(got.entry.written).toBe(true);
    expect(got.entry.because).toBe("");
  });

  it("журнал переживает перезапуск", () => {
    const store = disk();
    saveLog(store, [attempt(folder, [exception], NOW).entry]);
    const got = loadLog(store);
    expect(got.log.length).toBe(1);
    expect(got.log[0]!.written).toBe(false);
  });

  it("сломанный журнал — причина, а не падение", () => {
    const store = disk();
    store.setItem("jar.memoryLog.v1", "не json");
    const got = loadLog(store);
    expect(got.log).toEqual([]);
    expect(got.said).toContain("повреждён");
  });
});

describe("журнал объясняет «почему этого нет»", () => {
  it("отказы идут первыми и с причиной", () => {
    const log = [entry({ at: NOW }), entry({ at: NOW + 1000, written: true, because: "" })];
    const got = view(log);
    expect(got.lines.length).toBe(1);
    expect(got.lines[0]).toContain("не записано");
    expect(got.lines[0]).toContain("просили не запоминать");
    // После «из» — родительный падеж: «из 2 решений», а не «из 2 решения».
    expect(got.said).toContain("1 отказ из 2 решений");
  });

  it("отказов не было — так и сказано", () => {
    const got = view([entry({ written: true, because: "" })]);
    expect(got.lines[0]).toContain("отказов не было");
  });

  it("пустой журнал отличается от «всё записалось»", () => {
    expect(view([]).said).toContain("память ещё ничего не решала");
  });

  it("новые отказы показываются первыми", () => {
    const got = view([
      entry({ at: NOW - DAY, because: "старая причина" }),
      entry({ at: NOW, because: "новая причина" }),
    ]);
    expect(got.lines[0]).toContain("новая причина");
  });
});

describe("журнал не растёт бесконечно", () => {
  it("старое уходит, новое остаётся", () => {
    let log: Entry[] = [];
    for (let i = 0; i < LIMIT + 5; i += 1) log = append(log, entry({ at: NOW + i }));
    expect(log.length).toBe(LIMIT);
    expect(log[log.length - 1]!.at).toBe(NOW + LIMIT + 4);
  });

  it("в пределе ровно сорок, как у журнала запуска", () => {
    expect(LIMIT).toBe(40);
  });
});
