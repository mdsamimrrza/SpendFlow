import os
from PIL import Image

def generate_icons():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    assets_dir = os.path.join(base_dir, "assets")
    icon_light_path = os.path.join(assets_dir, "icon-light.png")

    if not os.path.exists(icon_light_path):
        print("Error: icon-light.png not found!")
        return

    icon_img = Image.open(icon_light_path).convert("RGBA")

    # Mipmap configurations
    mipmap_sizes = [
        ("mipmap-mdpi", 48, 108),
        ("mipmap-hdpi", 72, 162),
        ("mipmap-xhdpi", 96, 216),
        ("mipmap-xxhdpi", 144, 324),
        ("mipmap-xxxhdpi", 192, 432),
    ]

    target_res_roots = [
        os.path.join(base_dir, "android", "app", "src", "main", "res"),
        r"C:\SpendFlow\android\app\src\main\res",
    ]

    for res_root in target_res_roots:
        if not os.path.exists(res_root):
            continue
        print(f"Generating Light Mode App Icons in {res_root}...")

        for folder, launcher_sz, fg_sz in mipmap_sizes:
            folder_path = os.path.join(res_root, folder)
            os.makedirs(folder_path, exist_ok=True)

            # 1. Standard Launcher (WebP)
            launcher_webp = icon_img.resize((launcher_sz, launcher_sz), Image.Resampling.LANCZOS)
            launcher_webp.save(os.path.join(folder_path, "ic_launcher.webp"), "WEBP", quality=95)

            # 2. Round Launcher (WebP)
            launcher_webp.save(os.path.join(folder_path, "ic_launcher_round.webp"), "WEBP", quality=95)

            # 3. Foreground (WebP) with safe padding
            fg_canvas = Image.new("RGBA", (fg_sz, fg_sz), (0, 0, 0, 0))
            # Place scaled icon inside safe central 66% zone
            inner_sz = int(fg_sz * 0.72)
            scaled_inner = icon_img.resize((inner_sz, inner_sz), Image.Resampling.LANCZOS)
            offset = (fg_sz - inner_sz) // 2
            fg_canvas.paste(scaled_inner, (offset, offset), scaled_inner)
            fg_canvas.save(os.path.join(folder_path, "ic_launcher_foreground.webp"), "WEBP", quality=95)

            print(f"  [OK] Saved {launcher_sz}x{launcher_sz} launcher and {fg_sz}x{fg_sz} foreground to {folder}")

    # Copy icon-light to icon.png & splash-icon.png so web & defaults use light icon
    icon_img.save(os.path.join(assets_dir, "icon.png"), "PNG")
    icon_img.save(os.path.join(assets_dir, "splash-icon.png"), "PNG")
    print("\n[SUCCESS] Light theme app launcher icons generated successfully!")

if __name__ == "__main__":
    generate_icons()
