import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT=process.cwd();
const DATA=path.join(ROOT,'data');
const STATE=path.join(DATA,'command-center-v500.json');
const EVENTS=path.join(DATA,'command-events-v500.jsonl');
const CHECKPOINTS=path.join(ROOT,'checkpoints','v500');
const now=()=>new Date().toISOString();
const base=()=>({version:'500.0.0',missions:[],approvals:[],toolRegistry:[
 {id:'workspace.read',name:'Workspace Read',risk:'low',approval:false,enabled:true},
 {id:'workspace.write',name:'Workspace Write',risk:'medium',approval:true,enabled:true},
 {id:'project.check',name:'Project Verification',risk:'low',approval:false,enabled:true},
 {id:'checkpoint.create',name:'Checkpoint',risk:'low',approval:false,enabled:true},
 {id:'model.plan',name:'AI Planning',risk:'low',approval:false,enabled:true},
 {id:'release.prepare',name:'Release Preparation',risk:'medium',approval:true,enabled:true}
],stats:{created:0,completed:0,checkpoints:0}});
async function load(){try{const b=base(),x=JSON.parse(await fs.readFile(STATE,'utf8'));const s={...b,...x};if(!Array.isArray(s.toolRegistry)||!s.toolRegistry.length)s.toolRegistry=b.toolRegistry;return s}catch{return base()}}
async function save(s){await fs.mkdir(DATA,{recursive:true});await fs.writeFile(STATE,JSON.stringify(s,null,2));return s}
async function event(type,detail={}){await fs.mkdir(DATA,{recursive:true});await fs.appendFile(EVENTS,JSON.stringify({id:crypto.randomUUID(),at:now(),type,detail})+'\\n')}
async function body(req){let x='';for await(const c of req){x+=c;if(x.length>2e6)throw Error('Request too large')}return x?JSON.parse(x):{}}
function send(res,status,obj){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(obj))}
function plan(goal){const g=String(goal||'').trim();return [
 {name:'Understand',detail:`Define success criteria and constraints for: ${g}`,status:'ready'},
 {name:'Inspect',detail:'Inspect relevant project context, files, memory, dependencies, and current state.',status:'ready'},
 {name:'Checkpoint',detail:'Create a recovery checkpoint before changes.',status:'ready'},
 {name:'Execute',detail:'Perform the smallest reversible set of changes that satisfies the goal.',status:'blocked'},
 {name:'Verify',detail:'Run syntax, health, regression, and acceptance checks.',status:'ready'},
 {name:'Evidence',detail:'Record results, changed artifacts, failures, and proof of completion.',status:'ready'},
 {name:'Release',detail:'Prepare the result for operator review and release.',status:'blocked'}]}
async function summary(){const s=await load();const pending=s.approvals.filter(x=>x.status==='pending').length;const active=s.missions.filter(x=>['planned','approved','running','review'].includes(x.status)).length;return {version:s.version,readiness:Math.max(0,100-pending*8),active,pendingApprovals:pending,completed:s.stats.completed||0,checkpoints:s.stats.checkpoints||0,missions:s.missions.slice(-30).reverse(),approvals:s.approvals.slice(-30).reverse(),tools:s.toolRegistry}}
export async function handleV500(req,res,u){if(!u.pathname.startsWith('/api/v500/'))return false;
 try{
  if(u.pathname==='/api/v500/control'&&req.method==='GET'){send(res,200,await summary());return true}
  if(u.pathname==='/api/v500/missions'&&req.method==='POST'){const b=await body(req);if(!String(b.goal||'').trim())throw Error('Goal is required');const s=await load();const m={id:crypto.randomUUID(),goal:String(b.goal).trim(),project:String(b.project||'default'),priority:String(b.priority||'normal'),status:'planned',createdAt:now(),updatedAt:now(),steps:plan(b.goal),history:[{at:now(),action:'planned'}]};s.missions.push(m);s.stats.created=(s.stats.created||0)+1;await save(s);await event('mission.planned',{id:m.id,goal:m.goal});send(res,201,m);return true}
  if(u.pathname==='/api/v500/missions/action'&&req.method==='POST'){const b=await body(req);const s=await load();const m=s.missions.find(x=>x.id===b.id);if(!m)throw Error('Mission not found');const a=String(b.action||'');if(a==='approve'){m.status='approved';m.steps.forEach(x=>{if(x.status==='blocked')x.status='ready'})}else if(a==='run'){if(!['approved','review'].includes(m.status))throw Error('Approve the mission before running it');m.status='running'}else if(a==='review'){m.status='review'}else if(a==='complete'){m.status='done';s.stats.completed=(s.stats.completed||0)+1}else if(a==='cancel'){m.status='cancelled'}else throw Error('Unknown action');m.updatedAt=now();m.history.push({at:now(),action:a});await save(s);await event('mission.'+a,{id:m.id});send(res,200,m);return true}
  if(u.pathname==='/api/v500/approvals'&&req.method==='POST'){const b=await body(req);const s=await load();const x={id:crypto.randomUUID(),missionId:String(b.missionId||''),title:String(b.title||'Operator approval'),reason:String(b.reason||''),risk:String(b.risk||'medium'),status:'pending',createdAt:now()};s.approvals.push(x);await save(s);await event('approval.requested',{id:x.id});send(res,201,x);return true}
  if(u.pathname==='/api/v500/approvals/decide'&&req.method==='POST'){const b=await body(req);const s=await load();const x=s.approvals.find(a=>a.id===b.id);if(!x)throw Error('Approval not found');x.status=b.decision==='approve'?'approved':'denied';x.decidedAt=now();await save(s);await event('approval.decided',{id:x.id,status:x.status});send(res,200,x);return true}
  if(u.pathname==='/api/v500/checkpoints'&&req.method==='POST'){const b=await body(req);await fs.mkdir(CHECKPOINTS,{recursive:true});const id=Date.now()+'-'+crypto.randomUUID().slice(0,8);const cp={id,at:now(),label:String(b.label||'Manual checkpoint'),missionId:String(b.missionId||''),note:String(b.note||'')};await fs.writeFile(path.join(CHECKPOINTS,id+'.json'),JSON.stringify(cp,null,2));const s=await load();s.stats.checkpoints=(s.stats.checkpoints||0)+1;await save(s);await event('checkpoint.created',cp);send(res,201,cp);return true}
  if(u.pathname==='/api/v500/events'&&req.method==='GET'){let rows=[];try{rows=(await fs.readFile(EVENTS,'utf8')).trim().split('\\n').filter(Boolean).slice(-100).reverse().map(JSON.parse)}catch{}send(res,200,{events:rows});return true}
  if(u.pathname==='/api/v500/self-test'&&req.method==='POST'){const checks=[];for(const [name,p] of [['data',DATA],['workspace',path.join(ROOT,'workspace')],['checkpoints',path.join(ROOT,'checkpoints')]]){try{await fs.access(p);checks.push({name,ok:true})}catch{checks.push({name,ok:false})}}const s=await load();checks.push({name:'command-state',ok:!!s.version});const ok=checks.every(x=>x.ok);await event('selftest',{ok,checks});send(res,200,{ok,at:now(),checks});return true}
  send(res,404,{error:'Unknown v500 endpoint'});return true
 }catch(e){send(res,400,{error:e.message});return true}
}
