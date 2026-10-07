import sys, cv2, numpy as np, base64, io
from PIL import Image
src, out_png, out_b64, out_chk = sys.argv[1:5]
im=cv2.imread(src); h,w=im.shape[:2]
g=cv2.GaussianBlur(cv2.cvtColor(im,cv2.COLOR_BGR2GRAY),(9,9),0)
c=cv2.HoughCircles(g,cv2.HOUGH_GRADIENT,dp=1.5,minDist=w,param1=50,param2=40,minRadius=int(w*.3),maxRadius=int(w*.49))
cx,cy,r=[float(v) for v in c[0][0]]
rgb=np.asarray(Image.open(src).convert('RGB')).astype(np.float32); lum=rgb.max(-1)
# refine center + radius. Light comes from the upper right, so the glow sits on the right:
# use the night-side LEFT edge (low threshold) and the TOP/BOTTOM edges (higher threshold, past the faint glow)
def first(line,thr):
    i=np.where(line>thr)[0]; return i.min() if len(i) else None
def last(line,thr):
    i=np.where(line>thr)[0]; return i.max() if len(i) else None
for _ in range(4):
    col=lum[:,int(round(cx))]; yT=first(col,60); yB=last(col,60)
    r=(yB-yT)/2; cy=(yT+yB)/2
    xL=first(lum[int(round(cy))],10); cx=xL+r
rd=r-4
ring=max(18,int(rd*.06))
yy,xx=np.mgrid[0:h,0:w]; d=np.hypot(xx-cx,yy-cy)
inner=np.clip((rd+1.5-d)/3.0,0,1)
glow=np.clip(1-(d-rd)/ring,0,1)*np.clip((lum-25)/150,0,1)
a=np.maximum(inner,glow)
R=int(rd+ring+2)
img=Image.fromarray(np.dstack([rgb,a*255]).clip(0,255).astype(np.uint8),'RGBA').crop((int(cx-R),int(cy-R),int(cx+R),int(cy+R)))
img.save(out_png)
sm=img.resize((400,400),Image.LANCZOS); b=io.BytesIO(); sm.save(b,'WEBP',quality=88)
open(out_b64,'w').write(base64.b64encode(b.getvalue()).decode())
bg=Image.new('RGBA',sm.size,(40,40,60,255)); bg.alpha_composite(sm); bg.convert('RGB').save(out_chk)
print('center',round(cx,1),round(cy,1),'r_hough',round(r,1),'r_disc',round(rd,1),'kb',len(b.getvalue())//1024)
