import os
from PIL import Image

src_img = '/Users/karangathani/.gemini/antigravity/brain/82fbada7-9dc2-4991-975c-4a9811954a16/seabird_nestcam_icon_1778292893692.png'

# Create base image
img = Image.open(src_img).convert('RGBA')

# 1. Update build/icon.png (high-res 1024x1024)
img.resize((1024, 1024), Image.Resampling.LANCZOS).save('build/icon.png')

# 2. Update build/icon.ico
# icon.ico usually contains multiple sizes
icon_sizes = [(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
img.save('build/icon.ico', format='ICO', sizes=icon_sizes)

# 3. Update public/icon-192.png and public/icon-512.png
img.resize((192, 192), Image.Resampling.LANCZOS).save('public/icon-192.png')
img.resize((512, 512), Image.Resampling.LANCZOS).save('public/icon-512.png')

print("Generated png and ico files successfully.")
