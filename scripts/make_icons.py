#!/usr/bin/env python3
"""
Генерирует иконки приложения без внешних зависимостей.

Зачем свой генератор, а не «положить картинку»: иконки нужны в нескольких
размерах и в формате ICO, а исходник должен быть воспроизводим — поменяли цвет
или форму, запустили скрипт, все размеры обновились одинаково.

Что рисуем: тёмный скруглённый квадрат (фон приложения) и знак «Z» акцентным
цветом из палитры интерфейса. Рисование — попиксельное с суперсэмплингом 4×4,
поэтому края гладкие на любом размере.

Usage:
    python3 scripts/make_icons.py          # перезаписать src-tauri/icons/*
"""

from __future__ import annotations

import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "src-tauri" / "icons"

BG = (15, 23, 42)        # slate-900
ACCENT = (122, 167, 255)  # акцентный синий интерфейса
SS = 4                   # суперсэмплинг по каждой оси

# Знак «Z»: две перекладины и диагональ, в нормализованных координатах [0, 1].
BAR_TOP = (0.26, 0.26, 0.74, 0.375)
BAR_BOTTOM = (0.26, 0.625, 0.74, 0.74)
DIAGONAL = [(0.585, 0.375), (0.74, 0.375), (0.415, 0.625), (0.26, 0.625)]


def in_rounded_rect(x: float, y: float, size: float, margin: float, radius: float) -> bool:
    low = margin
    high = size - margin
    if not (low <= x <= high and low <= y <= high):
        return False
    cx = min(max(x, low + radius), high - radius)
    cy = min(max(y, low + radius), high - radius)
    return (x - cx) ** 2 + (y - cy) ** 2 <= radius**2


def in_rect(x: float, y: float, rect: tuple[float, float, float, float]) -> bool:
    x0, y0, x1, y1 = rect
    return x0 <= x <= x1 and y0 <= y <= y1


def in_polygon(x: float, y: float, points: list[tuple[float, float]]) -> bool:
    inside = False
    count = len(points)
    for i in range(count):
        x1, y1 = points[i]
        x2, y2 = points[(i + 1) % count]
        if (y1 > y) != (y2 > y):
            intersect = x1 + (y - y1) * (x2 - x1) / (y2 - y1)
            if x < intersect:
                inside = not inside
    return inside


def render(size: int) -> list[list[tuple[int, int, int, int]]]:
    """RGBA-пиксели, нарисованные с суперсэмплингом."""
    margin = size * 0.055
    radius = size * 0.22
    rows: list[list[tuple[int, int, int, int]]] = []

    for py in range(size):
        row = []
        for px in range(size):
            bg_hits = accent_hits = 0
            for sy in range(SS):
                for sx in range(SS):
                    x = px + (sx + 0.5) / SS
                    y = py + (sy + 0.5) / SS
                    if not in_rounded_rect(x, y, size, margin, radius):
                        continue
                    bg_hits += 1
                    nx, ny = x / size, y / size
                    if (
                        in_rect(nx, ny, BAR_TOP)
                        or in_rect(nx, ny, BAR_BOTTOM)
                        or in_polygon(nx, ny, DIAGONAL)
                    ):
                        accent_hits += 1

            total = SS * SS
            if bg_hits == 0:
                row.append((0, 0, 0, 0))
                continue

            alpha = round(255 * bg_hits / total)
            accent_ratio = accent_hits / bg_hits
            color = tuple(
                round(BG[i] + (ACCENT[i] - BG[i]) * accent_ratio) for i in range(3)
            )
            row.append((color[0], color[1], color[2], alpha))
        rows.append(row)
    return rows


def png_bytes(rows: list[list[tuple[int, int, int, int]]]) -> bytes:
    size = len(rows)
    raw = bytearray()
    for row in rows:
        raw.append(0)  # фильтр None
        for r, g, b, a in row:
            raw += bytes((r, g, b, a))

    def chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    header = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", header)
        + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
        + chunk(b"IEND", b"")
    )


def ico_bytes(images: dict[int, list[list[tuple[int, int, int, int]]]]) -> bytes:
    """ICO с BMP-записями: этот формат понимают и Windows, и упаковщик Tauri."""
    entries = bytearray()
    payload = bytearray()
    offset = 6 + 16 * len(images)

    for size, rows in sorted(images.items()):
        pixels = bytearray()
        for row in reversed(rows):  # BMP хранит строки снизу вверх
            for r, g, b, _a in row:
                pixels += bytes((b, g, r, _a))

        # AND-маска: 1 бит на пиксель, выравнивание по 4 байта. Нули = «рисуем всё».
        mask_row = ((size + 31) // 32) * 4
        mask = bytes(mask_row * size)

        header = struct.pack(
            "<IiiHHIIiiII",
            40,          # размер BITMAPINFOHEADER
            size,
            size * 2,    # высота удвоена: XOR + AND
            1,           # плоскости
            32,          # бит на пиксель
            0,           # сжатие BI_RGB
            len(pixels) + len(mask),
            0, 0, 0, 0,
        )
        data = header + bytes(pixels) + mask
        dim = 0 if size >= 256 else size
        entries += struct.pack("<BBBBHHII", dim, dim, 0, 0, 1, 32, len(data), offset)
        payload += data
        offset += len(data)

    return struct.pack("<HHH", 0, 1, len(images)) + bytes(entries) + bytes(payload)


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    sizes = (16, 24, 32, 48, 64, 128, 256)
    rendered = {size: render(size) for size in sizes}

    for size in (32, 128, 256):
        (OUT / f"{size}x{size}.png").write_bytes(png_bytes(rendered[size]))
    (OUT / "128x128@2x.png").write_bytes(png_bytes(rendered[256]))
    (OUT / "icon.png").write_bytes(png_bytes(rendered[256]))
    (OUT / "icon.ico").write_bytes(ico_bytes(rendered))

    total = sum(p.stat().st_size for p in OUT.glob("*"))
    print(f"icons: {len(list(OUT.glob('*')))} файлов, {total / 1024:.1f} КБ -> {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
