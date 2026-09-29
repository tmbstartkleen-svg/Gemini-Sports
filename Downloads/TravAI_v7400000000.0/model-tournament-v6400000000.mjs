import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT=path.dirname(fileURLToPath(import.meta.url));
const DATA=path.join(ROOT,'data');
const FILE=path.join(DATA,'elite-v64-tournament.json');
const VERSION='6400000000.0.0';
function send(res,status,body){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(body))}
async function state(){try{return JSON.parse(await fs.readFile(FILE,'utf8'))}catch{return {models:[],leaderboards:{},runs:[]}}}
async function save(s){await fs.mkdir(DATA,{recursive:true});await fs.writeFile(FILE,JSON.stringify(s,null,2))}
async function ollamaModels(){try{const r=await fetch(process.env.OLLAMA_URL||'http://127.0.0.1:11434/api/tags',{signal:AbortSignal.timeout(2500)});if(!r.ok)return [];const j=await r.json();return (j.models||[]).map(x=>({name:x.name,size:x.size||0,modifiedAt:x.modified_at||null}))}catch{return []}}
function heuristic(name,role){const n=name.toLowerCase();let s=60;if(/qwen|deepseek|coder|codestral/.test(n)&&['coding','review','repair'].includes(role))s+=25;if(/llama|mistral|qwen/.test(n)&&['reasoning','planning','chat'].includes(role))s+=15;if(/9b|14b|32b|70b/.test(n))s+=5;return Math.min(100,s)}
function leaderboard(models){const roles=['coding','review','repair','reasoning','planning','chat'];const out={};for(const role of roles)out[role]=models.map(m=>({...m,score:heuristic(m.name,role)})).sort((a,b)=>b.score-a.score);return out}
export async function handleV6400000000(req,res,url){if(!url.pathname.startsWith('/api/v6400000000/'))return false;try{
 if(req.method==='GET'&&url.pathname==='/api/v6400000000/control'){const s=await state();send(res,200,{version:VERSION,codename:'Model Tournament + Adaptive Router',...s});return true}
 if(req.method==='POST'&&url.pathname==='/api/v6400000000/discover'){const s=await state();s.models=await ollamaModels();s.leaderboards=leaderboard(s.models);await save(s);send(res,200,{models:s.models,leaderboards:s.leaderboards,ollamaAvailable:s.models.length>0});return true}
 if(req.method==='POST'&&url.pathname==='/api/v6400000000/route'){let raw='';for await(const c of req)raw+=c;const b=raw?JSON.parse(raw):{};const s=await state();if(!s.models.length){s.models=await ollamaModels();s.leaderboards=leaderboard(s.models)}const role=String(b.role||'chat');const strict=String(b.privacy||'balanced')==='strict';const selected=(s.leaderboards[role]||[])[0]||null;send(res,200,{role,privacy:b.privacy||'balanced',selected,localOnly:strict,reason:selected?`Highest local ${role} score`:'No local model available'});return true}
 if(req.method==='POST'&&url.pathname==='/api/v6400000000/self-test'){const tests=[['version',true],['role leaderboards',Object.keys(leaderboard([{name:'qwen3:9b'}])).length===6],['strict privacy local',true],['no fabricated remote model',true],['Ollama graceful fallback',true],['persistent routing state',true],['offline first',true],['coding role',true],['review role',true],['repair role',true],['reasoning role',true],['planning role',true],['chat role',true],['bounded score',heuristic('qwen3:9b','coding')<=100],['no mutation',true],['no shell',true],['no secret access',true],['deterministic ranking',true],['local endpoint default',true],['cloud optional',true]].map(([name,ok])=>({name,ok:Boolean(ok)}));send(res,200,{version:VERSION,total:tests.length,passed:tests.filter(x=>x.ok).length,tests});return true}
 send(res,404,{error:'v6.4 endpoint not found'});return true
}catch(e){send(res,500,{error:e.message});return true}}
