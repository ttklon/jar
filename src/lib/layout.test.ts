import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { viewportAt } from "./zoom";
import { sizes } from "./touch";
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
