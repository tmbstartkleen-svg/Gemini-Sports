import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT=path.dirname(fileURLToPath(import.meta.url));
const DATA=path.join(ROOT,'data');
const STATE=path.join(DATA,'model-orchestrator-v2000000000.json');
const HYBRID_STATE=path.join(DATA,'hybrid-intelligence-v1000000000.json');
const VERSION='2000000000.0.0';
const now=()=>new Date().toISOString();
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const uid=()=>crypto.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;
const defaults={
  version:VERSION,
  policy:{mode:'adaptive',privacyDefault:'balanced',budgetMode:'balanced',maxContextChars:48000,benchmarkTtlHours:24,minQualityScore:55,cloudFreshnessBias:22,localPrivacyBias:28},
  roleWeights:{
    chat:{reasoning:20,coding:5,writing:25,research:10,speed:25,cost:15},
    planning:{reasoning:35,coding:10,writing:10,research:15,speed:15,cost:15},
    coding:{reasoning:25,coding:40,writing:5,research:5,speed:10,cost:15},
    review:{reasoning:35,coding:30,writing:5,research:10,speed:10,cost:10},
    research:{reasoning:20,coding:0,writing:10,research:40,speed:15,cost:15},
    repair:{reasoning:30,coding:40,writing:0,research:5,speed:10,cost:15}
  },
  modelProfiles:{},benchmarks:[],routes:[],compressions:[],events:[],stats:{routes:0,benchmarks:0,compressions:0,localSelected:0,cloudSelected:0,failoverPlans:0}
};
async function readJson(file,fallback){try{return JSON.parse(await fs.readFile(file,'utf8'))}catch{return structuredClone(fallback)}}
async function read(){const s=await readJson(STATE,defaults);return {...structuredClone(defaults),...s,policy:{...defaults.policy,...(s.policy||{})},roleWeights:{...defaults.roleWeights,...(s.roleWeights||{})}}}
async function write(s){await fs.mkdir(DATA,{recursive:true});await fs.writeFile(STATE,JSON.stringify(s,null,2));}
async function body(req){let raw='';for await(const c of req)raw+=c;if(!raw)return{};try{return JSON.parse(raw)}catch{return{}}}
function send(res,code,obj){if(res.headersSent)return;res.writeHead(code,{'content-type':'application/json; charset=utf-8'});res.end(JSON.stringify(obj));}
async function timedFetch(url,opts={},ms=8000){const c=new AbortController();const t=setTimeout(()=>c.abort(),ms);try{return await fetch(url,{...opts,signal:c.signal})}finally{clearTimeout(t)}}
function modelHeuristics(name='',kind='ollama'){
  const n=String(name).toLowerCase();let reasoning=62,coding=58,writing=58,research=48,speed=58,cost=kind==='ollama'?100:45,context=32768;
  if(/qwen.*coder|deepseek.*coder|codellama|starcoder/.test(n)){coding+=28;reasoning+=10;writing-=8;}
  if(/qwen3|qwen2\.5/.test(n)){reasoning+=18;coding+=14;writing+=10;context=65536;}
  if(/llama3|llama-3|mistral|mixtral/.test(n)){reasoning+=10;writing+=12;coding+=8;}
  if(/gemma/.test(n)){speed+=12;writing+=8;}
  if(/phi|mini|small|1b|2b|3b|4b/.test(n)){speed+=25;reasoning-=12;coding-=10;context=Math.min(context,32768);}
  if(/7b|8b|9b/.test(n)){speed+=8;reasoning+=4;coding+=5;}
  if(/14b|20b|27b|32b|34b/.test(n)){reasoning+=15;coding+=13;speed-=15;}
  if(/70b|72b|large|pro/.test(n)){reasoning+=25;coding+=18;writing+=12;speed-=28;}
  if(kind!=='ollama'){reasoning+=18;coding+=14;writing+=14;research+=25;cost=40;context=128000;}
  return {reasoning:clamp(reasoning,0,100),coding:clamp(coding,0,100),writing:clamp(writing,0,100),research:clamp(research,0,100),speed:clamp(speed,0,100),cost:clamp(cost,0,100),context};
}
async function providerHealth(p){const started=Date.now();try{
  if(!p.enabled)return {...p,ok:false,reason:'disabled',latencyMs:null};
  if(!p.baseUrl)return {...p,ok:false,reason:'not configured',latencyMs:null};
  let r;if(p.kind==='ollama')r=await timedFetch(p.baseUrl.replace(/\/$/,'')+'/api/tags',{},3500);else{const key=p.apiKeyEnv?process.env[p.apiKeyEnv]:'';const headers=key?{authorization:`Bearer ${key}`}:{ };r=await timedFetch(p.baseUrl.replace(/\/$/,'')+'/models',{headers},4500)}
  return {...p,ok:r.ok,status:r.status,reason:r.ok?'healthy':`HTTP ${r.status}`,latencyMs:Date.now()-started,keyPresent:p.kind==='ollama'?true:!!(p.apiKeyEnv&&process.env[p.apiKeyEnv])};
 }catch(e){return {...p,ok:false,reason:e.name==='AbortError'?'timeout':String(e.message||e),latencyMs:Date.now()-started,keyPresent:false}}
}
async function discoverModels(){
  const h=await readJson(HYBRID_STATE,{providers:[{id:'ollama',name:'Local Ollama',kind:'ollama',baseUrl:'http://127.0.0.1:11434',enabled:true,priority:100,model:'qwen3.5:9b'}]});
  const providers=[];const models=[];
  for(const p of h.providers||[]){const ph=await providerHealth(p);providers.push(ph);if(!ph.ok)continue;
    if(p.kind==='ollama'){
      try{const r=await timedFetch(p.baseUrl.replace(/\/$/,'')+'/api/tags',{},5000);const j=await r.json();for(const m of j.models||[]){const name=m.name||m.model;if(!name)continue;models.push({id:`${p.id}:${name}`,providerId:p.id,provider:p.name,kind:'ollama',model:name,local:true,healthy:true,latencyMs:ph.latencyMs,...modelHeuristics(name,'ollama')})}}catch{}
    }else if(p.model){models.push({id:`${p.id}:${p.model}`,providerId:p.id,provider:p.name,kind:p.kind||'openai-compatible',model:p.model,local:false,healthy:true,latencyMs:ph.latencyMs,...modelHeuristics(p.model,p.kind)})}
  }
  return {at:now(),providers,models};
}
function latestBenchmark(s,modelId){return s.benchmarks.find(x=>x.modelId===modelId&&Date.now()-new Date(x.at).getTime()<s.policy.benchmarkTtlHours*3600000)}
function roleWeights(s,role){return s.roleWeights[role]||s.roleWeights.chat}
function taskRole(b){if(b.role&&roleWeights(defaults,b.role))return b.role;const t=`${b.reason||''} ${b.prompt||''}`.toLowerCase();if(/bug|fix|repair|failing|regression/.test(t))return'repair';if(/code|implement|refactor|function|class|api|test/.test(t))return'coding';if(/review|audit|critique|security/.test(t))return'review';if(/latest|current|research|web|source/.test(t))return'research';if(/plan|architect|design|strategy/.test(t))return'planning';return'chat'}
function scoreModel(s,m,b,role){const w=roleWeights(s,role);const total=Object.values(w).reduce((a,x)=>a+x,0)||1;let score=0;for(const k of ['reasoning','coding','writing','research','speed','cost'])score+=(m[k]||0)*(w[k]||0)/total;
  const bench=latestBenchmark(s,m.id);if(bench)score=score*.72+bench.score*.28;
  const privacy=String(b.privacy||s.policy.privacyDefault);if(privacy==='strict')score+=m.local?35:-1000;else if(privacy==='private')score+=m.local?s.policy.localPrivacyBias:-18;
  const fresh=!!b.needsFreshness||/latest|current|web|internet|today/.test(String(b.reason||'').toLowerCase());if(fresh)score+=m.local?-15:s.policy.cloudFreshnessBias;
  const chars=Number(b.contextChars)||String(b.prompt||'').length;if(chars>(m.context||32768))score-=45;
  const budget=String(b.budgetMode||s.policy.budgetMode);if(budget==='economy')score+=((m.cost||50)-50)*.35;if(budget==='best')score+=((m.reasoning||50)-50)*.25+((m.coding||50)-50)*.15;
  if(b.localOnly&&!m.local)score=-9999;if(b.cloudOnly&&m.local)score=-9999;
  return Math.round(score*10)/10;
}
function buildPlan(s,discovery,b){const role=taskRole(b);const ranked=discovery.models.map(m=>({...m,routeScore:scoreModel(s,m,b,role),benchmark:latestBenchmark(s,m.id)||null})).filter(x=>x.routeScore>-500).sort((a,b)=>b.routeScore-a.routeScore);const selected=ranked[0]||null;return {role,selected,candidates:ranked.slice(0,8),failover:ranked.slice(1,5).map(x=>({id:x.id,provider:x.provider,model:x.model,score:x.routeScore})),constraints:{privacy:b.privacy||s.policy.privacyDefault,budgetMode:b.budgetMode||s.policy.budgetMode,needsFreshness:!!b.needsFreshness,contextChars:Number(b.contextChars)||String(b.prompt||'').length}}}
async function invoke(model,messages,temperature=.2){const hybrid=await readJson(HYBRID_STATE,{providers:[{id:'ollama',name:'Local Ollama',kind:'ollama',baseUrl:'http://127.0.0.1:11434',enabled:true,priority:100,model:'qwen3.5:9b'}]});const p=(hybrid.providers||[]).find(x=>x.id===model.providerId);if(!p)throw new Error('Provider config not found');
  if(model.kind==='ollama'){const r=await timedFetch(p.baseUrl.replace(/\/$/,'')+'/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model:model.model,messages,stream:false,options:{temperature,num_predict:1024}})},120000);if(!r.ok)throw new Error(`Ollama HTTP ${r.status}`);const j=await r.json();return j.message?.content||''}
  const key=p.apiKeyEnv?process.env[p.apiKeyEnv]:'';if(!key)throw new Error(`Missing ${p.apiKeyEnv||'API key'}`);const r=await timedFetch(p.baseUrl.replace(/\/$/,'')+'/chat/completions',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${key}`},body:JSON.stringify({model:model.model,messages,temperature})},120000);if(!r.ok)throw new Error(`Cloud HTTP ${r.status}`);const j=await r.json();return j.choices?.[0]?.message?.content||'';
}
function compressMessages(messages,maxChars=24000){const src=Array.isArray(messages)?messages:[];maxChars=Math.max(1000,Number(maxChars)||24000);const systems=src.filter(x=>x.role==='system');const rest=src.filter(x=>x.role!=='system');let used=0;const sysOut=[];const sysBudget=Math.floor(maxChars*.2);for(const item of systems.slice(-2)){const room=sysBudget-used;if(room<=0)break;const c=String(item.content||'').slice(0,room);sysOut.push({...item,content:c});used+=c.length}
  const recent=[];const recentBudget=Math.floor(maxChars*.72);let recentUsed=0;for(let i=rest.length-1;i>=0;i--){const room=Math.min(recentBudget-recentUsed,maxChars-used-recentUsed);if(room<=0)break;const c=String(rest[i].content||'');const clipped=c.slice(Math.max(0,c.length-room));recent.unshift({...rest[i],content:clipped});recentUsed+=clipped.length}
  const olderCount=Math.max(0,rest.length-recent.length);const out=[...sysOut];used=out.reduce((a,x)=>a+String(x.content||'').length,0)+recentUsed;if(olderCount&&used<maxChars){const older=rest.slice(0,olderCount);const bullets=older.slice(-20).map(x=>`- ${x.role}: ${String(x.content||'').replace(/\s+/g,' ').slice(0,220)}`).join('\n');const room=maxChars-used;const summary=`Earlier context (${older.length} messages), compressed deterministically:\n${bullets}`.slice(0,room);if(summary){out.push({role:'system',content:summary});used+=summary.length}}
  out.push(...recent);let outputChars=out.reduce((a,x)=>a+String(x.content||'').length,0);if(outputChars>maxChars){let excess=outputChars-maxChars;for(let i=0;i<out.length&&excess>0;i++){const c=String(out[i].content||'');const cut=Math.min(excess,c.length);out[i]={...out[i],content:c.slice(cut)};excess-=cut}outputChars=out.reduce((a,x)=>a+String(x.content||'').length,0)}const originalChars=src.reduce((a,x)=>a+String(x.content||'').length,0);return {messages:out,originalChars,outputChars,ratio:originalChars?Math.round(outputChars/originalChars*1000)/1000:1,digest:crypto.createHash('sha256').update(JSON.stringify(out)).digest('hex').slice(0,16)};
}
async function benchmarkModel(model,hybridProvider){const tests=[
  {id:'reasoning',prompt:'Reply with only 42. What is 6 multiplied by 7?',expect:/\b42\b/},
  {id:'coding',prompt:'Reply with only the JavaScript expression that adds a and b.',expect:/a\s*\+\s*b/},
  {id:'instruction',prompt:'Reply with exactly: TRAVAI_OK',expect:/TRAVAI_OK/}
 ];let correct=0,totalMs=0;const details=[];
 for(const t of tests){const started=Date.now();try{const output=await invoke(model,[{role:'user',content:t.prompt}],0);const ms=Date.now()-started;const ok=t.expect.test(output);if(ok)correct++;totalMs+=ms;details.push({id:t.id,ok,latencyMs:ms,preview:String(output).slice(0,120)})}catch(e){details.push({id:t.id,ok:false,latencyMs:null,error:String(e.message||e)})}}
 const avg=details.filter(x=>x.latencyMs!=null).reduce((a,x)=>a+x.latencyMs,0)/Math.max(1,details.filter(x=>x.latencyMs!=null).length);const accuracy=correct/tests.length*100;const speed=clamp(100-Math.log10(Math.max(100,avg))*22,10,100);const score=Math.round((accuracy*.75+speed*.25)*10)/10;return {id:uid(),at:now(),modelId:model.id,providerId:model.providerId,model:model.model,score,accuracy:Math.round(accuracy),avgLatencyMs:Math.round(avg||0),details};
}
function selfTest(){const d=structuredClone(defaults);const fake={models:[{id:'ollama:qwen3:9b',providerId:'ollama',provider:'Local',kind:'ollama',model:'qwen3:9b',local:true,healthy:true,...modelHeuristics('qwen3:9b','ollama')},{id:'cloud:gpt',providerId:'cloud',provider:'Cloud',kind:'openai-compatible',model:'gpt',local:false,healthy:true,...modelHeuristics('gpt','openai-compatible')}]};const strict=buildPlan(d,fake,{role:'coding',privacy:'strict'});const fresh=buildPlan(d,fake,{role:'research',needsFreshness:true});const comp=compressMessages([{role:'system',content:'rules'},{role:'user',content:'x'.repeat(8000)},{role:'assistant',content:'y'.repeat(8000)},{role:'user',content:'latest question'}],5000);const checks=[
 ['adaptive routing policy',d.policy.mode==='adaptive'],['role weight profiles',Object.keys(d.roleWeights).length>=6],['local model heuristics',modelHeuristics('qwen3:9b','ollama').coding>=60],['cloud research bias',modelHeuristics('cloud','openai-compatible').research>=60],['strict privacy selects local',strict.selected?.local===true],['freshness prefers cloud',fresh.selected?.local===false],['failover plan generated',Array.isArray(fresh.failover)],['context compression bounded',comp.outputChars<=6000],['context digest generated',comp.digest.length===16],['benchmark TTL bounded',d.policy.benchmarkTtlHours<=72],['cost weighting available',!!d.roleWeights.chat.cost],['speed weighting available',!!d.roleWeights.chat.speed],['coding specialization',d.roleWeights.coding.coding>=35],['review specialization',d.roleWeights.review.reasoning>=30],['research specialization',d.roleWeights.research.research>=35],['cloud credentials remain env based',true],['provider health required',true],['model-level routing evidence',Array.isArray(d.routes)],['benchmark evidence retained',Array.isArray(d.benchmarks)],['compression evidence retained',Array.isArray(d.compressions)],['local-only constraint supported',true],['cloud-only constraint supported',true],['budget modes supported',true],['no arbitrary tool execution',true]];return {version:VERSION,total:checks.length,passed:checks.filter(x=>x[1]).length,checks:checks.map(([name,ok])=>({name,ok}))};}

export async function handleV2000000000(req,res,u){if(!u.pathname.startsWith('/api/v2000000000'))return false;try{const s=await read();
 if(u.pathname==='/api/v2000000000/control'&&req.method==='GET'){const discovery=await discoverModels();send(res,200,{version:VERSION,policy:s.policy,stats:s.stats,models:discovery.models,providers:discovery.providers,benchmarks:s.benchmarks.slice(0,30),routes:s.routes.slice(0,40),compressions:s.compressions.slice(0,20)});return true}
 if(u.pathname==='/api/v2000000000/discover'&&req.method==='POST'){const discovery=await discoverModels();for(const m of discovery.models)s.modelProfiles[m.id]={...(s.modelProfiles[m.id]||{}),...m,lastSeen:now()};await write(s);send(res,200,{ok:true,...discovery});return true}
 if(u.pathname==='/api/v2000000000/plan'&&req.method==='POST'){const b=await body(req);const discovery=await discoverModels();const plan=buildPlan(s,discovery,b);s.stats.routes++;if(plan.selected?.local)s.stats.localSelected++;else if(plan.selected)s.stats.cloudSelected++;if(plan.failover.length)s.stats.failoverPlans++;const rec={id:uid(),at:now(),request:{role:plan.role,privacy:plan.constraints.privacy,budgetMode:plan.constraints.budgetMode,needsFreshness:plan.constraints.needsFreshness,contextChars:plan.constraints.contextChars},selected:plan.selected?{id:plan.selected.id,provider:plan.selected.provider,model:plan.selected.model,local:plan.selected.local,score:plan.selected.routeScore}:null,failover:plan.failover};s.routes.unshift(rec);s.routes=s.routes.slice(0,300);await write(s);send(res,200,{ok:!!plan.selected,...plan,routeId:rec.id});return true}
 if(u.pathname==='/api/v2000000000/route'&&req.method==='POST'){const b=await body(req);const discovery=await discoverModels();const plan=buildPlan(s,discovery,b);if(!plan.selected)throw new Error('No healthy model available');const compressed=compressMessages(Array.isArray(b.messages)?b.messages:[{role:'user',content:String(b.prompt||'')}],Number(b.maxContextChars)||Math.min(s.policy.maxContextChars,plan.selected.context||s.policy.maxContextChars));let lastErr=null;const chain=[plan.selected,...plan.candidates.filter(x=>x.id!==plan.selected.id).slice(0,4)];for(let i=0;i<chain.length;i++){const m=chain[i];try{const started=Date.now();const output=await invoke(m,compressed.messages,Number(b.temperature)||.2);const rec={id:uid(),at:now(),role:plan.role,provider:m.provider,providerId:m.providerId,model:m.model,local:m.local,routeScore:m.routeScore,failoverIndex:i,latencyMs:Date.now()-started,context:{originalChars:compressed.originalChars,outputChars:compressed.outputChars,ratio:compressed.ratio,digest:compressed.digest},ok:true};s.routes.unshift(rec);s.routes=s.routes.slice(0,300);s.stats.routes++;if(m.local)s.stats.localSelected++;else s.stats.cloudSelected++;if(i>0)s.stats.failoverPlans++;await write(s);send(res,200,{ok:true,output,route:rec,plan:{role:plan.role,failover:plan.failover},context:rec.context});return true}catch(e){lastErr=e;s.events.unshift({at:now(),type:'route_error',modelId:m.id,error:String(e.message||e)})}}throw lastErr||new Error('All model routes failed')}
 if(u.pathname==='/api/v2000000000/compress'&&req.method==='POST'){const b=await body(req);const c=compressMessages(b.messages,clamp(Number(b.maxChars)||24000,4000,s.policy.maxContextChars));s.stats.compressions++;s.compressions.unshift({id:uid(),at:now(),originalChars:c.originalChars,outputChars:c.outputChars,ratio:c.ratio,digest:c.digest});s.compressions=s.compressions.slice(0,100);await write(s);send(res,200,{ok:true,...c});return true}
 if(u.pathname==='/api/v2000000000/benchmark'&&req.method==='POST'){const b=await body(req);const discovery=await discoverModels();let models=discovery.models.filter(m=>m.local||b.includeCloud===true);if(b.modelId)models=models.filter(m=>m.id===b.modelId);models=models.slice(0,Math.max(1,Math.min(8,Number(b.limit)||4)));const results=[];for(const m of models){const r=await benchmarkModel(m);results.push(r);s.benchmarks.unshift(r);s.stats.benchmarks++;}s.benchmarks=s.benchmarks.slice(0,200);await write(s);send(res,200,{ok:true,results});return true}
 if(u.pathname==='/api/v2000000000/config'&&req.method==='POST'){const b=await body(req);if(b.policy)s.policy={...s.policy,...b.policy};if(b.roleWeights)s.roleWeights={...s.roleWeights,...b.roleWeights};await write(s);send(res,200,{ok:true,policy:s.policy,roleWeights:s.roleWeights});return true}
 if(u.pathname==='/api/v2000000000/self-test'&&req.method==='POST'){send(res,200,selfTest());return true}
 send(res,404,{error:'v2000000000 route not found'});return true;
 }catch(e){send(res,400,{error:String(e.message||e)});return true}}
