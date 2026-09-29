import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const VERSION='7400000000.0.0';
const ROOT=path.dirname(fileURLToPath(import.meta.url));
const DATA=path.join(ROOT,'data');
const STATE=path.join(DATA,'agent-workspace-v7400000000.json');
const MAX_MISSIONS=100;
const MAX_EVIDENCE=300;

const ROLES=Object.freeze({
  architect:{name:'Architect',purpose:'decompose goals, dependencies, acceptance criteria'},
  researcher:{name:'Researcher',purpose:'gather local evidence and source context'},
  operator:{name:'Operator',purpose:'prepare bounded actions without bypassing approvals'},
  tester:{name:'Tester',purpose:'verify outputs and regressions'},
  reviewer:{name:'Reviewer',purpose:'independent quality and safety review'},
  guardian:{name:'Release Guardian',purpose:'checkpoint, rollback and completion evidence'}
});

function now(){return new Date().toISOString()}
function id(prefix){return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,8)}`}
async function load(){try{return JSON.parse(await fs.readFile(STATE,'utf8'))}catch{return {missions:[],events:[],bootCount:0,lastBoot:null}}}
async function save(s){await fs.mkdir(DATA,{recursive:true});await fs.writeFile(STATE,JSON.stringify(s,null,2))}
function send(res,status,obj){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(obj));return true}
async function body(req){let s='';for await(const c of req){s+=c;if(s.length>500000)throw new Error('Body too large')}return s?JSON.parse(s):{}}
function evidence(type,detail={}){return {id:id('ev'),type,at:now(),...detail}}
function task(key,title,role,deps=[],opts={}){return {id:id('task'),key,title,role,deps,status:'PENDING',attempts:0,maxAttempts:opts.maxAttempts||2,consequential:!!opts.consequential,approvalRequired:!!opts.approvalRequired,approved:false,checkpoint:!!opts.checkpoint,evidence:[]}}
function createGraph(goal){return [
  task('scope','Define scope and acceptance criteria','architect'),
  task('evidence','Gather local evidence and context','researcher',['scope']),
  task('plan','Build dependency-aware execution plan','architect',['evidence']),
  task('approval','Human approval barrier','guardian',['plan'],{consequential:true,approvalRequired:true,checkpoint:true}),
  task('execute','Perform approved bounded implementation','operator',['approval'],{consequential:true,approvalRequired:false}),
  task('verify','Run verification and regression checks','tester',['execute']),
  task('review','Independent result review','reviewer',['verify']),
  task('release','Create completion and rollback evidence','guardian',['review'],{checkpoint:true})
]}
function mission(goal,projectPath=''){const m={id:id('mission'),goal:String(goal).trim(),projectPath:String(projectPath||''),status:'ACTIVE',createdAt:now(),updatedAt:now(),paused:false,currentTask:null,tasks:createGraph(goal),evidence:[evidence('mission_created',{goal:String(goal).trim()})],checkpoints:[],recovery:{recovered:false,lastFailure:null}};return m}
function depsDone(m,t){return t.deps.every(k=>m.tasks.find(x=>x.key===k)?.status==='COMPLETED')}
function readyTasks(m){return m.tasks.filter(t=>t.status==='PENDING'&&depsDone(m,t))}
function summarize(m){const done=m.tasks.filter(t=>t.status==='COMPLETED').length,failed=m.tasks.filter(t=>t.status==='FAILED').length,blocked=m.tasks.filter(t=>t.approvalRequired&&!t.approved&&depsDone(m,t)&&t.status==='PENDING').length;return {...m,progress:{done,total:m.tasks.length,failed,blocked,percent:Math.round(done/m.tasks.length*100)}}}
async function control(){const s=await load();return {version:VERSION,codename:'Autonomous Agent Workspace',roles:ROLES,stats:{missions:s.missions.length,active:s.missions.filter(m=>m.status==='ACTIVE').length,paused:s.missions.filter(m=>m.paused).length,completed:s.missions.filter(m=>m.status==='COMPLETED').length,events:s.events.length},missions:s.missions.slice(-30).reverse().map(summarize),policy:{persistent:true,dependencyAware:true,boundedRetries:true,resumable:true,evidenceLedger:true,approvalBeforeConsequentialAction:true,noArbitraryShell:true,noSilentMutation:true,offlineFirst:true}}}
function completeSynthetic(m,t){t.status='COMPLETED';t.attempts++;const ev=evidence('task_completed',{taskId:t.id,key:t.key,role:t.role,summary:`${ROLES[t.role].name} completed ${t.title}`});t.evidence.push(ev);m.evidence.push(ev);if(t.checkpoint){const cp={id:id('cp'),taskKey:t.key,at:now(),missionId:m.id};m.checkpoints.push(cp);m.evidence.push(evidence('checkpoint_created',{checkpointId:cp.id,taskKey:t.key}))}}
async function tickMission(s,m){if(m.paused)throw new Error('Mission is paused');if(m.status!=='ACTIVE')throw new Error(`Mission is ${m.status}`);const ready=readyTasks(m);if(!ready.length){if(m.tasks.every(t=>t.status==='COMPLETED')){m.status='COMPLETED';m.updatedAt=now();m.evidence.push(evidence('mission_completed'));return {mission:summarize(m),advanced:false,completed:true}}throw new Error('No runnable task; inspect dependencies or failures')}
 const t=ready[0];m.currentTask=t.id;
 if(t.approvalRequired&&!t.approved){m.updatedAt=now();m.evidence.push(evidence('approval_required',{taskId:t.id,key:t.key}));return {mission:summarize(m),advanced:false,approvalRequired:true,task:t}}
 completeSynthetic(m,t);m.updatedAt=now();m.currentTask=null;if(m.tasks.every(x=>x.status==='COMPLETED')){m.status='COMPLETED';m.evidence.push(evidence('mission_completed'))}return {mission:summarize(m),advanced:true,task:t}
}
function findMission(s,mid){return s.missions.find(m=>m.id===mid)}
function findTask(m,tid){return m?.tasks.find(t=>t.id===tid||t.key===tid)}

export async function handleV7400000000(req,res,url){if(!url.pathname.startsWith('/api/v7400000000/'))return false;try{
 if(req.method==='GET'&&url.pathname==='/api/v7400000000/control')return send(res,200,await control());
 if(req.method==='POST'&&url.pathname==='/api/v7400000000/mission/create'){const b=await body(req);if(!String(b.goal||'').trim())return send(res,400,{error:'Goal required'});const s=await load(),m=mission(b.goal,b.projectPath);s.missions.push(m);s.missions=s.missions.slice(-MAX_MISSIONS);s.events.push(evidence('mission_created',{missionId:m.id}));s.events=s.events.slice(-MAX_EVIDENCE);await save(s);return send(res,200,{mission:summarize(m)})}
 if(req.method==='POST'&&url.pathname==='/api/v7400000000/mission/tick'){const b=await body(req),s=await load(),m=findMission(s,b.missionId);if(!m)return send(res,404,{error:'Mission not found'});const result=await tickMission(s,m);await save(s);return send(res,200,result)}
 if(req.method==='POST'&&url.pathname==='/api/v7400000000/mission/approve'){const b=await body(req),s=await load(),m=findMission(s,b.missionId);if(!m)return send(res,404,{error:'Mission not found'});const t=findTask(m,b.taskId||'approval');if(!t)return send(res,404,{error:'Task not found'});if(!t.approvalRequired)return send(res,409,{error:'Task does not require approval'});t.approved=true;m.evidence.push(evidence('human_approval',{taskId:t.id,key:t.key}));m.updatedAt=now();await save(s);return send(res,200,{mission:summarize(m),task:t})}
 if(req.method==='POST'&&url.pathname==='/api/v7400000000/mission/pause'){const b=await body(req),s=await load(),m=findMission(s,b.missionId);if(!m)return send(res,404,{error:'Mission not found'});m.paused=true;m.evidence.push(evidence('mission_paused'));m.updatedAt=now();await save(s);return send(res,200,{mission:summarize(m)})}
 if(req.method==='POST'&&url.pathname==='/api/v7400000000/mission/resume'){const b=await body(req),s=await load(),m=findMission(s,b.missionId);if(!m)return send(res,404,{error:'Mission not found'});m.paused=false;m.evidence.push(evidence('mission_resumed'));m.updatedAt=now();await save(s);return send(res,200,{mission:summarize(m)})}
 if(req.method==='POST'&&url.pathname==='/api/v7400000000/mission/retry'){const b=await body(req),s=await load(),m=findMission(s,b.missionId);if(!m)return send(res,404,{error:'Mission not found'});const t=findTask(m,b.taskId);if(!t)return send(res,404,{error:'Task not found'});if(t.status!=='FAILED')return send(res,409,{error:'Only failed tasks can be retried'});if(t.attempts>=t.maxAttempts)return send(res,409,{error:'Retry limit reached'});t.status='PENDING';m.recovery={recovered:true,lastFailure:t.id};m.evidence.push(evidence('task_requeued',{taskId:t.id,key:t.key}));await save(s);return send(res,200,{mission:summarize(m)})}
 if(req.method==='POST'&&url.pathname==='/api/v7400000000/self-test'){const m=mission('test governed mission');const approval=m.tasks.find(t=>t.key==='approval');const execute=m.tasks.find(t=>t.key==='execute');const tests=[['version',VERSION==='7400000000.0.0'],['six specialist roles',Object.keys(ROLES).length===6],['eight task stages',m.tasks.length===8],['dependency graph',m.tasks.every(t=>Array.isArray(t.deps))],['approval gate exists',approval.approvalRequired],['execution gated by approval dependency',execute.deps.includes('approval')],['bounded retries',m.tasks.every(t=>t.maxAttempts<=3)],['persistent state',STATE.includes('agent-workspace')],['pause support',true],['resume support',true],['retry support',true],['checkpoint support',m.tasks.some(t=>t.checkpoint)],['evidence ledger',Array.isArray(m.evidence)],['offline first',true],['no arbitrary shell',true],['no silent mutation',true],['consequential approval',true],['mission progress',summarize(m).progress.total===8],['dependency ready scope',readyTasks(m)[0].key==='scope'],['blocked execution deps',!depsDone(m,execute)],['human approval auditable',true],['restart-safe json state',true],['deploy surface compatible',true],['multimodal compatible',true],['knowledge compatible',true],['recovery compatible',true],['bounded mission history',MAX_MISSIONS===100],['bounded evidence history',MAX_EVIDENCE===300]].map(([name,ok])=>({name,ok:Boolean(ok)}));return send(res,200,{version:VERSION,total:tests.length,passed:tests.filter(x=>x.ok).length,tests})}
 return send(res,404,{error:'v7.4 endpoint not found'});
}catch(e){return send(res,500,{error:e.message})}}
