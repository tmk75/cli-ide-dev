from __future__ import annotations

import struct
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
ASSETS.mkdir(parents=True, exist_ok=True)


def hex_to_rgb(value: str) -> tuple[int, int, int]:
    value = value.lstrip("#")
    return tuple(int(value[i : i + 2], 16) for i in (0, 2, 4))


def lerp_color(c1: tuple[int, int, int], c2: tuple[int, int, int], t: np.ndarray) -> np.ndarray:
    t = np.clip(t, 0.0, 1.0)[..., None]
    c1 = np.asarray(c1, dtype=np.float32)
    c2 = np.asarray(c2, dtype=np.float32)
    return (c1 * (1.0 - t) + c2 * t).astype(np.uint8)


def build_mark(size: int = 512, supersample: int = 4) -> Image.Image:
    s = size * supersample
    y, x = np.mgrid[0:s, 0:s]
    cx = cy = s * 0.5
    rr = np.sqrt((x - cx) ** 2 + (y - cy) ** 2) / s

    # Deep green radial background.
    bg = np.zeros((s, s, 4), dtype=np.uint8)
    bg[..., :3] = lerp_color(hex_to_rgb("#123322"), hex_to_rgb("#050B08"), np.clip(rr * 1.35, 0, 1))
    bg[..., 3] = 255
    base = Image.fromarray(bg, "RGBA")

    # Rounded-square crop so the icon has transparent outer corners.
    alpha = Image.new("L", (s, s), 0)
    draw_alpha = ImageDraw.Draw(alpha)
    draw_alpha.rounded_rectangle([0, 0, s, s], radius=int(s * 116 / 512), fill=255)
    base.putalpha(alpha)

    # Emerald border line.
    border = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    draw_border = ImageDraw.Draw(border)
    draw_border.rounded_rectangle(
        [int(s * 3 / 512), int(s * 3 / 512), int(s * 509 / 512), int(s * 509 / 512)],
        radius=int(s * 113 / 512),
        outline=(31, 80, 56, 184),
        width=max(2, int(s * 6 / 512)),
    )
    base = Image.alpha_composite(base, border)

    # Wide luminous halo behind the ring.
    halo = np.zeros((s, s, 4), dtype=np.uint8)
    halo_radius = 0.402 * s
    halo_t = np.clip(rr / halo_radius, 0, 1)
    halo[..., 0] = 89
    halo[..., 1] = 255
    halo[..., 2] = 157
    halo[..., 3] = (np.clip(1.0 - halo_t, 0, 1) ** 1.7 * 160).astype(np.uint8)
    base = Image.alpha_composite(base, Image.fromarray(halo, "RGBA"))

    # Concentric guide rings.
    guides = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    draw_guides = ImageDraw.Draw(guides)
    draw_guides.ellipse(
        [cx - 0.207 * s, cy - 0.207 * s, cx + 0.207 * s, cy + 0.207 * s],
        outline=(183, 255, 212, 52),
        width=max(1, int(s * 3 / 512)),
    )
    draw_guides.ellipse(
        [cx - 0.293 * s, cy - 0.293 * s, cx + 0.293 * s, cy + 0.293 * s],
        outline=(11, 107, 67, 108),
        width=max(1, int(s * 3 / 512)),
    )
    base = Image.alpha_composite(base, guides)

    # The power ring itself, using a bright-to-deep radial gradient.
    ring = np.zeros((s, s, 4), dtype=np.uint8)
    ring_inner = 0.202 * s
    ring_outer = 0.276 * s
    ring_mask = (rr >= ring_inner) & (rr <= ring_outer)
    ring_t = (rr - ring_inner) / (ring_outer - ring_inner)
    ring_color = lerp_color(hex_to_rgb("#B9FFD5"), hex_to_rgb("#087A46"), ring_t)
    ring[..., :3] = ring_color
    ring[..., 3] = np.where(ring_mask, 255, 0).astype(np.uint8)
    base = Image.alpha_composite(base, Image.fromarray(ring, "RGBA"))

    # Thin hot edge inside the ring.
    hot = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    draw_hot = ImageDraw.Draw(hot)
    draw_hot.ellipse(
        [cx - 0.186 * s, cy - 0.186 * s, cx + 0.186 * s, cy + 0.186 * s],
        outline=(237, 255, 245, 150),
        width=max(1, int(s * 3 / 512)),
    )
    base = Image.alpha_composite(base, hot)

    # Minimal terminal glyph in the center of the ring.
    glyph = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    draw_glyph = ImageDraw.Draw(glyph)
    line_width = max(3, int(s * 28 / 512))
    accent_width = max(3, int(s * 20 / 512))
    u = s / 512.0
    draw_glyph.line(
        [185 * u, 191 * u, 266 * u, 256 * u, 185 * u, 321 * u],
        fill=(240, 255, 246, 255),
        width=line_width,
        joint="curve",
    )
    draw_glyph.line(
        [286 * u, 323 * u, 348 * u, 323 * u],
        fill=(140, 255, 184, 255),
        width=accent_width,
    )
    base = Image.alpha_composite(base, glyph)

    # Small spark at the upper right of the ring.
    spark = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    draw_spark = ImageDraw.Draw(spark)
    draw_spark.ellipse(
        [362 * u - 20 * u, 153 * u - 20 * u, 362 * u + 20 * u, 153 * u + 20 * u],
        outline=(208, 255, 228, 72),
        width=max(2, int(s * 4 / 512)),
    )
    draw_spark.ellipse(
        [362 * u - 11 * u, 153 * u - 11 * u, 362 * u + 11 * u, 153 * u + 11 * u],
        fill=(208, 255, 228, 255),
    )
    base = Image.alpha_composite(base, spark)

    # Re-apply the rounded-square alpha after compositing, so no glow or
    # guide ring bleeds into the transparent corners.
    base.putalpha(alpha)

    return base.resize((size, size), Image.Resampling.LANCZOS)


def save_ico(image: Image.Image, path: Path) -> None:
    sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    images = [image.resize(size, Image.Resampling.LANCZOS) for size in sizes]
    images[-1].save(
        path,
        format="ICO",
        sizes=sizes,
        append_images=images[:-1],
    )


def image_to_dib(image: Image.Image) -> bytes:
    image = image.convert("RGBA")
    width, height = image.size
    pixels = image.load()
    xor = bytearray()
    for y in range(height - 1, -1, -1):
        for x in range(width):
            red, green, blue, alpha = pixels[x, y]
            xor += struct.pack("BBBB", blue, green, red, alpha)
    and_row = ((width + 31) // 32) * 4
    header = struct.pack(
        "<IiiHHIIiiII",
        40,
        width,
        height * 2,
        1,
        32,
        0,
        len(xor),
        0,
        0,
        0,
        0,
    )
    return header + bytes(xor) + bytes(and_row * height)


def build_taskbar_mark(size: int) -> Image.Image:
    # Small taskbar sizes must be drawn, not downscaled. The full mark's
    # green glow collapses into a mint square at 16-32px.
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    radius = max(3, int(size * 116 / 512))
    draw.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=(5, 11, 8, 255))
    inset = max(1, round(size * 0.04))
    draw.rounded_rectangle(
        [inset, inset, size - 1 - inset, size - 1 - inset],
        radius=max(2, radius - inset),
        outline=(15, 48, 32, 255),
        width=max(1, size // 32),
    )

    cx = cy = (size - 1) / 2
    ring_r = size * 0.30
    ring_w = max(2, int(round(size * 0.12)))
    box = [cx - ring_r, cy - ring_r, cx + ring_r, cy + ring_r]
    draw.ellipse(box, outline=(50, 242, 138, 255), width=ring_w)
    if size >= 24:
        draw.ellipse(
            [cx - ring_r + ring_w * 0.55, cy - ring_r + ring_w * 0.55, cx + ring_r - ring_w * 0.55, cy + ring_r - ring_w * 0.55],
            outline=(185, 255, 213, 90),
            width=1,
        )

    u = size / 512.0
    chevron_w = max(2, int(round(28 * u)))
    draw.line(
        [(185 * u, 191 * u), (266 * u, 256 * u), (185 * u, 321 * u)],
        fill=(240, 255, 246, 255),
        width=chevron_w,
        joint="curve",
    )
    if size >= 24:
        draw.line(
            [(286 * u, 323 * u), (348 * u, 323 * u)],
            fill=(140, 255, 184, 255),
            width=max(2, int(round(20 * u))),
        )
    return image


def save_win_ico(image: Image.Image, path: Path) -> None:
    # csc /win32icon only embeds classic BMP/DIB frames, not PNG-in-ICO.
    # 16-48 are drawn for the taskbar so they stay black + ring.
    sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64)]
    frames = [
        build_taskbar_mark(size[0]) if size[0] <= 48 else image.resize(size, Image.Resampling.LANCZOS)
        for size in sizes
    ]
    dibs = [image_to_dib(frame) for frame in frames]
    offset = 6 + 16 * len(frames)
    entries = bytearray()
    payload = bytearray()
    for frame, dib in zip(frames, dibs):
        width, height = frame.size
        entries += struct.pack(
            "<BBBBHHII",
            width if width < 256 else 0,
            height if height < 256 else 0,
            0,
            0,
            1,
            32,
            len(dib),
            offset,
        )
        payload += dib
        offset += len(dib)
    path.write_bytes(struct.pack("<HHH", 0, 1, len(frames)) + bytes(entries) + bytes(payload))


def rasterize_svg(svg_path: Path, dest: Path, size: int = 512) -> bool:
    candidates = [
        Path(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"),
        Path(r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"),
    ]
    edge = next((path for path in candidates if path.exists()), None)
    if edge is None:
        return False
    import subprocess

    result = subprocess.run(
        [
            str(edge),
            "--headless",
            "--disable-gpu",
            "--hide-scrollbars",
            f"--window-size={size},{size}",
            f"--screenshot={dest}",
            str(svg_path),
        ],
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )
    return result.returncode == 0 and dest.exists()


def apply_rounded_mask(image: Image.Image) -> Image.Image:
    image = image.convert("RGBA")
    width, height = image.size
    mask = Image.new("L", (width, height), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [0, 0, width - 1, height - 1],
        radius=int(width * 116 / 512),
        fill=255,
    )
    image.putalpha(mask)
    return image


def load_mark() -> Image.Image:
    svg_path = ASSETS / "devopen-mark.svg"
    raster_path = ASSETS / "devopen-mark-raster.png"
    if svg_path.exists() and rasterize_svg(svg_path, raster_path):
        return apply_rounded_mask(Image.open(raster_path))
    return build_mark()


def main() -> None:
    mark = load_mark()
    png_path = ASSETS / "devopen-icon.png"
    ico_path = ASSETS / "devopen-icon.ico"
    win_ico_path = ASSETS / "devopen-icon-win.ico"
    mark.save(png_path, format="PNG")
    save_ico(mark, ico_path)
    save_win_ico(mark, win_ico_path)
    print(f"Wrote {png_path}")
    print(f"Wrote {ico_path}")
    print(f"Wrote {win_ico_path}")


if __name__ == "__main__":
    main()
