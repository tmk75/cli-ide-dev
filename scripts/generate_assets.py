from __future__ import annotations

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


def main() -> None:
    mark = build_mark()
    png_path = ASSETS / "devopen-icon.png"
    ico_path = ASSETS / "devopen-icon.ico"
    mark.save(png_path, format="PNG")
    save_ico(mark, ico_path)
    print(f"Wrote {png_path}")
    print(f"Wrote {ico_path}")


if __name__ == "__main__":
    main()
