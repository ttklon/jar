import { describe, expect, it } from "vitest";
import { NARROW_WIDTH, layoutFor } from "./layout";

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
