// Optional offline tool: npm install --prefix /tmp/loading-art sharp
// SHARP_MODULE=/tmp/loading-art/node_modules/sharp/dist/index.cjs node scripts/prepare-cafe-reading.mjs <source-folder>
const { default: sharp } = await import(process.env.SHARP_MODULE || 'sharp');
import { readdir, mkdir, writeFile } from 'node:fs/promises';
const input=(process.argv[2] || '') + '/';
if (!process.argv[2]) throw new Error('Provide the folder containing the five supplied source images.');
const output=new URL('../public/ui/loading/cafe-reading/', import.meta.url).pathname;
const files=await readdir(input);
const find=p=>{ const name=files.find(n=>n.startsWith(p)); if(!name) throw new Error('Missing source: '+p); return input+name; };
await mkdir(output,{recursive:true});
// Offline asset preparation only: preserve supplied RGB pixels, extract chroma matte.
async function key(path,kind) {
 const {data,info}=await sharp(path).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 for(let i=0;i<data.length;i+=4){
  const [r,g,b]=data.subarray(i,i+3);
  const excess=kind==='green'?g-Math.max(r,b):Math.min(r,b)-g;
  const strength=Math.max(0,Math.min(1,(excess-12)/42));
  data[i+3]=Math.round(data[i+3]*(1-strength));
  if(kind==='green' && strength>0) data[i+1]=Math.min(g,Math.max(r,b));
 }
 return sharp(data,{raw:{width:info.width,height:info.height,channels:4}}).png().toBuffer();
}
const assets=[];
async function save(name,pipeline){const data=await pipeline.webp({quality:83,alphaQuality:100,effort:6}).toBuffer();await writeFile(output+name,data);assets.push([name,data.length]);}
await save('sun-v1.webp',sharp(await key(find('Man reading'),'green')).resize({height:900}));
await save('cafe-v1.webp',sharp(await key(find('teerat_thongbai_high-detail_32-bit_pixel_art_cozy'),'magenta')).resize({width:1168}));
await save('garden-v1.webp',sharp(find('teerat_thongbai_high-detail_32-bit_pixel_art_view')).resize({height:768}));
await save('leaves-v1.webp',sharp(await key(find('teerat_thongbai_pixel_art_a_few'),'magenta')).resize({height:640}));
const sheet=await key(find('Cozy pixel'),'magenta');
for(const [name,row,count] of [['steam',0,4],['spark',1,2],['bird',2,4],['leaf',3,2]]){
 const cells=[];
 for(let col=0;col<count;col++){
  const left=Math.round(col*1254/4), top=Math.round(row*1254/4);
  cells.push({input:await sharp(sheet).extract({left,top,width:Math.round((col+1)*1254/4)-left,height:Math.round((row+1)*1254/4)-top}).resize(64,64,{kernel:'nearest'}).png().toBuffer(),left:col*64,top:0});
 }
 await save(name+'-v1.webp',sharp({create:{width:count*64,height:64,channels:4,background:'#00000000'}}).composite(cells));
}
console.log(JSON.stringify({assets,total:assets.reduce((s,a)=>s+a[1],0)}));
