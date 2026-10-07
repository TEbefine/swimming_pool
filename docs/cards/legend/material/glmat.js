// ---- Legend frame material (WebGL): surface maps + a virtual photo studio that swings across the metal as the card tilts
const GL_VS='attribute vec2 p;varying vec2 vUv;void main(){vUv=vec2(p.x*.5+.5,.5-p.y*.5);gl_Position=vec4(p,0.,1.);}';
const GL_FS=`precision highp float;
varying vec2 vUv;
uniform sampler2D uN,uM,uSky,uSkyB;
uniform vec2 uTilt,uTex;
uniform vec4 uRect;
uniform float uAsp,uShut;
uniform int uMat;
uniform vec3 uMetal,uPol,uFace,uGem;
uniform sampler2D uL;
uniform vec4 uLRect;
uniform vec2 uLTexel;
uniform float uHasL;
uniform int uIns;
uniform float uSplit,uTime;
uniform int uCool;
float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float vnoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}
float box(vec2 p,vec2 c,vec2 h,float s){vec2 d=abs(p-c)-h;return (1.-smoothstep(-s,s,d.x))*(1.-smoothstep(-s,s,d.y));}
uniform float uK;
float box2(vec2 p,vec2 c,vec2 h,vec2 s){vec2 d=abs(p-c)-h;return (1.-smoothstep(-s.x,s.x,d.x))*(1.-smoothstep(-s.y,s.y,d.y));}
// virtual photo studio: front fill, big soft key panel, overhead softbox, left strip, cool right rim
vec3 studio(vec3 r,vec2 s){
  float up=r.y;
  vec3 c=mix(vec3(.06,.062,.07),vec3(.34,.345,.36),smoothstep(-.8,.9,up));
  c+=vec3(.55)*smoothstep(.55,1.,r.z);
  c+=vec3(.95)*box2(r.xy,vec2(-.34,.05),vec2(.22,.95),s+vec2(.24,.24));
  c+=vec3(1.9)*box2(r.xy,vec2(-.05,.70),vec2(.75,.15),s+vec2(.03,.03));
  c+=vec3(1.5)*box2(r.xy,vec2(-.80,-.05),vec2(.05,.80),s+vec2(.02,.02));
  c+=vec3(.75,.82,1.)*box2(r.xy,vec2(.84,.10),vec2(.028,.70),s+vec2(.02,.02));
  c+=vec3(.06)*smoothstep(0.,-.9,up);
  return c*uK;
}
vec3 studio(vec3 r,float s){return studio(r,vec2(s));}
mat3 rotY(float a){float c=cos(a),s=sin(a);return mat3(c,0.,-s,0.,1.,0.,s,0.,c);}
mat3 rotX(float a){float c=cos(a),s=sin(a);return mat3(1.,0.,0.,0.,c,s,0.,-s,c);}
vec3 tone(vec3 c){return 1.-exp(-c*1.15);}
void main(){
  vec4 N=texture2D(uN,vUv);float a=N.a;
  if(a<.002){gl_FragColor=vec4(0.);return;}
  vec4 M=texture2D(uM,vUv);float etch=M.r,band=M.g,h=N.b;
  vec2 nxy=N.rg*2.-1.;nxy.y=-nxy.y;
  vec2 px=vUv*uTex;
  if(uShut>.5){float b=vnoise(vec2(px.x*.012,px.y*1.6))-.5;b+=(vnoise(vec2(px.x*.07,px.y*3.3))-.5)*.5;nxy.y+=b*.07;}
  float tl=length(nxy);
  vec3 n=normalize(vec3(nxy,sqrt(max(.02,1.-dot(nxy,nxy)))));
  vec2 cu=uRect.xy+vUv*uRect.zw;
  vec3 P=vec3(cu.x-.5,(.5-cu.y)*uAsp,0.);
  vec3 v=normalize(vec3(0.,.15,2.6)-P);
  mat3 R=rotY(uTilt.x*.55)*rotX(-uTilt.y*.40);
  vec3 r=R*reflect(-v,n);
  float ndv=clamp(dot(n,v),0.,1.);
  float edge=smoothstep(.04,.35,tl);
  float g=hash(floor(px))-.5;
  vec3 col;
  float m=clamp(max(band,edge),0.,1.);                              // polished zone: outer band + every bevel
  float sq=step(.040,vUv.x)*step(vUv.x,.077)*step(.914,vUv.y)*step(vUv.y,.946);   // the little write-protect window
  if(uMat==0){                                                      // SOLID GOLD: satin face, mirror edges, black enamel inlay
    vec2 rs=uShut>.5?vec2(.05,.42):vec2(mix(.10,.010,edge));         // brushed shutter smears light across the grain
    vec3 env=studio(r,rs);
    col=uMetal*env*(1.+g*.06)*(uShut>.5?.85:1.)+uMetal*uMetal*.035;
    col=mix(col,uPol*studio(r,.006)*1.25,edge*(uShut>.5?.7:1.));
    vec3 enamel=vec3(.016,.014,.012)+studio(r,.01)*.045;
    col=mix(col,enamel,etch*(1.-edge*.5));
  }else if(uMat==1){                                                // BLACK GLASS & GOLD: the universe shows through, gold edges + gold inlay
    vec2 su=(cu-vec2(.517,.4893))/.874+.5;
    su+=nxy*(.05+.07*(1.-h))*vec2(1.,-1.);
    su=1.-abs(1.-mod(su,2.));
    vec2 dsp=nxy*vec2(1.,-1.)*.012*edge;
    vec3 clear=vec3(texture2D(uSky,su+dsp).r,texture2D(uSky,su).g,texture2D(uSky,su-dsp).b);
    vec3 bg=mix(texture2D(uSkyB,su).rgb,clear,.75);
    vec3 body=bg*1.05+vec3(.020,.018,.016)+g*.006;
    float F=.04+.96*pow(1.-ndv,5.);
    vec3 env=studio(r,.008);
    col=mix(body,env*.9,clamp(F*1.3+.03,0.,.9))+env*.03;
    float hair=clamp(max(band,M.b),0.,1.);                         // minimal gold: only fine hairlines
    col=mix(col,uPol*studio(r,.006)*1.25+uMetal*.03,hair);
    vec3 inlay=uPol*studio(r,.03)*1.1+uMetal*.05;
    vec3 hole=vec3(.012,.011,.010)+studio(r,.01)*.07;
    col=mix(col,mix(inlay,hole,sq),etch);
    col=mix(col,uPol*studio(r,.006)*1.25,edge*sq);               // gold bezel round the little window
    if(uSplit>.5){                                                // GUNDAM SPLIT: lower quarter = gold armour plate
      vec2 fp=vUv*uTex;float y0=uTex.y*.75;float seam,dy,dist;
      if(uCool>0){                                                // bold 45deg armour cut across each rail
        float dO=fp.x<407.?fp.x-15.5:798.5-fp.x;
        seam=y0-40.+clamp(dO,0.,70.);dy=fp.y-seam;dist=abs(dy)*.7071;
      }else{                                                      // small step (clean)
        float dx=fp.x<407.?fp.x-47.:780.5-fp.x;
        seam=y0+clamp(dx,-12.,12.);dy=fp.y-seam;dist=abs(dy)/(1.+.414*step(abs(dx),12.));
      }
      float gm=smoothstep(-.6,.6,dy);
      vec3 goldC=uMetal*studio(r,mix(.10,.010,edge))*(1.+g*.06)+uMetal*uMetal*.035;
      goldC=mix(goldC,uPol*studio(r,.006)*1.25,edge);
      goldC=mix(goldC,vec3(.016,.014,.012)+studio(r,.01)*.045,etch*(1.-edge*.5));
      goldC*=1.-.42*(1.-smoothstep(0.,5.,dy))*step(0.,dy);
      col=mix(col,goldC,gm);
      col=mix(col,vec3(.006),1.-smoothstep(.55,1.45,dist));
      col+=vec3(.55,.5,.42)*(1.-smoothstep(0.,1.1,abs(dy+1.9)))*(1.-gm)*.22;
      if(uCool>0){                                                // the Creator's universe leaking through the armour
        float pulse=.80+.20*sin(uTime*1.35);
        vec3 glow=vec3(.66,.52,1.0);
        col=mix(col,glow*1.9*pulse+vec3(.25),(1.-smoothstep(.3,1.6,dist))*.9);   // bright core in the groove
        col+=glow*pulse*(exp(-dist/2.6)*.55+exp(-dist/9.)*.22);                    // light spilling onto glass and gold
        vec2 q=abs(fp-vec2(47.5,1010.))-vec2(10.,10.5);float sd=length(max(q,0.))+min(max(q.x,q.y),0.);
        float core=1.-smoothstep(-9.,0.,sd);                        // brighter in the middle of the window
        col=mix(col,glow*(1.5+1.2*core)*pulse+vec3(.2+.35*core),etch*sq*(1.-edge));  // the little window = status light
        col+=glow*pulse*(exp(-max(sd,0.)/3.)*.5+exp(-max(sd,0.)/10.)*.2)*step(0.,sd);
      }
    }
  }else{                                                            // CHAMPAGNE GOLD: matte glass face, polished gold band (iPhone gold)
    vec3 face=uFace*(.52+.55*studio(r,.55))+g*.022;
    face+=studio(r,.015)*.03;
    col=mix(face,uPol*studio(r,.008)*1.15+uMetal*.03,m);
    vec3 gloss=uFace*.42+uPol*studio(r,.01)*.35;
    gloss=mix(gloss,vec3(.02,.016,.012)+studio(r,.01)*.07,sq);
    col=mix(col,gloss,etch*(1.-m));
  }
  // ---- riveted plate: raised brushed-gold plate, letters stamped in (black enamel fill), two domed gold rivets
  if(uHasL>.5){
    vec2 lu=(cu-uLRect.xy)/uLRect.zw;
    if(lu.x>0.&&lu.x<1.&&lu.y>0.&&lu.y<1.){
      vec4 L=texture2D(uL,lu);vec2 e=uLTexel;
      vec4 Lx=texture2D(uL,lu+vec2(e.x,0.))-texture2D(uL,lu-vec2(e.x,0.));
      vec4 Ly=texture2D(uL,lu+vec2(0.,e.y))-texture2D(uL,lu-vec2(0.,e.y));
      vec4 Px=texture2D(uL,lu+vec2(e.x*2.,0.))-texture2D(uL,lu-vec2(e.x*2.,0.));
      vec4 Py=texture2D(uL,lu+vec2(0.,e.y*2.))-texture2D(uL,lu-vec2(0.,e.y*2.));
      float plate=L.b,txt=L.r,riv=L.g;
      if(uIns==0){
      // the plate stands off the glass: soft contact shadow down-right (key light is upper-left)
      float sh=texture2D(uL,lu-vec2(e.x*9.,e.y*12.)).b;
      col*=1.-.6*sh*(1.-smoothstep(.0,.6,plate));
      // brushed grain along the plate
      float b=vnoise(vec2(px.x*.025,px.y*2.4))-.5;b+=(vnoise(vec2(px.x*.11,px.y*4.7))-.5)*.5;
      vec2 nb=n.xy+vec2(-Px.b,Py.b)*1.1+vec2(0.,b*.06);              // raised plate bevel + grain
      vec3 nPl=normalize(vec3(nb,n.z));
      vec3 nT=normalize(vec3(nb+vec2(Lx.r,-Ly.r)*1.6,n.z));            // stamped (debossed) letters
      vec3 nR=normalize(vec3(n.xy+vec2(-Lx.g,Ly.g)*4.2,n.z));          // domed rivet heads
      vec3 rPl=R*reflect(-v,nPl),rT=R*reflect(-v,nT),rR=R*reflect(-v,nR);
      float bev=clamp(length(vec2(Px.b,Py.b))*1.3,0.,1.);
      float wallT=clamp(length(vec2(Lx.r,Ly.r))*1.2,0.,1.);
      vec3 plateC=mix(uMetal,uPol,.30)*studio(rPl,vec2(.05,.38))*1.04+uMetal*.04;
      plateC=mix(plateC,uPol*studio(rPl,.01)*1.25,bev);                 // polished bevel edge
      vec3 ink=vec3(.012,.011,.010)+studio(rT,.01)*.05;                  // black enamel in the letters
      vec3 letterC=mix(ink,uPol*studio(rT,.01)*1.2,wallT*.7);            // stamped walls catch light
      vec3 pc=mix(plateC,letterC,txt);
      float rm=smoothstep(.02,.10,riv);
      vec3 rivC=mix(uMetal,uPol,.6)*studio(rR,.006)*1.3+uMetal*.02;
      rivC*=.35+.65*smoothstep(.06,.34,riv);                              // dark seat around the head
      pc=mix(pc,rivC,rm);
      col=mix(col,pc,smoothstep(.0,.5,plate));
      }else if(uIns==1){                                  // LASER FROST: letters frosted into the glass
        vec3 nT=normalize(vec3(n.xy+vec2(Lx.r,-Ly.r)*.8,n.z));vec3 rT=R*reflect(-v,nT);
        vec3 frost=vec3(.60,.61,.64)*(.55+.45*studio(rT,.7).g)+g*.07;
        col=mix(col,frost,txt*.92);
      }else if(uIns==2){                                  // GOLD INLAY: polished gold flush in the glass + hairlines
        vec3 nT=normalize(vec3(n.xy+vec2(-Lx.r,Ly.r)*.9,n.z));vec3 rT=R*reflect(-v,nT);
        vec3 gold=mix(uMetal,uPol,.45)*studio(rT,.02)*1.2+uMetal*.05;
        col=mix(col,gold,max(txt,L.g));
      }else if(uIns==3){                                  // INNER LIGHT: the universe shines out through the words
        float halo=0.,halo2=0.;
        for(int k=0;k<12;k++){float an=float(k)*.5236;vec2 d=vec2(cos(an),sin(an)*3.2)*e;
          halo+=texture2D(uL,lu+d*7.).r;halo2+=texture2D(uL,lu+d*18.).r;}
        halo=halo/12.*.65+halo2/12.*.35;
        vec2 su=(cu-vec2(.517,.4893))/.874+.5;su=1.-abs(1.-mod(su,2.));
        vec3 sky=texture2D(uSky,su).rgb;
        vec3 light=vec3(1.,.86,.62);
        col+=light*halo*(1.-txt)*.75;                     // warm glow spilling onto the glass
        col=mix(col,vec3(1.25,1.12,.92)+light*.6+sky*.4,txt);   // the letters themselves: lit from inside
      }else if(uIns==8){                                  // ARMOUR PLATE: laser-etched sentence + engraved panel lines / vents
        vec3 nT=normalize(vec3(n.xy+vec2(Lx.r,-Ly.r)*.9,n.z));vec3 rT=R*reflect(-v,nT);
        col=mix(col,vec3(.034,.027,.02)+studio(rT,.03)*.07,txt*.96);
        vec3 nG=normalize(vec3(n.xy+vec2(Lx.g,-Ly.g)*1.5,n.z));vec3 rG=R*reflect(-v,nG);
        float wallG=clamp(length(vec2(Lx.g,Ly.g))*1.3,0.,1.);
        col=mix(col,vec3(.02,.016,.012),L.g*.85);
        col=mix(col,uPol*studio(rG,.01)*1.2,wallG*.55*(1.-L.g*.5));
      }else if(uIns==7){                                  // LASER ETCH: dark letters burnt into the gold plate
        vec3 nT=normalize(vec3(n.xy+vec2(Lx.r,-Ly.r)*.9,n.z));vec3 rT=R*reflect(-v,nT);
        vec3 ink=vec3(.034,.027,.02)+studio(rT,.03)*.07;
        col=mix(col,ink,txt*.96);
      }else if(uIns>=5){                                  // GAME BOY LINE: italic/pixel caps between twin lines
        vec3 nT=normalize(vec3(n.xy+vec2(-Lx.r,Ly.r)*.8,n.z));vec3 rT=R*reflect(-v,nT);
        vec3 gold=mix(uMetal,uPol,.45)*studio(rT,.02)*1.15+uMetal*.05;
        col=mix(col,gold,max(txt,L.g));
        vec3 lav=uGem*(.55+.45*studio(r,.4).g)+studio(r,.01)*.05;  // type colour line (Spirit)
        col=mix(col,lav,L.b);
      }else{                                              // DEEP STAMP: pressed deep, black inside, gold walls
        vec3 nW=normalize(vec3(n.xy+vec2(Px.r,-Py.r)*2.4,n.z));vec3 rW=R*reflect(-v,nW);
        float w2=clamp(length(vec2(Px.r,Py.r))*1.1,0.,1.);
        col=mix(col,vec3(.006,.005,.005),txt);
        col=mix(col,uPol*studio(rW,.01)*1.3+uMetal*.04,w2*.92);
      }
    }
  }
  col=tone(col);
  gl_FragColor=vec4(col*a,a);
}`;
function glCreate(canvas){
  const gl=canvas.getContext('webgl',{premultipliedAlpha:true,alpha:true,antialias:false});if(!gl)return null;
  const sh=(t,s)=>{const o=gl.createShader(t);gl.shaderSource(o,s);gl.compileShader(o);if(!gl.getShaderParameter(o,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(o));return o;};
  const pr=gl.createProgram();gl.attachShader(pr,sh(gl.VERTEX_SHADER,GL_VS));gl.attachShader(pr,sh(gl.FRAGMENT_SHADER,GL_FS));gl.linkProgram(pr);
  if(!gl.getProgramParameter(pr,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(pr));
  const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
  const lp=gl.getAttribLocation(pr,'p');gl.enableVertexAttribArray(lp);gl.vertexAttribPointer(lp,2,gl.FLOAT,false,0,0);
  const U={};['uN','uM','uSky','uSkyB','uTilt','uTex','uRect','uAsp','uShut','uMat','uK','uMetal','uPol','uFace','uGem','uL','uLRect','uLTexel','uHasL','uIns','uSplit','uTime','uCool'].forEach(k=>U[k]=gl.getUniformLocation(pr,k));
  return {gl,pr,U,canvas,tex:[]};
}
function glTex(G,src,unit){return new Promise((res,rej)=>{const im=new Image();im.onload=()=>{const gl=G.gl,t=gl.createTexture();gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,t);
  gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL,gl.NONE);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,im);
  [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T].forEach(k=>gl.texParameteri(gl.TEXTURE_2D,k,gl.CLAMP_TO_EDGE));
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  G.tex[unit]=t;res();};im.onerror=rej;im.src=src;});}
function glDraw(G,o){
  const gl=G.gl,c=G.canvas,dpr=Math.min(devicePixelRatio||1,2.5),w=Math.max(1,Math.round(c.clientWidth*dpr)),h=Math.max(1,Math.round(c.clientHeight*dpr));
  if(c.width!==w||c.height!==h){c.width=w;c.height=h;}
  gl.viewport(0,0,w,h);gl.useProgram(G.pr);
  G.tex.forEach((t,i)=>{if(t){gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,t);}});
  const U=G.U;gl.uniform1i(U.uN,0);gl.uniform1i(U.uM,1);gl.uniform1i(U.uSky,2);gl.uniform1i(U.uSkyB,3);
  gl.uniform2f(U.uTilt,o.tx,o.ty);gl.uniform2f(U.uTex,o.texW,o.texH);gl.uniform4f(U.uRect,...o.rect);
  gl.uniform1f(U.uAsp,1448/1086);gl.uniform1f(U.uShut,o.shut?1:0);gl.uniform1i(U.uMat,o.mat);gl.uniform1f(U.uK,o.k||1);gl.uniform3fv(U.uMetal,o.metal);gl.uniform3fv(U.uPol,o.pol);gl.uniform3fv(U.uFace,o.face||[.5,.5,.5]);
  gl.uniform1i(U.uL,4);gl.uniform1f(U.uHasL,o.label&&G.tex[4]?1:0);gl.uniform4f(U.uLRect,...(o.lrect||[.0967,.89393,.8407,.0718]));
  gl.uniform2f(U.uLTexel,1/(G.lw||1),1/(G.lh||1));gl.uniform3fv(U.uGem,o.gem||[.6,.5,.8]);gl.uniform1i(U.uIns,o.ins||0);gl.uniform1f(U.uSplit,o.split?1:0);gl.uniform1f(U.uTime,o.time||0);gl.uniform1i(U.uCool,o.cool||0);
  gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
}

function glCanvasTex(G,cv,unit){const gl=G.gl;if(G.tex[unit])gl.deleteTexture(G.tex[unit]);const t=gl.createTexture();gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,t);
  gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL,gl.NONE);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,cv);
  [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T].forEach(k=>gl.texParameteri(gl.TEXTURE_2D,k,gl.CLAMP_TO_EDGE));
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  G.tex[unit]=t;G.lw=cv.width;G.lh=cv.height;}
// plate texture: R = stamped letters, G = rivet domes, B = raised plate (with a stepped bevel ramp)
async function buildPlate(sentence){
  const W=2736,H=312,cv=document.createElement('canvas');cv.width=W;cv.height=H;const c=cv.getContext('2d');
  const face='"Cinzel Plate",Georgia,"Times New Roman",serif';
  try{await document.fonts.load('600 100px "Cinzel Plate"');}catch(e){}
  c.fillStyle='#000';c.fillRect(0,0,W,H);c.globalCompositeOperation='lighter';
  const rr=(x,y,w,h,r)=>{c.beginPath();c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath();};
  const px0=56,py0=40,pw=W-112,ph=H-80,STEPS=8;
  for(let i=0;i<STEPS;i++){c.fillStyle='rgba(0,0,255,'+(1/STEPS)+')';rr(px0+i,py0+i,pw-2*i,ph-2*i,18-i);c.fill();}
  // rivets at both ends
  const rr_=40,ry=H/2;[px0+76,px0+pw-76].forEach(x=>{const g=c.createRadialGradient(x,ry,0,x,ry,rr_);
    g.addColorStop(0,'#00ff00');g.addColorStop(.45,'#00e600');g.addColorStop(.75,'#00a000');g.addColorStop(.9,'#003c00');g.addColorStop(1,'#000000');
    c.fillStyle=g;c.beginPath();c.arc(x,ry,rr_,0,7);c.fill();});
  // the sentence: inscription capitals, hand-tracked so every browser spaces it the same
  const text=sentence.toUpperCase().replace(/\.$/,''),left=px0+165,right=px0+pw-165,avail=right-left;
  let size=Math.round(ph*.44);const track=()=>size*.16;
  const width=()=>{c.font='600 '+size+'px '+face;let w=0;for(const ch of text)w+=c.measureText(ch).width+track();return w-track();};
  while(width()>avail&&size>40)size-=2;
  c.font='600 '+size+'px '+face;c.fillStyle='#ff0000';c.textBaseline='alphabetic';
  let x=left+(avail-width())/2;const base=H/2+size*.35;
  for(const ch of text){c.fillText(ch,x,base);x+=c.measureText(ch).width+track();}
  return cv;
}

// glass inscriptions (modes 1-4): R = letters, G = hairlines (gold inlay only)
async function buildInscription(sentence,mode){
  if(!mode)return buildPlate(sentence);
  if(mode===7)return buildEtch(sentence);
  if(mode>=5)return buildGBLine(sentence,mode===6);
  const W=2736,H=312,cv=document.createElement('canvas');cv.width=W;cv.height=H;const c=cv.getContext('2d');
  const face='"Cinzel Plate",Georgia,"Times New Roman",serif';
  try{await document.fonts.load('600 100px "Cinzel Plate"');}catch(e){}
  c.fillStyle='#000';c.fillRect(0,0,W,H);c.globalCompositeOperation='lighter';
  const text=sentence.toUpperCase().replace(/\.$/,'');let size=mode===4?100:88;const track=()=>size*.2;
  const width=()=>{c.font='600 '+size+'px '+face;let w=0;for(const ch of text)w+=c.measureText(ch).width+track();return w-track();};
  const avail=W-(mode===2?640:420);while(width()>avail&&size>40)size-=2;
  const tw=width();let x=(W-tw)/2;const base=H/2+size*.35;
  c.font='600 '+size+'px '+face;c.fillStyle='#ff0000';
  for(const ch of text){c.fillText(ch,x,base);x+=c.measureText(ch).width+track();}
  if(mode===2){c.strokeStyle='#00ff00';c.lineWidth=4;const y=H/2;const l0=(W-tw)/2-70,r0=(W+tw)/2+70;
    c.beginPath();c.moveTo(l0-150,y);c.lineTo(l0,y);c.moveTo(r0,y);c.lineTo(r0+150,y);c.stroke();}
  return cv;
}

// Game Boy line: small caps (italic sans or pixel) centred between twin lines that run out to both sides
// R = letters (gold), G = lower line (gold), B = upper line (type colour)
async function buildGBLine(sentence,pixel){
  const W=2736,H=312,cv=document.createElement('canvas');cv.width=W;cv.height=H;const c=cv.getContext('2d');
  const face=pixel?'"Pixelify Plate",ui-monospace,monospace':'"Jost Plate",Futura,"Trebuchet MS",sans-serif';
  const style=pixel?'600 ':'italic 600 ';
  try{await document.fonts.load(style+'80px '+(pixel?'"Pixelify Plate"':'"Jost Plate"'));}catch(e){}
  c.fillStyle='#000';c.fillRect(0,0,W,H);c.globalCompositeOperation='lighter';
  const text=sentence.toUpperCase().replace(/\.$/,'');let size=pixel?78:84;const track=()=>size*(pixel?.10:.12);
  const width=()=>{c.font=style+size+'px '+face;let w=0;for(const ch of text)w+=c.measureText(ch).width+track();return w-track();};
  while(width()>W-900&&size>40)size-=2;
  c.font=style+size+'px '+face;const capH=c.measureText('E').actualBoundingBoxAscent||size*.7;
  const tw=width();let x=(W-tw)/2;const base=H/2+capH/2;
  c.fillStyle='#ff0000';for(const ch of text){c.fillText(ch,x,base);x+=c.measureText(ch).width+track();}
  // twin lines centred on the cap height, broken by the text
  const gap=56,th=5,sep=9,l1=(W-tw)/2-gap,r1=(W+tw)/2+gap,m=70;
  c.fillStyle='#0000ff';c.fillRect(m,H/2-sep-th,l1-m,th);c.fillRect(r1,H/2-sep-th,W-m-r1,th);
  c.fillStyle='#00ff00';c.fillRect(m,H/2+sep,l1-m,th);c.fillRect(r1,H/2+sep,W-m-r1,th);
  return cv;
}

// laser etch on the gold plate: one sentence, modern squared capitals (Chakra Petch), wide tracking, optically centred
async function buildEtch(sentence){
  const W=2736,H=312,cv=document.createElement('canvas');cv.width=W;cv.height=H;const c=cv.getContext('2d');
  const face='"Chakra Plate","Segoe UI",system-ui,sans-serif';
  try{await document.fonts.load('600 80px "Chakra Plate"');}catch(e){}
  c.fillStyle='#000';c.fillRect(0,0,W,H);c.globalCompositeOperation='lighter';
  const text=sentence.toUpperCase().replace(/\.$/,'');let size=78;const track=()=>size*.24;
  const width=()=>{c.font='600 '+size+'px '+face;let w=0;for(const ch of text)w+=c.measureText(ch).width+track();return w-track();};
  while(width()>W-520&&size>40)size-=2;
  c.font='600 '+size+'px '+face;const capH=c.measureText('E').actualBoundingBoxAscent||size*.7;
  let x=(W-width())/2;const base=H/2+capH/2;
  c.fillStyle='#ff0000';for(const ch of text){c.fillText(ch,x,base);x+=c.measureText(ch).width+track();}
  return cv;
}

// armour plate texture covering the lower 30% of the card (frame px x3): R = laser-etched sentence, G = panel lines + vents
const ARMOR_RECT=[0,.70,1,.30];
async function buildArmor(sentence,details){
  const S=3,W=814*S,H=Math.round(1086*.30*S),Y0=1086*.70,cv=document.createElement('canvas');cv.width=W;cv.height=H;const c=cv.getContext('2d');
  const X=x=>x*S,Y=y=>(y-Y0)*S;
  const face='"Chakra Plate","Segoe UI",system-ui,sans-serif';
  try{await document.fonts.load('600 60px "Chakra Plate"');}catch(e){}
  c.fillStyle='#000';c.fillRect(0,0,W,H);c.globalCompositeOperation='lighter';
  // the sentence: centred on the card (the plate is symmetric: status light left, vents right)
  const text=sentence.toUpperCase().replace(/\.$/,'');let size=58;const track=()=>size*.24;
  const width=()=>{c.font='600 '+size+'px '+face;let w=0;for(const ch of text)w+=c.measureText(ch).width+track();return w-track();};
  while(width()>X(560)&&size>30)size-=2;
  c.font='600 '+size+'px '+face;const capH=c.measureText('E').actualBoundingBoxAscent||size*.7;
  let x=X(407)-width()/2;const base=Y(1009.8)+capH/2;
  c.fillStyle='#ff0000';for(const ch of text){c.fillText(ch,x,base);x+=c.measureText(ch).width+track();}
  if(details){
    c.strokeStyle='#00ff00';c.lineWidth=3.6;c.lineJoin='miter';
    // inset panel line round the gold bottom plate, chamfered corners (Gundam cut)
    const l=28.5,r=785.5,t=966,b=1053,k=10;
    c.beginPath();c.moveTo(X(l+k),Y(t));c.lineTo(X(r-k),Y(t));c.lineTo(X(r),Y(t+k));c.lineTo(X(r),Y(b-k));c.lineTo(X(r-k),Y(b));
    c.lineTo(X(l+k),Y(b));c.lineTo(X(l),Y(b-k));c.lineTo(X(l),Y(t+k));c.closePath();c.stroke();
    // a second seam echo on each rail, parallel to the armour cut
    [[15.5,1],[798.5,-1]].forEach(([ox,sg])=>{const len=sg>0?63:36;c.beginPath();
      c.moveTo(X(ox+sg*6),Y(1086*.75-40+6+14));c.lineTo(X(ox+sg*(len-6)),Y(1086*.75-40+len-6+14));c.stroke();});
    // three slanted vents on the right, mirroring the status light on the left
    c.fillStyle='#00ff00';for(let i=-1;i<=1;i++){const cx=766+i*8,cy=1010;c.beginPath();
      c.moveTo(X(cx-1.8+3),Y(cy-8));c.lineTo(X(cx+1.8+3),Y(cy-8));c.lineTo(X(cx+1.8-3),Y(cy+8));c.lineTo(X(cx-1.8-3),Y(cy+8));c.closePath();c.fill();}
  }
  return cv;
}
