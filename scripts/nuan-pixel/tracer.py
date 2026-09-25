import numpy as np
from PIL import Image, ImageDraw, ImageFont
from skimage.morphology import skeletonize
BODY=566
REF='ref/ntl400.ttf'
_fonts={}
def font(N,S):
    k=(N,S)
    if k not in _fonts: _fonts[k]=ImageFont.truetype(REF, int(round(1000*N*S/BODY)))
    return _fonts[k]
def hires(ch,N,S,dx=0):
    """render char; returns bool array and (ox,oy) origin pixel (baseline-left)"""
    f=font(N,S); W=S*(3*N); H=S*(3*N)
    im=Image.new('L',(W,H),0); d=ImageDraw.Draw(im)
    ox=S*N+dx; oy=S*2*N
    d.text((ox,oy),ch,font=f,fill=255,anchor='ls')
    return np.array(im)>127, ox, oy
def trace(ch,N=10,S=16,dx=0,thr=None):
    a,ox,oy=hires(ch,N,S,dx)
    sk=skeletonize(a)
    thr=thr or S*0.35
    cells={}
    ys,xs=np.nonzero(sk)
    for x,y in zip(xs,ys):
        i=(x-ox)//S; j=(oy-1-y)//S   # j: row index from baseline (0 = first row above baseline)
        cells[(i,j)]=cells.get((i,j),0)+1
    px={c for c,n in cells.items() if n>=thr}
    return px
def best_trace(ch,N=10,S=16,**kw):
    best=None
    for dx in range(0,S,S//4):
        a,ox,oy=hires(ch,N,S,dx); sk=skeletonize(a)
        ys,xs=np.nonzero(sk)
        # score: skeleton closeness to cell centers (horizontal)
        fx=((xs-ox)%S)-S/2+0.5
        score=np.mean(np.abs(fx))
        if best is None or score<best[0]: best=(score,dx)
    return trace(ch,N,S,best[1],**kw)
def norm(px):
    if not px: return px
    mx=min(x for x,_ in px); return {(x-mx,y) for x,y in px}
def show(px):
    xs=[x for x,_ in px]; ys=[y for _,y in px]
    out=[]
    for y in range(max(ys),min(ys)-1,-1):
        out.append(''.join('#' if (x,y) in px else '.' for x in range(min(xs),max(xs)+1)))
    return '\n'.join(out)

def coverage(ch,N=10,S=16,dx=0,dy=0,ref=None):
    global REF
    if ref: REF=ref; _fonts.clear()
    a,ox,oy=hires(ch,N,S,dx)
    oy+=dy
    H,W=a.shape
    cov={}
    ys,xs=np.nonzero(a)
    for x,y in zip(xs,ys):
        c=((x-ox)//S,(oy-1-y)//S); cov[c]=cov.get(c,0)+1
    return {c:n/(S*S) for c,n in cov.items()}
def cov_trace(ch,N=10,S=16,thr=0.45,ref=None):
    best=None
    for dx in range(0,S,2):
        cv=coverage(ch,N,S,dx,0,ref)
        # crispness: sum of min(c,1-c)
        sc=sum(min(v,1-v) for v in cv.values())
        if best is None or sc<best[0]: best=(sc,dx,cv)
    return {c for c,v in best[2].items() if v>=thr}
