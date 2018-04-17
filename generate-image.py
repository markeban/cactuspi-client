import sys
from PIL import Image, ImageFont, ImageDraw

def colorRandom():
    rgbl=[255, 0, 0]
    random.shuffle(rgbl)
    return tuple(rgbl)

def writeImage(inputString, filename, ledRows):
    print 'this is python', inputString, filename
    font = ImageFont.truetype("/usr/share/fonts/truetype/freefont/FreeSans.ttf", 28)
    width, ignore = font.getsize(inputString)
    im = Image.new("RGB", (width + 30, ledRows), "black")
    draw = ImageDraw.Draw(im)
    draw.text((0, 0), inputString, colorRandom(), font=font)

    im.save(filename)

if __name__ == '__main__':
    writeImage(sys.argv[1], sys.argv[2], 32)
