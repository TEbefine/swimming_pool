"""Shape text with HarfBuzz and draw exact pixels (font units/64) as big blocks."""
import sys, uharfbuzz as hb
from fontTools.ttLib import TTFont
from fontTools.pens.recordingPen import RecordingPen
from PIL import Image, ImageDraw
P=50
def glyph_pixels(font, name, cache={}):
    key=(id(font),name)
    if key in cache: return cache[key]
    gs=font.getGlyphSet(); pen=RecordingPen(); gs[name].draw(pen)
    polys=[]; cur=[]
    for op,args in pen.value:
        if op=='moveTo': cur=[args[0]]
        elif op=='lineTo': cur.append(args[0])
        elif op in('closePath','endPath'): polys.append(cur); cur=[]
    # rasterize via even-odd on pixel centers
    px=set()
    if polys:
        xs=[p[0] for pl in polys for p in pl]; ys=[p[1] for pl in polys for p in pl]
        for X in range(int(min(xs)//P), int(max(xs)//P)+1):
            for Y in range(int(min(ys)//P), int(max(ys)//P)+1):
                cx,cy=X*P+P/2,Y*P+P/2; inside=False
                for pl in polys:
                    n=len(pl)
                    for i in range(n):
                        (x1,y1),(x2,y2)=pl[i],pl[(i+1)%n]
                        if (y1>cy)!=(y2>cy) and cx < x1+(cy-y1)*(x2-x1)/(y2-y1): inside=not inside
                if inside: px.add((X,Y))
    cache[key]=px; return px
def render(path, lines, out, S=6, bg=(253,246,227), fg=(43,43,58)):
    data=open(path,'rb').read(); face=hb.Face(data); f=hb.Font(face); tt=TTFont(path)
    order=tt.getGlyphOrder()
    LH=25; W=0; runs=[]
    for t in lines:
        buf=hb.Buffer(); buf.add_str(t); buf.guess_segment_properties(); hb.shape(f,buf)
        runs.append(buf); W=max(W,sum(p.x_advance for p in buf.glyph_positions)//P)
    img=Image.new('RGB',((W+4)*S,(LH*len(lines)+4)*S),bg); d=ImageDraw.Draw(img)
    for li,buf in enumerate(runs):
        x=2*P; base=(li*LH+19)
        for info,pos in zip(buf.glyph_infos,buf.glyph_positions):
            for (X,Y) in glyph_pixels(tt,order[info.codepoint]):
                gx=(x+pos.x_offset)//P+X; gy=base-(Y+pos.y_offset//P)-1
                d.rectangle([gx*S,gy*S,gx*S+S-1-(S//6),gy*S+S-1-(S//6)],fill=fg)
            x+=pos.x_advance
    img.save(out)
if __name__=='__main__':
    render(sys.argv[1], sys.argv[3].split('|'), sys.argv[2], S=int(sys.argv[4]) if len(sys.argv)>4 else 6)
