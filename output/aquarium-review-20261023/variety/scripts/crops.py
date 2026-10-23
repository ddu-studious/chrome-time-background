# 用法：python3 crops.py <tag> [pad] —— 按 <tag>.json 里记录的鱼的位置，从 <tag>.png 裁出每条鱼的特写拼成一张图
import json, sys
from PIL import Image, ImageDraw
OUT='/Users/liuqingwen/Firm/Private/work-space/ai-coding/chrome-extensions/chrome-time-background/output/aquarium-review-20261023/variety'
tag=sys.argv[1]; pad=int(sys.argv[2]) if len(sys.argv)>2 else 70
only=set(sys.argv[3].split(',')) if len(sys.argv)>3 else None
d=json.load(open(f'{OUT}/{tag}.json')); dpr=d.get('dpr',1)
im=Image.open(f'{OUT}/{tag}.png').convert('RGB')
fish=[f for f in d['info']['fish'] if (not only or f['species'] in only)]
# 每个条目只取第一条（群居的只看一条）
seen=set(); picks=[]
for f in sorted(fish,key=lambda f:-f['z']):
    if f['entry'] in seen: continue
    seen.add(f['entry']); picks.append(f)
tiles=[]
for f in picks:
    x,y=f['x']*dpr,f['y']*dpr; r=pad*dpr
    box=(int(x-r),int(y-r*0.8),int(x+r),int(y+r*0.8))
    t=im.crop(box).resize((int(2*pad*3),int(1.6*pad*3)),Image.LANCZOS)
    ImageDraw.Draw(t).text((6,4),f"{f['species']} len{f['len']} z{f['z']} size{f['size']}",fill=(255,255,255))
    tiles.append(t)
cols=3; rows=(len(tiles)+cols-1)//cols
W=tiles[0].width; H=tiles[0].height
out=Image.new('RGB',(W*cols,H*rows),(0,0,0))
for i,t in enumerate(tiles): out.paste(t,((i%cols)*W,(i//cols)*H))
out.save(f'{OUT}/{tag}-crops.png'); print(out.size, len(tiles))
