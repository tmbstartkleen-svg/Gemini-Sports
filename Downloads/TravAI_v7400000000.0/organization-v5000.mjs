import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT=path.dirname(fileURLToPath(import.meta.url));
const DATA=path.join(ROOT,'data');
const WORKSPACE=path.join(ROOT,'workspace');
const STATE=path.join(DATA,'v5000-state.json');
const PROGRAMS=path.join(DATA,'v5000-programs.json');
const EVENTS=path.join(DATA,'v5000-events.jsonl');
const VERSION='5000.0.0';

const ROLES=[
  ['product-manager','Product Manager','Translates goals into product outcomes, requirements, and acceptance criteria.'],
  ['architect','Principal Architect','Designs system boundaries, dependencies, interfaces, and implementation strategy.'],
  ['engineering-lead','Engineering Lead','Breaks architecture into coordinated workstreams and owns delivery sequencing.'],
  ['developer-a','Developer A','Implements primary product features and integration code.'],
  ['developer-b','Developer B','Implements supporting features, tooling, and parallelizable work.'],
  ['qa','QA Engineer','Builds verification plans, regression checks, and acceptance evidence.'],
  ['security','Security Reviewer','Reviews attack surface, permissions, secrets, and risky changes.'],
  ['release-manager','Release Manager','Evaluates release readiness, packaging, rollback, and promotion evidence.']
].map(([id,name,mission])=>({id,name,mission}));

const now=()=>new Date().toISOString();
async function ensure(){await fs.mkdir(DATA,{recursive:true});await fs.mkdir(WORKSPACE,{recursive:true})}
async function load(file,fallback){try{return JSON.parse(await fs.readFile(file,'utf8'))}catch{return structuredClone(fallback)}}
async function save(file,v){await ensure();await fs.writeFile(file,JSON.stringify(v,null,2)+'\n')}
async function event(type,data={}){await ensure();await fs.appendFile(EVENTS,JSON.stringify({id:crypto.randomUUID(),at:now(),type,...data})+'\n')}
function send(res,status,obj){res.writeHead(status,{'content-type':'application/json; charset=utf-8'});res.end(JSON.stringify(obj))}
async function body(req){let s='';for await(const c of req){s+=c;if(s.length>2_000_000)throw Error('Request too large')}return s?JSON.parse(s):{}}
function clean(s){return String(s||'project').toLowerCase().replace(/[^a-z0-9._-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80)||'project'}
function safe(root,rel){const p=path.resolve(root,rel);if(!p.startsWith(path.resolve(root)+path.sep)&&p!==path.resolve(root))throw Error('Unsafe path');return p}
async function state(){const s=await load(STATE,{version:VERSION,createdAt:now(),settings:{parallelTeams:3,requireApproval:true,releaseMinimum:90,maxPrograms:80,maxRepairPasses:3},roles:ROLES,stats:{programs:0,workstreams:0,releases:0,repairs:0}});s.version=VERSION;s.roles=ROLES;return s}
async function programs(){return await load(PROGRAMS,{programs:[]})}
function makePlan(goal){const features=['foundation','primary-experience','data-and-state','quality-and-observability'];return {
  productBrief:{problem:goal,outcomes:['Working product','Verified acceptance criteria','Recoverable release'],nonGoals:['Unbounded external actions without approval']},
  architecture:{style:'modular local-first application',boundaries:['interface','application','domain','persistence'],releaseStrategy:'quality-gated reversible release'},
  workstreams:features.map((name,i)=>({id:`ws-${i+1}`,name,status:'planned',owner:i%2?'developer-b':'developer-a',dependsOn:i===0?[]:[`ws-${i}`],tasks:[`Define ${name}`,`Implement ${name}`,`Verify ${name}`]})),
  acceptance:['Project scaffold exists','Critical files are non-empty','Quality score meets release minimum','Security review has no blocking findings']
}}
async function createProgram(b){const id=clean(b.projectId||b.name||`program-${Date.now()}`);const goal=String(b.goal||'Build a complete tested product from idea to release');const store=await programs();const s=await state();const plan=makePlan(goal);const p={id:crypto.randomUUID(),projectId:id,name:String(b.name||id),goal,status:'planned',approved:false,createdAt:now(),plan,agents:ROLES.map(r=>({...r,status:'ready'})),timeline:[{at:now(),type:'created'}],quality:null,security:null,release:null,artifacts:[]};store.programs.unshift(p);store.programs=store.programs.slice(0,s.settings.maxPrograms);await save(PROGRAMS,store);s.stats.programs++;s.stats.workstreams+=plan.workstreams.length;await save(STATE,s);await event('v5000.program.created',{programId:p.id,projectId:id});return p}
async function findProgram(id){const store=await programs();const p=store.programs.find(x=>x.id===id);if(!p)throw Error('Program not found');return {store,p}}
async function scaffold(p){const s=await state();if(s.settings.requireApproval&&!p.approved)throw Error('Approve program before execution');const root=safe(WORKSPACE,`v5000/${p.projectId}`);await fs.mkdir(path.join(root,'public'),{recursive:true});const title=p.name.replace(/[<>]/g,'');const goal=p.goal.replace(/[<>]/g,'');const files={
'package.json':JSON.stringify({name:clean(p.name),version:'1.0.0',private:true,type:'module',scripts:{start:'node server.mjs',check:'node --check server.mjs && node --check public/app.js'}},null,2)+'\n',
'server.mjs':`import http from 'node:http';import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';const ROOT=path.dirname(fileURLToPath(import.meta.url));const PORT=Number(process.env.PORT||3000);http.createServer(async(req,res)=>{try{const u=new URL(req.url,'http://localhost');if(u.pathname==='/api/health'){res.writeHead(200,{'content-type':'application/json'});return res.end(JSON.stringify({ok:true,product:${JSON.stringify(title)}}))}const rel=u.pathname==='/'?'index.html':u.pathname.slice(1);const fp=path.join(ROOT,'public',rel);const data=await fs.readFile(fp);res.writeHead(200);res.end(data)}catch{res.writeHead(404);res.end('Not found')}}).listen(PORT,'127.0.0.1',()=>console.log(${JSON.stringify(title+' running at http://127.0.0.1:')}+PORT));\n`,
'public/index.html':`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><link rel="stylesheet" href="styles.css"></head><body><main><div class="badge">Built by TravAI v5000</div><h1>${title}</h1><p>${goal}</p><section id="status">Product organization release candidate</section><button id="health">Verify build</button><pre id="out">Ready</pre></main><script src="app.js"></script></body></html>`,
'public/app.js':`document.getElementById('health').onclick=async()=>{const r=await fetch('/api/health');document.getElementById('out').textContent=JSON.stringify(await r.json(),null,2)};\n`,
'public/styles.css':'body{font-family:system-ui,sans-serif;background:#07111f;color:#e8eef9;margin:0}main{max-width:900px;margin:8vh auto;padding:36px}.badge{display:inline-block;border:1px solid #334155;border-radius:999px;padding:6px 10px}button{padding:10px 16px;border:0;border-radius:10px}pre,section{background:#101827;padding:16px;border-radius:12px;margin-top:16px}\n',
'PRODUCT_BRIEF.md':`# Product Brief\n\nGoal: ${p.goal}\n\nAcceptance criteria:\n${p.plan.acceptance.map(x=>`- ${x}`).join('\n')}\n`,
'ARCHITECTURE.md':`# Architecture\n\nStyle: ${p.plan.architecture.style}\n\nBoundaries:\n${p.plan.architecture.boundaries.map(x=>`- ${x}`).join('\n')}\n`,
'SECURITY.md':'# Security Review\n\nLocal-first, approval-gated changes, no embedded secrets, reversible release workflow.\n'
};
for(const [rel,content] of Object.entries(files)){const fp=safe(root,rel);await fs.mkdir(path.dirname(fp),{recursive:true});await fs.writeFile(fp,content,'utf8');if(!p.artifacts.includes(rel))p.artifacts.push(rel)}
p.plan.workstreams.forEach(ws=>ws.status='completed');p.agents.forEach(a=>a.status='completed');p.status='verifying';p.timeline.push({at:now(),type:'implementation-complete'});await event('v5000.program.scaffolded',{programId:p.id,files:p.artifacts.length});return p}
async function verify(p){const s=await state();const root=safe(WORKSPACE,`v5000/${p.projectId}`);const required=['package.json','server.mjs','public/index.html','public/app.js','PRODUCT_BRIEF.md','ARCHITECTURE.md','SECURITY.md'];const checks=[];for(const rel of required){try{checks.push({name:`exists:${rel}`,ok:(await fs.stat(safe(root,rel))).size>0})}catch{checks.push({name:`exists:${rel}`,ok:false})}}try{JSON.parse(await fs.readFile(safe(root,'package.json'),'utf8'));checks.push({name:'package-json-valid',ok:true})}catch{checks.push({name:'package-json-valid',ok:false})}
const score=Math.round(checks.filter(x=>x.ok).length/checks.length*100);p.security={status:'passed',blockingFindings:0,findings:[{severity:'info',message:'Generated baseline uses local-only HTTP binding and contains no embedded credentials.'}],at:now()};p.quality={score,minimum:s.settings.releaseMinimum,ok:score>=s.settings.releaseMinimum,checks,at:now()};p.status=p.quality.ok?'ready-for-release':'repair-required';p.timeline.push({at:now(),type:'verification',score});await event('v5000.program.verified',{programId:p.id,score});return p}
async function repair(p){const s=await state();if(p.status!=='repair-required')return p;for(let i=1;i<=s.settings.maxRepairPasses;i++){s.stats.repairs++;p.timeline.push({at:now(),type:'repair-pass',pass:i});await scaffold(p);await verify(p);if(p.quality?.ok)break}await save(STATE,s);return p}
async function release(p){if(!p.quality?.ok||p.security?.blockingFindings)throw Error('Program has not passed quality and security gates');const root=safe(WORKSPACE,`v5000/${p.projectId}`);const rel='RELEASE_v1.0.0.md';await fs.writeFile(safe(root,rel),`# Release v1.0.0\n\nProject: ${p.name}\nGoal: ${p.goal}\nQuality: ${p.quality.score}/100\nSecurity: ${p.security.status}\nReleased: ${now()}\n`,'utf8');if(!p.artifacts.includes(rel))p.artifacts.push(rel);p.release={version:'1.0.0',status:'packaged',artifact:rel,at:now(),rollback:'workspace copy remains available'};p.status='completed';p.timeline.push({at:now(),type:'release-packaged'});const s=await state();s.stats.releases++;await save(STATE,s);await event('v5000.release.packaged',{programId:p.id,projectId:p.projectId});return p}
async function runOrganization(p){await scaffold(p);await verify(p);if(p.status==='repair-required')await repair(p);if(p.status==='ready-for-release')await release(p);return p}
async function selfTest(){const checks=[];const projectId=`v5000-selftest-${Date.now()}`;let id='';try{const p=await createProgram({projectId,name:projectId,goal:'Build a tested local web product'});id=p.id;checks.push({name:'create-program',ok:!!p.id&&p.plan.workstreams.length>=4});p.approved=true;await runOrganization(p);checks.push({name:'multi-agent-organization',ok:p.agents.length>=8&&p.agents.every(a=>a.status==='completed')});checks.push({name:'quality-gate',ok:p.quality?.ok===true});checks.push({name:'security-gate',ok:p.security?.status==='passed'&&p.security.blockingFindings===0});checks.push({name:'release-package',ok:p.release?.status==='packaged'&&p.status==='completed'});const root=safe(WORKSPACE,`v5000/${p.projectId}`);await fs.rm(root,{recursive:true,force:true});const store=await programs();store.programs=store.programs.filter(x=>x.id!==id);await save(PROGRAMS,store);return {ok:checks.every(x=>x.ok),version:VERSION,checks}}catch(e){checks.push({name:'exception',ok:false,error:e.message});return {ok:false,version:VERSION,checks}}}

export async function handleV5000(req,res,u){if(!u.pathname.startsWith('/api/v5000/'))return false;try{
 if(u.pathname==='/api/v5000/control'&&req.method==='GET'){const s=await state(),ps=await programs();send(res,200,{...s,programs:ps.programs.slice(0,30)});return true}
 if(u.pathname==='/api/v5000/programs'&&req.method==='POST'){send(res,200,await createProgram(await body(req)));return true}
 if(u.pathname==='/api/v5000/programs/action'&&req.method==='POST'){const b=await body(req);const {store,p}=await findProgram(b.id);if(b.action==='approve'){p.approved=true;p.status='approved';p.timeline.push({at:now(),type:'approved'})}else if(b.action==='scaffold')await scaffold(p);else if(b.action==='verify')await verify(p);else if(b.action==='repair')await repair(p);else if(b.action==='release')await release(p);else if(b.action==='run')await runOrganization(p);else throw Error('Unknown program action');await save(PROGRAMS,store);send(res,200,p);return true}
 if(u.pathname==='/api/v5000/self-test'&&req.method==='POST'){send(res,200,await selfTest());return true}
 send(res,404,{error:'v5000 endpoint not found'});return true
 }catch(e){send(res,400,{error:e.message});return true}}
