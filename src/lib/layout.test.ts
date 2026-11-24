import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { NARROW_WIDTH, layoutFor, MIN_SCREEN, fitWork } from "./layout";

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
