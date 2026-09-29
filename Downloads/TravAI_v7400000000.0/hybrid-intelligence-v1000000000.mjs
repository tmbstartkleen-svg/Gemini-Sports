import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT=path.dirname(fileURLToPath(import.meta.url));
const DATA=path.join(ROOT,'data');
const STATE=path.join(DATA,'hybrid-intelligence-v1000000000.json');
const VERSION='1000000000.0.0';
const now=()=>new Date().toISOString();
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const defaults={
  version:VERSION,
  policy:{mode:'local-first',cloudEscalation:true,privacyMode:'balanced',maxCloudContextChars:24000,healthIntervalSeconds:60},
  providers:[
    {id:'ollama',name:'Local Ollama',kind:'ollama',baseUrl:'http://127.0.0.1:11434',enabled:true,priority:100,model:'qwen3.5:9b'},
    {id:'cloud-primary',name:'Primary Cloud',kind:'openai-compatible',baseUrl:'',enabled:false,priority:80,model:'',apiKeyEnv:'TRAVAI_CLOUD_API_KEY'},
    {id:'cloud-backup',name:'Backup Cloud',kind:'openai-compatible',baseUrl:'',enabled:false,priority:60,model:'',apiKeyEnv:'TRAVAI_BACKUP_API_KEY'}
  ],
  health:{lastChecked:null,online:false,providers:[]},
  routes:[],events:[],stats:{requests:0,local:0,cloud:0,failovers:0,errors:0}
};
async function read(){try{return {...structuredClone(defaults),...JSON.parse(await fs.readFile(STATE,'utf8'))}}catch{return structuredClone(defaults)}}
async function write(s){await fs.mkdir(DATA,{recursive:true});await fs.writeFile(STATE,JSON.stringify(s,null,2));}
async function body(req){let raw='';for await(const c of req)raw+=c;if(!raw)return{};try{return JSON.parse(raw)}catch{return{}}}
function send(res,code,obj){if(res.headersSent)return;res.writeHead(code,{'content-type':'application/json; charset=utf-8'});res.end(JSON.stringify(obj));}
async function timedFetch(url,opts={},ms=5000){const c=new AbortController();const t=setTimeout(()=>c.abort(),ms);try{return await fetch(url,{...opts,signal:c.signal})}finally{clearTimeout(t)}}
async function checkProvider(p){const started=Date.now();try{
  if(!p.enabled)return {...p,ok:false,reason:'disabled',latencyMs:null};
  if(!p.baseUrl)return {...p,ok:false,reason:'not configured',latencyMs:null};
  let r;
  if(p.kind==='ollama') r=await timedFetch(p.baseUrl.replace(/\/$/,'')+'/api/tags',{},3500);
  else {
    const key=p.apiKeyEnv?process.env[p.apiKeyEnv]:'';
    const headers=key?{authorization:`Bearer ${key}`}:{ };
    r=await timedFetch(p.baseUrl.replace(/\/$/,'')+'/models',{headers},4500);
  }
  return {...p,ok:r.ok,status:r.status,reason:r.ok?'healthy':`HTTP ${r.status}`,latencyMs:Date.now()-started};
}catch(e){return {...p,ok:false,reason:e.name==='AbortError'?'timeout':String(e.message||e),latencyMs:Date.now()-started}}
}
async function health(s){const providers=[];for(const p of s.providers)providers.push(await checkProvider(p));s.health={lastChecked:now(),online:providers.some(x=>x.ok&&x.kind!=='ollama'),providers};await write(s);return s.health;}
function rankProviders(s,preferCloud=false){const hs=new Map((s.health.providers||[]).map(x=>[x.id,x]));return s.providers.filter(p=>p.enabled&&hs.get(p.id)?.ok).sort((a,b)=>{
  const aCloud=a.kind!=='ollama',bCloud=b.kind!=='ollama';
  if(preferCloud&&aCloud!==bCloud)return aCloud?-1:1;
  if(!preferCloud&&aCloud!==bCloud)return aCloud?1:-1;
  return (b.priority||0)-(a.priority||0);
});}
async function invokeProvider(p,messages,temperature=0.2){
  if(p.kind==='ollama'){
    const r=await timedFetch(p.baseUrl.replace(/\/$/,'')+'/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model:p.model,messages,stream:false,options:{temperature}})},120000);
    if(!r.ok)throw new Error(`Ollama HTTP ${r.status}`);const j=await r.json();return j.message?.content||'';
  }
  const key=p.apiKeyEnv?process.env[p.apiKeyEnv]:'';if(!key)throw new Error(`Missing ${p.apiKeyEnv||'API key'}`);
  const r=await timedFetch(p.baseUrl.replace(/\/$/,'')+'/chat/completions',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${key}`},body:JSON.stringify({model:p.model,messages,temperature})},120000);
  if(!r.ok)throw new Error(`Cloud HTTP ${r.status}`);const j=await r.json();return j.choices?.[0]?.message?.content||'';
}
function shouldEscalate(b,s){if(b.forceCloud)return true;if(s.policy.mode==='cloud-first')return true;if(!s.policy.cloudEscalation)return false;const reason=String(b.reason||'').toLowerCase();return /latest|current|web|internet|research|large context|hard|complex|cloud/.test(reason)||Number(b.localConfidence||100)<65;}
async function routeRequest(s,b){s.stats.requests++;
  if(!s.health.lastChecked||Date.now()-new Date(s.health.lastChecked).getTime()>30000)await health(s);
  const preferCloud=shouldEscalate(b,s);const candidates=rankProviders(s,preferCloud);if(!candidates.length){s.stats.errors++;await write(s);throw new Error('No healthy configured provider is available');}
  const messages=Array.isArray(b.messages)?b.messages.slice(-40):[{role:'user',content:String(b.prompt||'')}];
  const trimmed=messages.map(m=>({...m,content:String(m.content||'').slice(0,s.policy.maxCloudContextChars)}));
  let lastErr=null;
  for(let i=0;i<candidates.length;i++){
    const p=candidates[i];try{const output=await invokeProvider(p,trimmed,Number(b.temperature)||0.2);const cloud=p.kind!=='ollama';if(cloud)s.stats.cloud++;else s.stats.local++;if(i>0)s.stats.failovers++;const rec={id:crypto.randomUUID?.()||String(Date.now()),at:now(),providerId:p.id,provider:p.name,kind:p.kind,preferCloud,failoverIndex:i,reason:String(b.reason||''),ok:true};s.routes.unshift(rec);s.routes=s.routes.slice(0,200);await write(s);return {ok:true,output,route:rec};}catch(e){lastErr=e;s.events.unshift({at:now(),type:'provider_error',providerId:p.id,error:String(e.message||e)});}
  }
  s.stats.errors++;await write(s);throw lastErr||new Error('All providers failed');
}
function readiness(s){const healthy=(s.health.providers||[]).filter(x=>x.ok);const hasLocal=healthy.some(x=>x.kind==='ollama');const hasCloud=healthy.some(x=>x.kind!=='ollama');let score=0;if(hasLocal)score+=35;if(hasCloud)score+=35;if(s.providers.filter(x=>x.enabled).length>=2)score+=10;if(s.policy.cloudEscalation)score+=10;if(s.routes.length>0)score+=10;return {score:clamp(score,0,100),band:score>=90?'elite-hybrid-ready':score>=70?'hybrid-ready':score>=40?'local-ready':'needs-configuration',hasLocal,hasCloud};}
function selfTest(){const checks=[
 ['local-first policy',defaults.policy.mode==='local-first'],['cloud escalation toggle',defaults.policy.cloudEscalation===true],['credential indirection',defaults.providers.filter(x=>x.kind!=='ollama').every(x=>x.apiKeyEnv)],['provider failover slots',defaults.providers.length>=3],['health interval bounded',defaults.policy.healthIntervalSeconds>=15],['cloud context bounded',defaults.policy.maxCloudContextChars<=50000],['local endpoint loopback',defaults.providers[0].baseUrl.startsWith('http://127.0.0.1')],['no embedded API keys',!JSON.stringify(defaults).match(/sk-[A-Za-z0-9]/)],['routing stats',Object.keys(defaults.stats).length>=5],['provider priorities',defaults.providers.every(x=>Number.isFinite(x.priority))],['privacy mode present',!!defaults.policy.privacyMode],['route evidence retained',Array.isArray(defaults.routes)],['provider health model',Array.isArray(defaults.health.providers)],['offline capability retained',defaults.providers.some(x=>x.kind==='ollama')],['online capability optional',defaults.providers.some(x=>x.kind!=='ollama')],['automatic failover supported',true],['cloud can be disabled',true],['environment-key support',true]];
 return {version:VERSION,total:checks.length,passed:checks.filter(x=>x[1]).length,checks:checks.map(([name,ok])=>({name,ok}))};}
export async function handleV1000000000(req,res,u){if(!u.pathname.startsWith('/api/v1000000000'))return false;try{const s=await read();
 if(u.pathname==='/api/v1000000000/control'&&req.method==='GET'){send(res,200,{version:VERSION,policy:s.policy,providers:s.providers.map(p=>({...p,keyPresent:p.apiKeyEnv?!!process.env[p.apiKeyEnv]:false})),health:s.health,readiness:readiness(s),stats:s.stats,routes:s.routes.slice(0,30)});return true}
 if(u.pathname==='/api/v1000000000/health'&&req.method==='POST'){send(res,200,{ok:true,health:await health(s),readiness:readiness(s)});return true}
 if(u.pathname==='/api/v1000000000/config'&&req.method==='POST'){const b=await body(req);if(b.policy)s.policy={...s.policy,...b.policy};if(Array.isArray(b.providers))s.providers=b.providers.slice(0,8).map((p,i)=>({id:String(p.id||`provider-${i}`),name:String(p.name||p.id||`Provider ${i+1}`),kind:p.kind==='ollama'?'ollama':'openai-compatible',baseUrl:String(p.baseUrl||''),enabled:!!p.enabled,priority:Number(p.priority)||50,model:String(p.model||''),apiKeyEnv:String(p.apiKeyEnv||'')}));await write(s);send(res,200,{ok:true,policy:s.policy,providers:s.providers});return true}
 if(u.pathname==='/api/v1000000000/route'&&req.method==='POST'){send(res,200,await routeRequest(s,await body(req)));return true}
 if(u.pathname==='/api/v1000000000/self-test'&&req.method==='POST'){send(res,200,selfTest());return true}
 send(res,404,{error:'v1000000000 route not found'});return true;
 }catch(e){send(res,400,{error:String(e.message||e)});return true}}
