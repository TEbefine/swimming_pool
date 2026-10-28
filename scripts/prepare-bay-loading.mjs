// Optional offline tooling; no chroma processing or Sharp ships in the app.
import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
const require=createRequire(import.meta.url);
const sharp=require(process.env.SHARP_MODULE || 'sharp');
const [kai,background,sheet]=process.argv.slice(2);
if(!sheet) throw new Error('Provide approved Kai PNG, bay PNG and yellowtail sheet PNG');
async function key(path,green){
 const {data,info}=await sharp(path).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 for(let i=0;i<data.length;i+=4){const [r,g,b]=data.subarray(i,i+3);const excess=green?g-Math.max(r,b):Math.min(r,b)-g;const k=Math.max(0,Math.min(1,(excess-12)/42));data[i+3]=Math.round(data[i+3]*(1-k));if(green&&k>0)data[i+1]=Math.min(g,Math.max(r,b));}
 return sharp(data,{raw:{width:info.width,height:info.height,channels:4}}).png().toBuffer();
}
const dir=new URL('../public/ui/loading/bay-fishing/',import.meta.url).pathname;
await mkdir(dir,{recursive:true});
await sharp(await key(kai,true)).resize({height:900}).webp({quality:85,alphaQuality:100,effort:6}).toFile(dir+'kai-v1.webp');
await sharp(background).resize({width:1168}).webp({quality:84,effort:6}).toFile(dir+'bay-v1.webp');
const clean=await key(sheet,false),frames=[];
for(let i=0;i<4;i++) frames.push({input:await sharp(clean).extract({left:i*384+80,top:60,width:224,height:540}).resize(112,270,{kernel:'nearest'}).png().toBuffer(),left:i*112,top:0});
await sharp({create:{width:448,height:270,channels:4,background:'#00000000'}}).composite(frames).webp({lossless:true,effort:6}).toFile(dir+'yellowtail-v1.webp');
