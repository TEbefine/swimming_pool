"""Cut photo portraits (Midjourney) into game-ready dialogue portraits.

Usage (from the project root):
  pip install rembg onnxruntime
  python scripts/process_portraits.py barista

Reads  docs/characters/<id>/references/expressions_v1_whitebg.png  (2x2 grid: smile, thinking / idea, wai)
       docs/characters/<id>/references/identity_front_whitebg.png  (neutral)
Writes public/sprites/npc/<id>/portrait/<face>.webp  — 760x1000, transparent,
       every face scaled/aligned by the beret so the head never jumps between expressions.
"""
import os, sys
from PIL import Image
import numpy as np
from rembg import remove, new_session
from scipy import ndimage
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CID=sys.argv[1] if len(sys.argv)>1 else 'barista'
REF=os.path.join(ROOT,'docs','characters',CID,'references')
OUT=os.path.join(ROOT,'public','sprites','npc',CID,'portrait'); os.makedirs(OUT,exist_ok=True)
sess=new_session('u2net_human_seg')
grid=Image.open(os.path.join(REF,'expressions_v1_whitebg.png')).convert('RGB'); ident=Image.open(os.path.join(REF,'identity_front_whitebg.png')).convert('RGB')
W,H=grid.size
cells={'smile':grid.crop((0,0,W//2,H//2)),'thinking':grid.crop((W//2,0,W,H//2)),
       'idea':grid.crop((0,H//2,W//2,H)),'wai':grid.crop((W//2,H//2,W,H)),'neutral':ident}
def cut(img):
  src=np.array(img).astype(float)
  a=np.array(remove(img,session=sess,alpha_matting=True,alpha_matting_foreground_threshold=240,alpha_matting_background_threshold=15,alpha_matting_erode_size=8))[...,3]/255.0
  m=a>0.08; lab,n=ndimage.label(m)
  if n>1:
    sizes=ndimage.sum(m,lab,range(1,n+1)); a=np.where(ndimage.binary_dilation(lab==(1+int(np.argmax(sizes))),iterations=3),a,0)
  r,g,b=src[...,0],src[...,1],src[...,2]
  L=src.mean(axis=2); sat=src.max(axis=2)-src.min(axis=2); warm=(r-b)
  outside=a<0.05
  band=ndimage.binary_dilation(outside,iterations=28)&~outside
  neutral_or_dark=(warm<16)|(L<150)                     # white bg / dark hair — NOT cream shirt or skin
  key=band&neutral_or_dark&(sat<45)
  hh0=a.shape[0]; below=np.zeros_like(a,bool); below[int(hh0*0.58):]=True
  key=key&~(below&(a>0.9))          # shoulders/shirt edge below the hair line stay solid
  ak=np.clip((248-L)/175,0,1)
  a2=np.where(key,np.minimum(a,ak),a)
  al=np.clip(a2,1e-3,1)[...,None]
  col=np.where(key[...,None],np.clip((src-(1-al)*255)/al,0,255),src)
  # heal specks: small holes inside the body (shirt/shoulder edges) get their original alpha back
  hh=a.shape[0]; lower=np.zeros_like(a,bool); lower[int(hh*0.55):]=True
  opaque=a2>0.5; closed=ndimage.binary_closing(opaque,iterations=5)
  holes=closed&~opaque&lower
  a2=np.where(holes,a,a2); col=np.where(holes[...,None],src,col)
  a2=np.where(a2<0.04,0,a2)
  return Image.fromarray(np.dstack([col,a2*255]).astype(np.uint8))
def beret(im):
  a=np.array(im); r,g,b=[a[...,i].astype(int) for i in range(3)]
  o=(a[...,3]>200)&(g>r-5)&(g>b+12)&(r<120)&(g<130); o[a.shape[0]//2:]=False
  ys,xs=np.where(o); return xs.min(),xs.max(),ys.min()
for name,img in cells.items():
  im=cut(img); x0,x1,y0=beret(im)
  s=1.24 if name=='thinking' else 300/(x1-x0)
  r=im.resize((round(im.width*s),round(im.height*s)),Image.Resampling.LANCZOS)
  tmp=Image.new('RGBA',(760,1000),(0,0,0,0)); tmp.paste(r,(int(round(380-(x0+x1)/2*s)),int(round(70-y0*s))),r)
  tmp=tmp.crop((0,40,760,736))
  tmp.save(os.path.join(OUT,f'{name}.webp'),'WEBP',quality=92)
  print(name,round(s,3),tmp.getbbox())
