import os
from PIL import Image, ImageDraw

def draw_spendflow_notification_icon(size: int) -> Image.Image:
    # High resolution canvas for smooth anti-aliased drawing (scale 8x then resize down)
    scale = 8
    canvas_size = size * scale
    img = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Unit coordinate system (0 to 100)
    def pt(x, y):
        return (x * canvas_size / 100.0, y * canvas_size / 100.0)

    white = (255, 255, 255, 255)
    
    # ── 1. Draw Bold Modern SpendFlow Emblem (Fluid S-Curve + Diamond Spark) ──
    # Top curve of S
    top_points = [
        pt(70, 10), pt(36, 10), pt(26, 13), pt(18, 20), pt(12, 30), pt(12, 40),
        pt(16, 50), pt(24, 56), pt(36, 60), pt(60, 60), pt(68, 64), pt(72, 70),
        pt(72, 78), pt(68, 84), pt(60, 88), pt(24, 88), pt(18, 84), pt(18, 76),
        pt(8, 76), pt(8, 84), pt(14, 92), pt(24, 96), pt(60, 96), pt(72, 92),
        pt(80, 84), pt(84, 76), pt(84, 66), pt(78, 56), pt(68, 50), pt(56, 48),
        pt(36, 48), pt(28, 44), pt(24, 38), pt(24, 30), pt(28, 24), pt(36, 20),
        pt(70, 20), pt(76, 26), pt(76, 32), pt(86, 32), pt(86, 24), pt(80, 14),
    ]
    draw.polygon(top_points, fill=white)

    # 4-point Spark in top right
    cx, cy = pt(82, 18)
    r_outer = 10 * canvas_size / 100.0
    r_inner = 3 * canvas_size / 100.0
    spark_points = [
        (cx, cy - r_outer),
        (cx + r_inner, cy - r_inner),
        (cx + r_outer, cy),
        (cx + r_inner, cy + r_inner),
        (cx, cy + r_outer),
        (cx - r_inner, cy + r_inner),
        (cx - r_outer, cy),
        (cx - r_inner, cy - r_inner),
    ]
    draw.polygon(spark_points, fill=white)

    # Smooth downsampling with high quality Lanczos filter
    return img.resize((size, size), Image.Resampling.LANCZOS)


def main():
    sizes = [
        ("drawable-mdpi", 24),
        ("drawable-hdpi", 36),
        ("drawable-xhdpi", 48),
        ("drawable-xxhdpi", 72),
        ("drawable-xxxhdpi", 96),
    ]

    target_res_roots = [
        os.path.join(os.path.dirname(__file__), "..", "android", "app", "src", "main", "res"),
        r"C:\SpendFlow\android\app\src\main\res",
    ]

    for res_root in target_res_roots:
        if not os.path.exists(res_root):
            continue
        print(f"Generating pure white notification icons in {res_root}...")
        for folder, size in sizes:
            folder_path = os.path.join(res_root, folder)
            os.makedirs(folder_path, exist_ok=True)
            icon = draw_spendflow_notification_icon(size)
            out_file = os.path.join(folder_path, "notification_icon.png")
            icon.save(out_file, "PNG")
            print(f"  [OK] Saved {size}x{size} notification_icon.png to {folder}")

    # Update assets/android-icon-monochrome.png
    assets_dir = os.path.join(os.path.dirname(__file__), "..", "assets")
    mono_icon = draw_spendflow_notification_icon(96)
    mono_path = os.path.join(assets_dir, "android-icon-monochrome.png")
    mono_icon.save(mono_path, "PNG")
    print(f"  [OK] Updated {mono_path}")

    print("\n[SUCCESS] All pure white notification icons generated successfully!")

if __name__ == "__main__":
    main()
