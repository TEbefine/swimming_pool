import sys, numpy as np, base64, io
from PIL import Image
src,out_png,out_b64,out_chk=sys.argv[1:5]
rgb=np.asarray(Image.open(src).convert('RGB')).astype(np.float32); h,w,_=rgb.shape; lum=rgb.max(-1)
def first(line,thr):
    i=np.where(line>thr)[0]; return i.min() if len(i) else None
def last(line,thr):
    i=np.where(line>thr)[0]; return i.max() if len(i) else None
cx,cy=w/2,h/2
# disc: top/bottom along a column away from the ring band, left edge along a row above the ring
for _ in range(4):
    col=lum[:,int(cx)]; yT=first(col,60); yB=last(col,60); r=(yB-yT)/2; cy=(yT+yB)/2
    row=lum[int(cy-r*0.55)]; xL=first(row,10); xR=last(row,60)
    cx=(xL+xR)/2
print('disc',round(cx,1),round(cy,1),round(r,1))
yy,xx=np.mgrid[0:h,0:w]; d=np.hypot(xx-cx,yy-cy)
disc=np.clip((r-2-d)/3,0,1)
light=np.clip(lum/170,0,1)**0.85          # ring + rim glow by brightness
a=np.maximum(disc,light*(lum>8))
col=np.where(a[...,None]>0.02, rgb/np.maximum(a[...,None],0.02), 0)  # unpremultiply over black
col=np.where(disc[...,None]>0.99, rgb, col).clip(0,255)
ys,xs=np.where(a>0.03); half=int(max(cx-xs.min(),xs.max()-cx,cy-ys.min(),ys.max()-cy))+6
box=(int(cx-half),int(cy-half),int(cx+half),int(cy+half))
img=Image.fromarray(np.dstack([col,a*255]).astype(np.uint8),'RGBA').crop(box)
img.save(out_png); print('size',img.size,'disc fraction',round(2*r/img.size[0],3))
sm=img.resize((460,460),Image.LANCZOS); b=io.BytesIO(); sm.save(b,'WEBP',quality=88)
open(out_b64,'w').write(base64.b64encode(b.getvalue()).decode())
bg=Image.new('RGBA',sm.size,(60,60,80,255)); bg.alpha_composite(sm); bg.convert('RGB').save(out_chk); print('kb',len(b.getvalue())//1024)
