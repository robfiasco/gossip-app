from PIL import Image

try:
    img = Image.open('assets/icon-original.jpg')
    img = img.convert('RGBA')
    width, height = img.size
    pixels = img.load()
    print("Image loaded:", width, "x", height)
    print("Top-Left:", pixels[0, 0])
    print("Center:", pixels[width//2, height//2])
    print("Middle-Top:", pixels[width//2, 0])
    print("Left-Center:", pixels[0, height//2])
    print("Diagonal-Inner:", pixels[100, 100])
except Exception as e:
    print("Error:", e)
