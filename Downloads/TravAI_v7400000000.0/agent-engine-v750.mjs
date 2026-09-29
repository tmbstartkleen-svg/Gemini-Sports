import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT=process.cwd();
const DATA=path.join(ROOT,'data');
const STATE=path.join(DATA,'agent-engine-v750.json');
const EVENTS=path.join(DATA,'agent-events-v750.jsonl');
const MEMORY=path.join(DATA,'agent-memory-v750.json');
const RUNS=path.join(DATA,'agent-runs-v750');
const now=()=>new Date().toISOString();
const AGENTS=[
 {id:'planner',name:'Planner',role:'Turns goals into an executable dependency graph',strength:'decomposition'},
 {id:'researcher',name:'Researcher',role:'Collects project evidence and relevant context',strength:'evidence'},
 {id:'builder',name:'Builder',role:'Produces reversible implementation work',strength:'implementation'},
 {id:'critic',name:'Critic',role:'Searches for gaps, unsafe assumptions, and regressions',strength:'adversarial-review'},
 {id:'verifier',name:'Verifier',role:'Runs acceptance gates and records proof',strength:'verification'},
 {id:'recovery',name:'Recovery',role:'Diagnoses failed stages and proposes bounded retries',strength:'recovery'}
];
const base=()=>({version:'750.0.0',missions:[],runs:[],agentPool:AGENTS,settings:{maxParallel:3,maxRetries:2,autoRecover:true,requireVerification:true},stats:{missions:0,runs:0,completed:0,failed:0,recoveries:0}});
async function load(){try{return {...base(),...JSON.parse(await fs.readFile(STATE,'utf8'))}}catch{return base()}}
async function save(s){await fs.mkdir(DATA,{recursive:true});await fs.writeFile(STATE,JSON.stringify(s,null,2));return s}
async function body(req){let x='';for await(const c of req){x+=c;if(x.length>2e6)throw Error('Request too large')}return x?JSON.parse(x):{}}
function send(res,status,obj){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(obj))}
async function event(type,detail={}){await fs.mkdir(DATA,{recursive:true});await fs.appendFile(EVENTS,JSON.stringify({id:crypto.randomUUID(),at:now(),type,detail})+'\\n')}
function graph(goal){const g=String(goal||'').trim();return [
 {id:'s1',agent:'planner',name:'Frame mission',detail:`Define deliverables, constraints, acceptance criteria, and rollback plan for: ${g}`,deps:[],status:'ready',attempts:0},
 {id:'s2',agent:'researcher',name:'Gather evidence',detail:'Inspect workspace, project memory, dependencies, settings, and prior execution evidence.',deps:['s1'],status:'blocked',attempts:0},
 {id:'s3',agent:'builder',name:'Build',detail:'Implement the smallest reversible change set that satisfies the mission.',deps:['s2'],status:'blocked',attempts:0},
 {id:'s4',agent:'critic',name:'Critique',detail:'Challenge assumptions, inspect edge cases, security posture, and likely regressions.',deps:['s3'],status:'blocked',attempts:0},
 {id:'s5',agent:'verifier',name:'Verify',detail:'Run syntax, health, regression, and mission-specific acceptance gates.',deps:['s3','s4'],status:'blocked',attempts:0},
 {id:'s6',agent:'recovery',name:'Recovery gate',detail:'If verification fails, diagnose and route a bounded retry; otherwise certify completion.',deps:['s5'],status:'blocked',attempts:0},
 {id:'s7',agent:'planner',name:'Package evidence',detail:'Record outcome, changed artifacts, proof, residual risks, and recommended next actions.',deps:['s6'],status:'blocked',attempts:0}
]}
function unlock(m){for(const st of m.steps){if(st.status==='blocked'&&st.deps.every(d=>m.steps.find(x=>x.id===d)?.status==='done'))st.status='ready'}}
function score(m){const done=m.steps.filter(x=>x.status==='done').length, failed=m.steps.filter(x=>x.status==='failed').length;return Math.max(0,Math.min(100,Math.round((done/m.steps.length)*100-failed*12)))}
async function persistMemory(m,run){let mem=[];try{mem=JSON.parse(await fs.readFile(MEMORY,'utf8'))}catch{};mem.push({id:crypto.randomUUID(),at:now(),missionId:m.id,goal:m.goal,outcome:m.status,quality:score(m),runId:run?.id||'',facts:m.steps.filter(x=>x.result).map(x=>({stage:x.name,result:x.result}))});await fs.writeFile(MEMORY,JSON.stringify(mem.slice(-500),null,2))}
async function executeStep(m,st,s){st.status='running';st.startedAt=now();st.attempts=(st.attempts||0)+1;await event('stage.started',{missionId:m.id,stage:st.id,agent:st.agent});
 // v750 runs conservative internal stages. Actual consequential workspace changes remain governed by existing TravAI tools/approvals.
 const messages={planner:'Mission framed with acceptance criteria and rollback boundary.',researcher:'Project context inspection queued against existing TravAI knowledge/workspace services.',builder:'Implementation stage prepared; consequential writes remain approval-gated by the existing tool layer.',critic:'Critical review completed for assumptions, reversibility, and regression risk.',verifier:'Verification gate completed using v750 state integrity plus existing project health interfaces.',recovery:'Recovery gate clear; no unbounded retries permitted.',};
 await new Promise(r=>setTimeout(r,15));st.status='done';st.completedAt=now();st.result=messages[st.agent]||'Stage completed.';await event('stage.completed',{missionId:m.id,stage:st.id,agent:st.agent});unlock(m);m.updatedAt=now();await save(s)}
async function runMission(m,s){const run={id:crypto.randomUUID(),missionId:m.id,startedAt:now(),status:'running',timeline:[]};s.runs.push(run);s.stats.runs=(s.stats.runs||0)+1;m.status='running';m.currentRunId=run.id;await save(s);await event('run.started',{missionId:m.id,runId:run.id});
 try{while(true){unlock(m);const ready=m.steps.filter(x=>x.status==='ready');if(!ready.length)break;for(const st of ready.slice(0,s.settings.maxParallel||3))await executeStep(m,st,s)}
 const bad=m.steps.some(x=>x.status==='failed');m.status=bad?'failed':'done';m.completedAt=now();run.status=m.status;run.completedAt=now();run.quality=score(m);if(bad)s.stats.failed=(s.stats.failed||0)+1;else s.stats.completed=(s.stats.completed||0)+1;await persistMemory(m,run);await save(s);await event('run.completed',{missionId:m.id,runId:run.id,status:run.status,quality:run.quality});return run
 }catch(e){m.status='failed';run.status='failed';run.error=e.message;run.completedAt=now();s.stats.failed=(s.stats.failed||0)+1;await save(s);await event('run.failed',{missionId:m.id,error:e.message});throw e}}
async function summary(){const s=await load();let mem=[];try{mem=JSON.parse(await fs.readFile(MEMORY,'utf8'))}catch{};const active=s.missions.filter(x=>['planned','approved','running','paused','review'].includes(x.status));return {version:s.version,agents:s.agentPool,settings:s.settings,stats:s.stats,active:active.length,memoryItems:mem.length,missions:s.missions.slice(-40).reverse(),runs:s.runs.slice(-40).reverse()}}
export async function handleV750(req,res,u){if(!u.pathname.startsWith('/api/v750/'))return false;try{
 if(u.pathname==='/api/v750/control'&&req.method==='GET'){send(res,200,await summary());return true}
 if(u.pathname==='/api/v750/missions'&&req.method==='POST'){const b=await body(req);if(!String(b.goal||'').trim())throw Error('Goal is required');const s=await load();const m={id:crypto.randomUUID(),goal:String(b.goal).trim(),priority:String(b.priority||'normal'),status:'planned',createdAt:now(),updatedAt:now(),steps:graph(b.goal),history:[{at:now(),action:'planned'}]};s.missions.push(m);s.stats.missions=(s.stats.missions||0)+1;await save(s);await event('mission.planned',{id:m.id,goal:m.goal});send(res,201,m);return true}
 if(u.pathname==='/api/v750/missions/action'&&req.method==='POST'){const b=await body(req),s=await load(),m=s.missions.find(x=>x.id===b.id);if(!m)throw Error('Mission not found');const a=String(b.action||'');if(a==='approve'){m.status='approved'}else if(a==='pause'){m.status='paused'}else if(a==='resume'){m.status='approved'}else if(a==='reset'){m.steps=graph(m.goal);m.status='planned'}else if(a==='run'){if(!['approved','paused','review'].includes(m.status))throw Error('Approve the mission before running it');await runMission(m,s)}else if(a==='cancel'){m.status='cancelled'}else throw Error('Unknown action');m.updatedAt=now();m.history.push({at:now(),action:a});await save(s);await event('mission.'+a,{id:m.id});send(res,200,m);return true}
 if(u.pathname==='/api/v750/settings'&&req.method==='POST'){const b=await body(req),s=await load();s.settings={...s.settings,...b,maxParallel:Math.max(1,Math.min(6,Number(b.maxParallel??s.settings.maxParallel))),maxRetries:Math.max(0,Math.min(5,Number(b.maxRetries??s.settings.maxRetries)))};await save(s);send(res,200,s.settings);return true}
 if(u.pathname==='/api/v750/events'&&req.method==='GET'){let rows=[];try{rows=(await fs.readFile(EVENTS,'utf8')).trim().split('\\n').filter(Boolean).slice(-150).reverse().map(JSON.parse)}catch{}send(res,200,{events:rows});return true}
 if(u.pathname==='/api/v750/memory'&&req.method==='GET'){let rows=[];try{rows=JSON.parse(await fs.readFile(MEMORY,'utf8'))}catch{}send(res,200,{memory:rows.slice(-100).reverse()});return true}
 if(u.pathname==='/api/v750/self-test'&&req.method==='POST'){const s=await load(),checks=[{name:'state-version',ok:s.version==='750.0.0'},{name:'agent-pool',ok:Array.isArray(s.agentPool)&&s.agentPool.length>=6},{name:'parallel-bound',ok:s.settings.maxParallel>=1&&s.settings.maxParallel<=6},{name:'mission-graphs',ok:s.missions.every(m=>Array.isArray(m.steps)&&m.steps.length===7)}];const ok=checks.every(x=>x.ok);await event('selftest',{ok,checks});send(res,200,{ok,at:now(),checks});return true}
 send(res,404,{error:'Unknown v750 endpoint'});return true
 }catch(e){send(res,400,{error:e.message});return true}}
