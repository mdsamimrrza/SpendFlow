import os
from PIL import Image, ImageDraw

def draw_premium_notification_icon(size: int) -> Image.Image:
    # High resolution canvas for super-crisp anti-aliasing (16x scale down to target size)
    scale = 16
    canvas_size = size * scale
    img = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    def pt(x, y):
        return (x * canvas_size / 100.0, y * canvas_size / 100.0)

    white = (255, 255, 255, 255)
    transparent = (0, 0, 0, 0)

    # ── 1. Main Wallet / Card Body (Rounded Polygon) ──
    body_points = [
        pt(12, 22), pt(16, 16), pt(22, 12), pt(64, 12), pt(70, 15),
        pt(74, 20), pt(74, 26), pt(82, 26), pt(86, 30), pt(88, 36),
        pt(88, 76), pt(84, 84), pt(76, 88), pt(20, 88), pt(14, 84),
        pt(10, 78), pt(10, 26),
    ]
    draw.polygon(body_points, fill=white)

    # ── 2. Top-Card Accent Cutout (Gives 3D Layered Cards Depth) ──
    # Top card slip
    top_slip = [
        pt(24, 18), pt(62, 18), pt(60, 24), pt(24, 24)
    ]
    draw.polygon(top_slip, fill=transparent)

    # ── 3. Central Dynamic Growth Wave & S-Curve Cutout ──
    # Creates the iconic SpendFlow fluid stream through the wallet
    wave_outer = [
        pt(22, 34), pt(54, 34), pt(66, 38), pt(70, 44), pt(68, 50),
        pt(60, 54), pt(40, 54), pt(32, 58), pt(30, 64), pt(34, 70),
        pt(44, 74), pt(68, 74), pt(68, 80), pt(42, 80), pt(26, 76),
        pt(20, 68), pt(20, 60), pt(26, 52), pt(36, 48), pt(58, 48),
        pt(60, 44), pt(58, 40), pt(52, 40), pt(22, 40)
    ]
    draw.polygon(wave_outer, fill=transparent)

    # ── 4. Floating Diamond Sparkle in Top-Right ──
    cx, cy = pt(84, 14)
    r_out = 9 * canvas_size / 100.0
    r_in = 2.8 * canvas_size / 100.0
    spark = [
        (cx, cy - r_out),
        (cx + r_in, cy - r_in),
        (cx + r_out, cy),
        (cx + r_in, cy + r_in),
        (cx, cy + r_out),
        (cx - r_in, cy + r_in),
        (cx - r_out, cy),
        (cx - r_in, cy - r_in),
    ]
    draw.polygon(spark, fill=white)

    # Mini star accent
    mx, my = pt(14, 10)
    mr_out = 4 * canvas_size / 100.0
    mr_in = 1.2 * canvas_size / 100.0
    mini_spark = [
        (mx, my - mr_out),
        (mx + mr_in, my - mr_in),
        (mx + mr_out, my),
        (mx + mr_in, my + mr_in),
        (mx, my + mr_out),
        (mx - mr_in, my + mr_in),
        (mx - mr_out, my),
        (mx - mr_in, my - mr_in),
    ]
    draw.polygon(mini_spark, fill=white)

    return img.resize((size, size), Image.Resampling.LANCZOS)

def main():
    sizes = [
        ("drawable-mdpi", 24),
        ("drawable-hdpi", 36),
        ("drawable-xhdpi", 48),
        ("drawable-xxhdpi", 72),
        ("drawable-xxxhdpi", 96),
    ]

    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    target_res_roots = [
        os.path.join(base_dir, "android", "app", "src", "main", "res"),
        r"C:\SpendFlow\android\app\src\main\res",
    ]

    for res_root in target_res_roots:
        if not os.path.exists(res_root):
            continue
        print(f"Generating Premium Notification Icons in {res_root}...")
        for folder, size in sizes:
            folder_path = os.path.join(res_root, folder)
            os.makedirs(folder_path, exist_ok=True)
            icon = draw_premium_notification_icon(size)
            out_file = os.path.join(folder_path, "notification_icon.png")
            icon.save(out_file, "PNG")
            print(f"  [OK] Saved {size}x{size} notification_icon.png to {folder}")

    # Update assets/android-icon-monochrome.png
    assets_dir = os.path.join(base_dir, "assets")
    mono_icon = draw_premium_notification_icon(96)
    mono_path = os.path.join(assets_dir, "android-icon-monochrome.png")
    mono_icon.save(mono_path, "PNG")
    print(f"  [OK] Updated {mono_path}")

    print("\n[SUCCESS] Premium detailed notification icons generated successfully!")

if __name__ == "__main__":
    main()
