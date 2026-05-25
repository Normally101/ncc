import os
from PIL import Image

artifact_dir = r"C:\Users\User\.gemini\antigravity\brain\ffc10253-2216-4314-838d-869b10fae12a"
output_dir = r"E:\Documenti\Python Projects\ItalyExecutive\assets\buildings"

os.makedirs(output_dir, exist_ok=True)

images = [
    ("garage_main", "garage_main_concept_1779696632631.png"),
    ("workshop", "workshop_concept_1779696706947.png"),
    ("ev_parking", "ev_parking_concept_1779696883144.png"),
    ("gym", "gym_concept_1779697063903.png"),
    ("canteen", "canteen_concept_1779697214362.png"),
    ("infirmary", "infirmary_concept_1779697277875.png")
]

def remove_white_bg(img_path, out_path):
    try:
        img = Image.open(img_path).convert("RGBA")
        datas = img.getdata()
        
        newData = []
        for item in datas:
            # If the pixel is very close to white, make it transparent
            if item[0] > 235 and item[1] > 235 and item[2] > 235:
                # Add anti-aliasing logic for smooth borders? We'll just do a basic cut
                newData.append((255, 255, 255, 0))
            else:
                newData.append(item)
                
        img.putdata(newData)
        
        # Crop to content
        bbox = img.getbbox()
        if bbox:
            img = img.crop(bbox)
            
        # Resize to fit nicely in an isometric grid cell (e.g. max width 160px or similar depending on building)
        # We will let SVG handle scaling, but scaling them down a bit saves space. Let's make them 256x256 max
        img.thumbnail((256, 256), Image.Resampling.LANCZOS)
        
        img.save(out_path, "PNG")
        print(f"Processed {out_path}")
    except Exception as e:
        print(f"Error processing {img_path}: {e}")

for name, filename in images:
    in_path = os.path.join(artifact_dir, filename)
    out_path = os.path.join(output_dir, f"{name}.png")
    remove_white_bg(in_path, out_path)
