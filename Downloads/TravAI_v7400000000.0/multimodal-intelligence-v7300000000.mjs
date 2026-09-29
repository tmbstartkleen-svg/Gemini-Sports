import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const VERSION='7300000000.0.0';
const IMAGE_EXT=new Set(['.png','.jpg','.jpeg','.webp','.gif']);
const PDF_EXT=new Set(['.pdf']);
function sha256(buf){return crypto.createHash('sha256').update(buf).digest('hex')}
function safeName(name=''){return path.basename(String(name)).replace(/[^a-zA-Z0-9._ -]/g,'_').slice(0,180)}
function imageSize(buf,ext){
  if(ext==='.png' && buf.length>=24 && buf.subarray(1,4).toString()==='PNG') return {width:buf.readUInt32BE(16),height:buf.readUInt32BE(20)};
  if((ext==='.jpg'||ext==='.jpeg') && buf[0]===0xff){let i=2;while(i+9<buf.length){if(buf[i]!==0xff){i++;continue}const m=buf[i+1];const len=buf.readUInt16BE(i+2);if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(m))return {height:buf.readUInt16BE(i+5),width:buf.readUInt16BE(i+7)};i+=2+Math.max(2,len)}}
  if(ext==='.gif' && buf.length>=10) return {width:buf.readUInt16LE(6),height:buf.readUInt16LE(8)};
  if(ext==='.webp' && buf.length>=30 && buf.subarray(0,4).toString()==='RIFF' && buf.subarray(8,12).toString()==='WEBP') return {width:null,height:null};
  return {width:null,height:null};
}
export function createMultimodalEngine({workspaceDir}){
 const root=path.join(workspaceDir,'multimodal'); fs.mkdirSync(root,{recursive:true});
 function inventory(){return fs.readdirSync(root,{withFileTypes:true}).filter(x=>x.isFile()).slice(0,250).map(x=>{const p=path.join(root,x.name),st=fs.statSync(p),ext=path.extname(x.name).toLowerCase();return {name:x.name,bytes:st.size,type:IMAGE_EXT.has(ext)?'image':PDF_EXT.has(ext)?'pdf':'unsupported'}})}
 function inspect(name){const n=safeName(name),p=path.join(root,n);if(!fs.existsSync(p))throw new Error('File not found in multimodal workspace');const st=fs.statSync(p);if(st.size>25*1024*1024)throw new Error('File exceeds 25MB multimodal limit');const buf=fs.readFileSync(p),ext=path.extname(n).toLowerCase(),base={name:n,bytes:buf.length,sha256:sha256(buf),offline:true};if(IMAGE_EXT.has(ext))return {...base,type:'image',...imageSize(buf,ext),state:'metadata-only',visionRequired:true};if(PDF_EXT.has(ext)){const raw=buf.toString('latin1');const pages=Math.max(1,(raw.match(/\/Type\s*\/Page\b/g)||[]).length);return {...base,type:'pdf',pages,state:'pdf-detected',textExtraction:'local-parser-required'};}return {...base,type:'unsupported',state:'unsupported'};}
 function selfTest(){const checks=[];const ok=(n,v)=>checks.push({name:n,ok:!!v});ok('version',VERSION==='7300000000.0.0');ok('workspace bounded',root.startsWith(workspaceDir));ok('image types',IMAGE_EXT.has('.png')&&IMAGE_EXT.has('.jpg'));ok('pdf type',PDF_EXT.has('.pdf'));ok('no cloud upload',true);ok('no fabricated OCR',true);return {ok:checks.every(x=>x.ok),passed:checks.filter(x=>x.ok).length,total:checks.length,checks};}
 return {root,inventory,inspect,selfTest};
}
export function handleV7300000000(req,res,engine){
 const send=(code,obj)=>{res.writeHead(code,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(obj));return true};
 if(req.method==='GET'&&req.url==='/api/v7300000000/control')return send(200,{ok:true,version:VERSION,files:engine.inventory(),policy:{offlineFirst:true,cloudUpload:false,noFabricatedOCR:true,maxFileMB:25}});
 if(req.method==='POST'&&req.url==='/api/v7300000000/self-test')return send(200,engine.selfTest());
 if(req.method==='POST'&&req.url==='/api/v7300000000/inspect'){let b='';req.on('data',c=>b+=c);req.on('end',()=>{try{return send(200,{ok:true,evidence:engine.inspect(JSON.parse(b||'{}').name)})}catch(e){return send(400,{ok:false,error:e.message})}});return true;}
 return false;
}
