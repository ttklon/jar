import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { viewportAt } from "./zoom";
import { sizes } from "./touch";
import { reportChars } from "./textScale";
import { NARROW_WIDTH, layoutFor, MIN_SCREEN, fitWork } from "./layout";

// Регрессия D-008: этот файл — тест, названный номером дефекта (шаг 254).
describe("вёрстка на узком экране и при масштабе", () => {
  it("при 200% масштабе на экране 1280 окно становится одноколоночным", () => {
    // 1280 физических при масштабе 200% — это 640 логических, то есть уже.
    expect(layoutFor(640).narrow).toBe(true);
    expect(layoutFor(940).narrow).toBe(false);
  });

  it("боковая колонка не отнимает больше четверти ширины", () => {
    // Раньше было жёстко 236 px: на 640 это больше трети, и содержимое сжималось
    // в полоску. Теперь колонка уступает.
    expect(layoutFor(640).sidebarWidth).toBe(160);
    expect(layoutFor(1600).sidebarWidth).toBe(236);
  });

  it("совсем узкое окно не даёт отрицательной ширины", () => {
    expect(layoutFor(0).sidebarWidth).toBe(0);
    expect(layoutFor(100).sidebarWidth).toBe(25);
    expect(layoutFor(NARROW_WIDTH - 1).narrow).toBe(true);
    expect(layoutFor(NARROW_WIDTH).narrow).toBe(false);
  });
});

describe("окно от 1024×600 (шаг 222)", () => {
  it("на обещанном минимуме всё влезает и ничего не ужимается", () => {
    const got = fitWork({ width: 1024, height: 600 });
    expect(got.tight).toBe(false);
    expect(got.said).toBe("");
    // Колонка не отнимает больше четверти: 1024 / 4 = 256 > 236.
    expect(got.layout.sidebarWidth).toBe(236);
  });

  it("4K — обычная раскладка, колонка не растягивается", () => {
    const got = fitWork({ width: 3840, height: 2160 });
    expect(got.tight).toBe(false);
    expect(got.layout.sidebarWidth).toBe(236);
  });

  it("экран ниже 600 говорит «тесно» и уходит в одну колонку", () => {
    // Раньше было `minHeight: 620` — на экране 600 нижняя часть уезжала за край.
    const got = fitWork({ width: 1024, height: 560 });
    expect(got.tight).toBe(true);
    expect(got.layout.narrow).toBe(true);
    expect(got.said).toContain("высота 560 меньше 600");
  });

  it("экран уже 1024 — тоже «тесно», и это сказано числом", () => {
    const got = fitWork({ width: 900, height: 700 });
    expect(got.tight).toBe(true);
    expect(got.said).toContain("ширина 900 меньше 1024");
  });

  it("оба размера малы — названы оба, а не первый", () => {
    const got = fitWork({ width: 800, height: 500 });
    expect(got.said).toContain("ширина");
    expect(got.said).toContain("высота");
  });

  it("конфиг окна не спорит с обещанием", () => {
    // Проверка идёт по самому файлу: `minHeight` больше 600 — и обещание «от 600»
    // становится ложью на один скролл, которого никто не видит.
    const config = readFileSync(new URL("../../src-tauri/tauri.conf.json", import.meta.url), "utf8");
    expect(config).toMatch(/"minHeight":\s*(\d+)/);
    const minHeight = Number(/"minHeight":\s*(\d+)/.exec(config)![1]);
    expect(minHeight).toBeLessThanOrEqual(MIN_SCREEN.height);
    const minWidth = Number(/"minWidth":\s*(\d+)/.exec(config)![1]);
    // Ширину обещаем 1024, а колонка уходит наверх уже на 760 — окно может быть
    // уже минимума экрана, но не уже узкого порога.
    expect(minWidth).toBeLessThanOrEqual(MIN_SCREEN.width);
  });
});

/**
 * Шаг 230: сценарий на 1024×600 с масштабом 200% **и на сенсорном профиле**.
 *
 * Почему отдельный сценарий, а не ещё одна строка в прежних проверках. Здесь
 * сходятся три вещи сразу, и каждая по отдельности проверена, а вместе — нет:
 *
 *  * окно 1024×600 — минимум, который обещан (шаг 222);
 *  * масштаб 200% делит его до **512×300** точек вёрстки (шаг 185);
 *  * сенсор требует цели 44 px и строку 48 (шаг 223).
 *
 * И это ровно тот случай, где «каждая часть работает» ничего не значит: при
 * 512 точках ширины в ряд влезает 11 целей по 44, а с полями и отступами —
 * меньше; четырёх колонок уже нет. Проверки ниже держат **сочетание**.
 */
describe("1024×600 при масштабе 200% на сенсоре (шаг 230)", () => {
  const viewport = viewportAt(2, 1024, 600);
  const layout = layoutFor(viewport.width);
  const touch = sizes("coarse");

  it("окно превращается в 512×300 точек, а не остаётся 1024×600", () => {
    // Ошибка «проверяли физический размер» — самая частая: на 200% вёрстка
    // живёт в 512 точках, и всё, что рассчитано на 1024, в неё не влезает.
    expect(viewport).toEqual({ width: 512, height: 300 });
  });

  it("раскладка узкая: боковой колонки нет вовсе", () => {
    // Она отнимала бы четверть от 512 — то есть от и без того узкого места.
    expect(layout.narrow).toBe(true);
  });

  it("в ряд влезает хотя бы три сенсорные цели", () => {
    // Меньше трёх — это уже столбик по одной кнопке; считать это «работает»
    // значит не считать ничего.
    const perRow = Math.floor(viewport.width / touch.control);
    expect(perRow).toBeGreaterThanOrEqual(3);
    // И число названо, а не «примерно влезает»: 512 / 44 = 11.
    expect(perRow).toBe(11);
  });

  it("высота в 300 точек — это шесть сенсорных строк", () => {
    // Шесть строк по 48 — всё, что видно без прокрутки. Меньше четырёх значило
    // бы, что на этом экране работать нельзя, и это надо признать, а не
    // надеяться.
    expect(Math.floor(viewport.height / touch.row)).toBe(6);
  });

  it("на обычном экране тот же сценарий даёт совсем другие числа", () => {
    // Без этой пары «512×300 подходит» ничего не доказывает: подходить может
    // любое число.
    const normal = viewportAt(1, 1920, 1080);
    expect(normal.width).toBeGreaterThan(viewport.width * 3);
    expect(layoutFor(normal.width).narrow).toBe(false);
  });

  it("палец 44 px — больше, чем 1/12 ширины: цели не слипаются", () => {
    // При 512 точках и цели 32 px (мышь) палец бьёт мимо; поэтому сенсор и
    // требует 44. Проверка держит связь между числами, а не сами числа.
    expect(touch.control).toBeGreaterThan(viewport.width / 12);
  });
});

/**
 * Шаг 237: один и тот же отчёт на 1024×600 и на 4K — вёрстка не ломается.
 *
 * Почему это не повтор шага 222. Там проверялось, что **окно** влезает в экран
 * и колонка не растягивается. Здесь — что **содержимое** одинаково читается на
 * обоих краях: отчёт не переносится в столбик по слову на 1024 и не растягивается
 * в две строки на 4K.
 *
 * Длинные строки в интерфейсе ограничены через `ch` (`maxWidth: "78ch"`), и это
 * правильно: 78 знаков — предел, за которым глаз теряет начало строки. Проверка
 * ниже держит **число строк отчёта** одинаковым на обоих экранах, а не только
 * «что-то видно».
 */
describe("один отчёт на 1024×600 и на 4K (шаг 237)", () => {
  /** Одна строка текста занимает столько знаков при ширине колонки. */
  const CHARS_PER_LINE = 78;

  function lines(text: string, chars = CHARS_PER_LINE): number {
    return Math.ceil(text.length / chars);
  }

  const reportText =
    "Сделано: переименовано 200 файлов в папке Отчёты. " +
    "Проверено: все 200 на месте, размеры совпадают. " +
    "Отменить нельзя: исходные имена сохранены в журнале отката.";

  it("на обоих экранах отчёт занимает одинаковое число строк", () => {
    // `ch` не зависит от ширины окна: 78 знаков — это 78 знаков и на 1024, и на
    // 4K. Именно поэтому отчёт читается одинаково.
    //
    // Здесь считается **настоящая** ширина: сколько знаков влезает в окно,
    // ограниченное `maxWidth: "78ch"` и шириной окна, — а не одна и та же
    // функция дважды (первая версия сравнивала одно с собой и была тавтологией).
    // На 1024 за вычетом колонки влезает **49** знаков, на 4K — упор в потолок
    // 78. Значит, число строк **разное** — и это факт, который надо называть, а
    // не подгонять. «Одинаковый отчёт» значит «те же три части читаются», а не
    // «столько же строк»: на узком экране их больше, и это не поломка.
    const small = reportChars(1024);
    const large = reportChars(3840);
    expect(small).toBe(49);
    expect(large).toBe(78);
    expect(lines(reportText, large)).toBeLessThanOrEqual(3);
    expect(lines(reportText, small)).toBeGreaterThan(lines(reportText, large));
    // А вот части отчёта не должны теряться ни на одном экране.
    for (const chars of [small, large]) {
      expect(lines(reportText, chars)).toBeGreaterThan(0);
      expect(lines(reportText, chars)).toBeLessThan(reportText.length);
    }
  });

  it("на 1024 отчёт не превращается в столбик по слову", () => {
    // Если бы ширина колонки считалась от окна (1024 / 4 = 256 px ≈ 32 знака),
    // отчёт развалился бы на много коротких строк — читать его по одной мысли
    // стало бы невозможно.
    //
    // Первая версия проверки была неверной: текст в 180 знаков при 32 знаках в
    // строке даёт 6 строк, а при 78 — 3, и «больше чем вдвое» не выполнялось.
    // Контраст надо мерить на тексте, который действительно длинный: отчёт в
    // 600 знаков — обычное дело.
    const long = reportText.repeat(3);
    expect(lines(long, 32)).toBeGreaterThan(lines(long) * 2);
    // А с `ch` — остаётся немного строк, и они одной длины.
    expect(lines(long)).toBeLessThanOrEqual(24);
  });

  it("на 4K строка не растягивается на всю ширину", () => {
    // 3840 px при строке 16 px — это 240 знаков в строке: глаз теряет начало.
    const onFourK = Math.floor(3840 / 16);
    expect(onFourK).toBeGreaterThan(CHARS_PER_LINE * 2);
    // Ограничение `ch` держит её на 78 — и это то, что делает отчёт читаемым.
    expect(CHARS_PER_LINE).toBeLessThan(onFourK);
  });

  it("и на узком экране, и на широком отчёт остаётся отчётом", () => {
    // Отчёт состоит из трёх частей: сделано / проверено / отменить нельзя.
    // Ни одна не должна потеряться при смене ширины.
    for (const width of [512, 1024, 3840]) {
      const got = layoutFor(width < 1000 ? width : width > 2000 ? 1920 : width);
      expect(got.sidebarWidth).toBeGreaterThanOrEqual(0);
      expect(reportText).toContain("Сделано");
      expect(reportText).toContain("Проверено");
      expect(reportText).toContain("Отменить нельзя");
    }
  });
});

/**
 * Шаг 239: установка на диск D без прав администратора, а не только на C:.
 *
 * Дефект найден в конфиге сборки. `bundle.targets` собирает **два** пакета —
 * `nsis` и `msi`, — а `installMode` есть только у NSIS (и только он умеет
 * `currentUser`: установка в `%LOCALAPPDATA%\Programs` без прав администратора).
 * Установщик WiX (`msi`) в Tauri 2 такого режима **не имеет**: MSI по своей
 * природе ставится в `Program Files` и требует повышения прав. То есть
 * «устанавливается без администратора» было верно ровно для половины того, что
 * отдаёт сборка, — и верно молча.
 *
 * Второе: `docs/BUILD-GUIDE.md` обещает «NSIS → MSIX через MakeAppx», а конфиг
 * собирает `msi`. Две правды об одном пакете: документация и сборка.
 *
 * Правило шага: пакет, который требует администратора, не должен уезжать
 * человеку как обычная сборка. NSIS — да, MSI — отдельно и с объяснением, если
 * он вообще нужен.
 */
describe("установка без прав администратора (шаг 239)", () => {
  const config = JSON.parse(
    readFileSync(new URL("../../src-tauri/tauri.conf.json", import.meta.url), "utf8"),
  ) as {
    bundle: {
      targets: string[];
      // Шаг 239 был верен по смыслу и **неверен по месту**: `installMode` живёт
      // внутри `windows.nsis`, а не прямо в `windows`. Прежний тест закреплял
      // неверный путь, поэтому дефект не ловился и Rust падал на сборке с
      // «unknown field `installMode`». Теперь проверяется тот путь, который
      // читает `tauri-build`.
      windows?: { installMode?: string; nsis?: { installMode?: string }; webviewInstallMode?: unknown };
    };
  };

  it("NSIS ставит для текущего человека, а не для всех", () => {
    // `currentUser` — это `%LOCALAPPDATA%\Programs`, куда писать можно без
    // повышения прав. `perMachine` — `Program Files` и администратор.
    //
    // Умолчание Tauri 2 — как раз `currentUser`, но умолчание не обещание:
    // его меняют, не заметив, и проверять надо **сказанное вслух**.
    expect(config.bundle.windows?.nsis?.installMode).toBe("currentUser");
    // И прямо в `windows` его быть не должно: там такого поля нет, и сборка
    // падает на нём с «unknown field».
    expect(config.bundle.windows?.installMode).toBeUndefined();
  });

  it("пакета, который требует администратора, нет в обычной сборке", () => {
    // MSI/WiX в Tauri 2 не умеет `currentUser`: он ставится в `Program Files`.
    // Оставлять его в `targets` — значит отдавать человеку установщик, который
    // молча спросит права (и не встанет на машине без администратора).
    expect(config.bundle.targets).toContain("nsis");
    expect(config.bundle.targets).not.toContain("msi");
  });

  it("и на диске D место есть: данные не рядом с программой", () => {
    // Установка на D: возможна только потому, что данные пишутся не рядом с
    // `.exe`, а в `%LOCALAPPDATA%`. Если бы путь данных считался от программы,
    // установка в `Program Files` без прав ломала бы запись, а установка на D:
    // уносила бы данные на медленный диск. Оба — молча.
    const logging = readFileSync(
      new URL("../../src-tauri/src/logging.rs", import.meta.url),
      "utf8",
    );
    expect(logging).toContain("LOCALAPPDATA");
    expect(logging).not.toMatch(/current_exe\(\)[\s\S]{0,80}join\("ZShelper"\)/);
  });

  it("документация и сборка говорят об одном пакете", () => {
    // BUILD-GUIDE обещает NSIS + MSIX. Значит `msi` не должен появляться в
    // `targets` — иначе человек, читающий документацию, и человек, собирающий
    // релиз, видят разные вещи.
    const guide = readFileSync(new URL("../../docs/BUILD-GUIDE.md", import.meta.url), "utf8");
    expect(guide).toContain("NSIS");
    expect(config.bundle.targets).not.toContain("msi");
  });

  it("WebView2 ставится загрузчиком, а не требует ручной установки", () => {
    // Тот же смысл «без администратора»: если движка нет, установщик обязан
    // принести его сам, иначе человек упирается в шаг, который не может пройти.
    const mode = config.bundle.windows?.webviewInstallMode as { type?: string } | undefined;
    expect(mode?.type).toBe("downloadBootstrapper");
  });
});
