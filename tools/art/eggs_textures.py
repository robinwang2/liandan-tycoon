"""Rebuild the three original prints with Pillow and the project's OFL font."""
import math
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
FONT = ROOT / 'unity/Game/Assets/Shell/Fonts/NotoSansSC-VF.ttf'
AD = ('GFX 58O 核弹级', '华强北 · 矿渣翻新 · 包过保', '两张就能炼 AlexNet',
      '功耗 244W 冬天能取暖', '拆机满血 · 假一赔三', '赛格电子市场 3 楼 · 认准老王')


def font(size):
    return ImageFont.truetype(str(FONT), size)


def save(prop, image):
    path = ROOT / 'art-src/eggs' / ('egg_' + prop) / 'tex/print.png'
    path.parent.mkdir(parents=True, exist_ok=True)
    image.convert('RGB').save(path)


def advert():
    image = Image.new('RGB', (768, 1280), '#aa1815'); draw = ImageDraw.Draw(image)
    for index in range(20):
        angle = index * math.pi / 10
        draw.polygon([(384,540)] + [(384+1250*math.cos(rad),540+1250*math.sin(rad)) for rad in (angle,angle+.11)], fill='#d93018')
    draw.text((34,35), '老王硬件  /  特价专场', font=font(30), fill='#fff0ba')
    draw.text((32,115), AD[0], font=font(88), stroke_width=2, fill='#ffdf39')
    draw.text((36,263), AD[1], font=font(46), fill='white')
    draw.polygon([(58,470),(635,432),(703,490),(701,675),(89,721)],fill='#201d27',outline='white',width=6)
    for center in (260,509):
        draw.ellipse((center-90,483,center+90,663),fill='#0f131a',outline='#f6a341',width=5)
        for blade in range(9):
            rad = blade*math.tau/9
            draw.polygon([(center,573)]+[(center+radius*math.cos(rad+off),573+radius*math.sin(rad+off)) for radius,off in ((81,0),(72,.4),(22,.65))],fill='#87888b')
        draw.ellipse((center-19,554,center+19,592),fill='#e59130')
    for index, text in enumerate(AD[2:5]):
        draw.rounded_rectangle((34,799+index*103,733,882+index*103),14,fill='#ffda47');draw.text((60,806+index*103),text,font=font(45),fill='#3d1215')
    draw.text((36,1166),AD[-1],font=font(39),fill='white');save('gpu_ad',image)


def attention():
    image=Image.new('RGB',(800,1120),'#f7f1e6');draw=ImageDraw.Draw(image)
    draw.text((50,55),'MODEL NOTES   /   2017',font=font(26),fill='#9b522c')
    draw.text((47,151),'Attention Is All\nYou Need',font=font(83),fill='#172f37',spacing=0)
    draw.line((50,435,750,435),fill='#365763',width=3)
    for left,title,labels in [(75,'ENCODER',['Feed forward','Self-attention']), (450,'DECODER',['Feed forward','Cross-attention','Masked attention'])]:
        draw.text((left,505),title,font=font(33),fill='#284d56')
        for index,label in enumerate(labels):
            top=610+index*107
            draw.rounded_rectangle((left,top,left+270,top+75),11,fill=('#c5dbcf','#e8c1a8','#c7d2e1')[index]);draw.text((left+15,top+16),label,font=font(27),fill='#20383f')
            if index: draw.line((left+132,top,left+132,top-30),fill='#365763',width=4);draw.polygon([(left+124,top-20),(left+140,top-20),(left+132,top-32)],fill='#365763')
    draw.line([(345,646),(397,646),(397,753),(449,753)],fill='#ae6137',width=5);draw.polygon([(436,745),(450,753),(436,761)],fill='#ae6137')
    draw.text((51,1003),'01     /     SEQUENCE TRANSDUCTION',font=font(26),fill='#566768');save('attention',image)


def whiteboard():
    image=Image.new('RGB',(1440,900),'#f3f3eb');draw=ImageDraw.Draw(image);rng=random.Random(917)
    for text,pos,size,color,angle in [('strawberry 里有几个 r？',(60,67),75,'#20334c',2),('9.11 > 9.9 ?', (825,240),73,'#32717d',-4),('AGI 明年就到',(760,583),77,'#a42f30',2)]:
        ink=Image.new('RGBA',(size*len(text)+24,int(size*1.6)));ImageDraw.Draw(ink).text((8,0),text,font=font(size),fill=color);ink=ink.rotate(angle,resample=Image.Resampling.BICUBIC,expand=True);image.paste(ink,pos,ink)
    draw.ellipse((733,570,1355,795),outline='#ae3839',width=8)
    for index,color in enumerate(('#2f6379','#b74731','#457747')):
        left=65+index*181;top=437+index*21
        draw.line([(left,top),(left-4,top+210),(left+151,top+217)],fill='#49535b',width=5)
        draw.line([(left+5+step*8,top+185-153*math.exp(-step/5)+rng.randint(-10,10)) for step in range(18)],fill=color,width=6)
    draw.text((85,720),'loss  ↘  ?',font=font(46),fill='#35536b');save('whiteboard',image)


if __name__ == '__main__':
    advert(); attention(); whiteboard()
    grille=Image.new('RGB',(64,64),'#2b3034');pen=ImageDraw.Draw(grille)
    for shift in range(-64,129,16):
        for sign in (-1,1):
            pen.line((shift,0,shift+sign*64,64),fill='#787f83',width=5)
            pen.line((shift+1,0,shift+1+sign*64,64),fill='#acb3b5',width=1)
    save('mic',grille)
