import { describe, expect, it } from "vitest";
import { items, lines, overwrites, summary, type Entry } from "./undoItems";

/**
 * Шаг 175: откат показывает, **что именно** вернётся, до нажатия.
 *
 * «Шаг 2: переместить» — не ответ. Ответ — «IMG_0001.jpg: D:\Фото ← C:\Фото».
 */

const alive = (list: string[]) => (path: string) => list.includes(path);

describe("предмет, а не номер шага", () => {
  it("названы имя и пара путей — куда вернётся и откуда уйдёт", () => {
    const got = items(
      [{ kind: "move", from: "D:\\Фото\\IMG_0001.jpg", to: "C:\\Фото\\IMG_0001.jpg" }],
      alive(["D:\\Фото\\IMG_0001.jpg"]),
    );
    expect(got[0]!.said).toBe("IMG_0001.jpg: D:\\Фото\\IMG_0001.jpg ← C:\\Фото\\IMG_0001.jpg · перемещение");
  });

  it("пустой второй путь не печатается: «← » читается как «забыли»", () => {
    const got = items([{ kind: "restore", from: "C:\\Старое\\a.txt", to: "" }], () => true);
    expect(got[0]!.said).toBe("a.txt: C:\\Старое\\a.txt · restore");
  });

  it("порядок обратный: последнее вернётся первым", () => {
    const got = items(
      [
        { kind: "move", from: "D:\\a.jpg", to: "C:\\a.jpg" },
        { kind: "rename", from: "D:\\b.jpg", to: "D:\\b-old.jpg" },
      ],
      () => true,
    );
    expect(got.map((item) => item.name)).toEqual(["b.jpg", "a.jpg"]);
  });
});

describe("чего нет — не обещать", () => {
  it("исчезнувший файл назван до нажатия, а не после", () => {
    const got = items([{ kind: "move", from: "D:\\a.jpg", to: "C:\\a.jpg" }], () => false);
    expect(got[0]!.undoable).toBe(false);
    expect(got[0]!.said).toContain("вернуть нельзя — файла D:\\a.jpg уже нет");
  });

  it("нет пути возврата — не «вернуть некуда» наугад", () => {
    const got = items([{ kind: "move", from: "", to: "C:\\a.jpg" }], () => true);
    expect(got[0]!.refusal).toContain("нет пути возврата");
  });
});

describe("автозапуск и службы откатываются иначе", () => {
  it("для них обещание — про запись, а не про файл", () => {
    const got = items([{ kind: "autostart", from: "HKCU\\Run\\jar", to: "" }], () => false);
    expect(got[0]!.undoable).toBe(true);
    expect(got[0]!.said).toContain("вернётся HKCU\\Run\\jar");
  });
});

describe("замена поверх — потеря, и она названа", () => {
  it("файл уже на месте — правки после откката пропадут", () => {
    const got = items([{ kind: "copy", from: "D:\\a.txt", to: "C:\\backup\\a.txt" }], () => true);
    const over = overwrites(got, () => true);
    expect(over).toHaveLength(1);
    expect(over[0]!.loss).toContain("правки в D:\\a.txt после отката пропадут");
  });

  it("файла нет — замены поверх нет, и выдумывать её нельзя", () => {
    const got = items([{ kind: "copy", from: "D:\\a.txt", to: "C:\\b.txt" }], () => true);
    expect(overwrites(got, () => false)).toHaveLength(0);
  });
});

describe("итог — числами", () => {
  const entries: Entry[] = [
    { kind: "move", from: "D:\\a.jpg", to: "C:\\a.jpg" },
    { kind: "move", from: "D:\\b.jpg", to: "C:\\b.jpg" },
    { kind: "move", from: "D:\\c.jpg", to: "C:\\c.jpg" },
  ];

  it("всё вернётся — так и сказано, с весом", () => {
    const got = items(entries, () => true);
    expect(summary(got, 40 * 1024 * 1024 * 1024).said).toBe("вернётся всё: 3 из 3, 40.00 ГБ");
  });

  it("часть — «3 из 5», а не «отменить всё»", () => {
    const got = items(entries, alive(["D:\\a.jpg", "D:\\c.jpg"]));
    const said = summary(got, 0).said;
    expect(said).toBe("вернётся 2 из 3: остальные вернуть нельзя, и причины названы");
  });

  it("ничего — кнопки нет: пустая кнопка хуже её отсутствия", () => {
    const got = items(entries, () => false);
    const got2 = summary(got, 0);
    expect(got2.offer).toBe(false);
    expect(got2.said).toContain("вернуть нельзя ничего");
  });

  it("журнал пуст — «возвращать нечего», а не пустая строка", () => {
    expect(summary([], 0).said).toBe("возвращать нечего: журнал пуст");
  });
});

describe("строки для экрана", () => {
  it("их столько, сколько записей, и каждая — про предмет", () => {
    const got = items(
      [
        { kind: "move", from: "D:\\a.jpg", to: "C:\\a.jpg" },
        { kind: "rename", from: "D:\\b.jpg", to: "D:\\c.jpg" },
      ],
      () => true,
    );
    expect(lines(got)).toHaveLength(2);
    expect(lines(got)[0]).toContain("b.jpg");
  });
});
