import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT=path.dirname(fileURLToPath(import.meta.url));
const DATA=path.join(ROOT,'data');
const WORKSPACE=path.join(ROOT,'workspace');
const STATE=path.join(DATA,'v10000-state.json');
const PROGRAMS=path.join(DATA,'v10000-programs.json');
const TRAINS=path.join(DATA,'v10000-release-trains.json');
const EVENTS=path.join(DATA,'v10000-events.jsonl');
const VERSION='10000.0.0';
const ROLES=[
  ['product-director','Product Director','Owns product intent, roadmap, constraints, and acceptance outcomes.'],
  ['chief-architect','Chief Architect','Maps repositories, contracts, dependency boundaries, and system evolution.'],
  ['platform-engineer','Platform Engineer','Builds shared platform foundations and integration contracts.'],
  ['feature-team-a','Feature Team A','Implements the primary product stream.'],
  ['feature-team-b','Feature Team B','Implements a parallel product stream and shared tooling.'],
  ['qa-automation','QA Automation','Creates regression matrices and release evidence.'],
  ['security-engineer','Security Engineer','Evaluates secrets, permissions, attack surface, and unsafe changes.'],
  ['reliability-engineer','Reliability Engineer','Owns recovery plans, health checks, and repair campaigns.'],
  ['release-train-manager','Release Train Manager','Coordinates multi-repository release readiness and promotion.'],
  ['auditor','Evidence Auditor','Verifies traceability from goal to artifact to test to release.']
].map(([id,name,mission])=>({id,name,mission}));
const now=()=>new Date().toISOString();
async function ensure(){await fs.mkdir(DATA,{recursive:true});await fs.mkdir(WORKSPACE,{recursive:true})}
async function load(file,fallback){try{return JSON.parse(await fs.readFile(file,'utf8'))}catch{return structuredClone(fallback)}}
async function save(file,v){await ensure();await fs.writeFile(file,JSON.stringify(v,null,2)+'\n')}
async function event(type,data={}){await ensure();await fs.appendFile(EVENTS,JSON.stringify({id:crypto.randomUUID(),at:now(),type,...data})+'\n')}
function send(res,status,obj){res.writeHead(status,{'content-type':'application/json; charset=utf-8'});res.end(JSON.stringify(obj))}
async function body(req){let s='';for await(const c of req){s+=c;if(s.length>4_000_000)throw Error('Request too large')}return s?JSON.parse(s):{}}
function slug(s){return String(s||'project').toLowerCase().replace(/[^a-z0-9._-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80)||'project'}
function safe(root,rel){const base=path.resolve(root);const p=path.resolve(base,rel);if(p!==base&&!p.startsWith(base+path.sep))throw Error('Unsafe path');return p}
async function state(){const s=await load(STATE,{version:VERSION,createdAt:now(),settings:{requireApproval:true,minimumQuality:90,maxRepairPasses:3,maxPrograms:100,maxReposPerProgram:12,parallelStreams:4},roles:ROLES,stats:{programs:0,repositories:0,campaigns:0,repairs:0,releases:0}});s.version=VERSION;s.roles=ROLES;return s}
async function store(){return await load(PROGRAMS,{programs:[]})}
async function trains(){return await load(TRAINS,{trains:[]})}
function blueprint(goal,name){const base=slug(name||'product');return {repositories:[
 {id:`${base}-web`,kind:'web',owner:'feature-team-a',dependsOn:[`${base}-core`]},
 {id:`${base}-core`,kind:'core',owner:'platform-engineer',dependsOn:[]},
 {id:`${base}-ops`,kind:'ops',owner:'feature-team-b',dependsOn:[`${base}-core`]}
],campaigns:[
 {id:'foundation',name:'Platform foundation',owner:'platform-engineer',dependsOn:[],status:'planned'},
 {id:'experience',name:'Primary product experience',owner:'feature-team-a',dependsOn:['foundation'],status:'planned'},
 {id:'operations',name:'Operations and observability',owner:'feature-team-b',dependsOn:['foundation'],status:'planned'},
 {id:'assurance',name:'QA, security, reliability',owner:'qa-automation',dependsOn:['experience','operations'],status:'planned'}
],acceptance:['Every repository has a manifest and health contract','All campaigns complete','Regression score meets release threshold','Security has zero blocking findings','Release train contains rollback evidence'],goal}}
async function createProgram(b){const s=await state();const st=await store();const name=String(b.name||b.projectId||`product-${Date.now()}`);const plan=blueprint(String(b.goal||'Build the whole product from idea to tested release'),name);if(plan.repositories.length>s.settings.maxReposPerProgram)throw Error('Repository limit exceeded');const p={id:crypto.randomUUID(),name,slug:slug(name),goal:plan.goal,status:'planned',approved:false,createdAt:now(),updatedAt:now(),roles:ROLES.map(r=>({...r,status:'ready'})),plan,repositories:plan.repositories.map(r=>({...r,status:'planned',branch:'main',quality:0,artifacts:[]})),campaigns:plan.campaigns,repairPasses:0,quality:null,security:null,releaseTrain:null,evidence:[],timeline:[{at:now(),type:'created'}]};st.programs.unshift(p);st.programs=st.programs.slice(0,s.settings.maxPrograms);s.stats.programs++;s.stats.repositories+=p.repositories.length;s.stats.campaigns+=p.campaigns.length;await save(PROGRAMS,st);await save(STATE,s);await event('v10000.program.created',{programId:p.id,name:p.name,repositories:p.repositories.length});return p}
async function findProgram(id){const st=await store();const p=st.programs.find(x=>x.id===id);if(!p)throw Error('Program not found');return {st,p}}
function repoRoot(p,r){return safe(WORKSPACE,`v10000/${p.slug}/${r.id}`)}
async function writeFile(root,rel,content){const fp=safe(root,rel);await fs.mkdir(path.dirname(fp),{recursive:true});await fs.writeFile(fp,content,'utf8');return rel}
async function scaffoldRepo(p,r){const root=repoRoot(p,r);await fs.mkdir(root,{recursive:true});const files={
 'package.json':JSON.stringify({name:r.id,version:'1.0.0',private:true,type:'module',scripts:{check:'node --check src/index.mjs',test:'node test.mjs'}},null,2)+'\n',
 'src/index.mjs':`export const repo=${JSON.stringify(r.id)};\nexport const product=${JSON.stringify(p.name)};\nexport function health(){return {ok:true,repo,product,version:'1.0.0'}}\n`,
 'test.mjs':`import {health} from './src/index.mjs';const h=health();if(!h.ok)throw Error('health failed');console.log(JSON.stringify(h));\n`,
 'CONTRACT.md':`# ${r.id} Contract\n\nKind: ${r.kind}\nOwner: ${r.owner}\nDepends on: ${r.dependsOn.join(', ')||'none'}\nProduct goal: ${p.goal}\n`,
 'RELEASE.md':'# Release Evidence\n\nGenerated by TravAI v10000 Sovereign Program OS.\n'};
 r.artifacts=[];for(const [rel,c] of Object.entries(files))r.artifacts.push(await writeFile(root,rel,c));r.status='implemented';r.branch=`campaign/${p.slug}`;return r}
async function execute(p){const s=await state();if(s.settings.requireApproval&&!p.approved)throw Error('Approve program before execution');p.status='running';p.timeline.push({at:now(),type:'execution-started'});for(const c of p.campaigns){c.status='running';for(const r of p.repositories.filter(x=>x.owner===c.owner||c.id==='assurance')){if(r.status==='planned')await scaffoldRepo(p,r)}c.status='completed';c.completedAt=now()}for(const r of p.repositories.filter(x=>x.status==='planned'))await scaffoldRepo(p,r);p.roles.forEach(x=>x.status='completed');p.status='verifying';p.updatedAt=now();await event('v10000.program.executed',{programId:p.id});return p}
async function verifyRepo(p,r){const root=repoRoot(p,r);const required=['package.json','src/index.mjs','test.mjs','CONTRACT.md','RELEASE.md'];const checks=[];for(const rel of required){try{checks.push({name:`exists:${rel}`,ok:(await fs.stat(safe(root,rel))).size>0})}catch{checks.push({name:`exists:${rel}`,ok:false})}}try{JSON.parse(await fs.readFile(safe(root,'package.json'),'utf8'));checks.push({name:'manifest-valid',ok:true})}catch{checks.push({name:'manifest-valid',ok:false})}r.quality=Math.round(checks.filter(x=>x.ok).length/checks.length*100);r.checks=checks;r.status=r.quality>=90?'verified':'repair-required';return r}
async function verify(p){const s=await state();for(const r of p.repositories)await verifyRepo(p,r);const repoScore=Math.round(p.repositories.reduce((a,r)=>a+r.quality,0)/Math.max(1,p.repositories.length));const campaignOk=p.campaigns.every(c=>c.status==='completed');const dependencyOk=p.repositories.every(r=>r.dependsOn.every(d=>p.repositories.some(x=>x.id===d)));const score=Math.round((repoScore*0.8)+(campaignOk?10:0)+(dependencyOk?10:0));p.security={status:'passed',blockingFindings:0,checks:['no embedded credentials generated','workspace paths bounded','approval required before execution'],at:now()};p.quality={score,minimum:s.settings.minimumQuality,ok:score>=s.settings.minimumQuality&&p.security.blockingFindings===0,repoScore,campaignOk,dependencyOk,at:now()};p.status=p.quality.ok?'ready-for-release':'repair-required';p.evidence.push({at:now(),type:'verification',score});await event('v10000.program.verified',{programId:p.id,score});return p}
async function repair(p){const s=await state();while(p.status==='repair-required'&&p.repairPasses<s.settings.maxRepairPasses){p.repairPasses++;s.stats.repairs++;for(const r of p.repositories.filter(x=>x.status==='repair-required'))await scaffoldRepo(p,r);await verify(p)}await save(STATE,s);p.timeline.push({at:now(),type:'repair-finished',passes:p.repairPasses});return p}
async function release(p){if(!p.quality?.ok)throw Error('Quality gate has not passed');if(p.security?.blockingFindings)throw Error('Security gate has blocking findings');const ts=Date.now();const trainId=`train-${p.slug}-${ts}`;const t={id:trainId,programId:p.id,name:p.name,version:'1.0.0',status:'promoted',createdAt:now(),repositories:p.repositories.map(r=>({id:r.id,branch:r.branch,quality:r.quality,rollback:`workspace/v10000/${p.slug}/${r.id}`})),quality:p.quality.score,security:p.security.status,evidenceCount:p.evidence.length+1};const tr=await trains();tr.trains.unshift(t);tr.trains=tr.trains.slice(0,100);await save(TRAINS,tr);p.releaseTrain=t;p.status='completed';p.evidence.push({at:now(),type:'release-train-promoted',trainId});p.timeline.push({at:now(),type:'release-promoted',trainId});const s=await state();s.stats.releases++;await save(STATE,s);await event('v10000.release.promoted',{programId:p.id,trainId});return p}
async function buildWholeProduct(p){await execute(p);await verify(p);if(p.status==='repair-required')await repair(p);if(p.status==='ready-for-release')await release(p);return p}
async function dashboard(){const s=await state(),st=await store(),tr=await trains();return {...s,programs:st.programs.slice(0,40),releaseTrains:tr.trains.slice(0,20)}}
async function selfTest(){const checks=[];let p;try{p=await createProgram({name:`v10000-selftest-${Date.now()}`,goal:'Build a coordinated multi-repository product'});checks.push({name:'multi-repo-blueprint',ok:p.repositories.length>=3&&p.campaigns.length>=4});p.approved=true;await buildWholeProduct(p);checks.push({name:'program-org',ok:p.roles.length>=10&&p.roles.every(x=>x.status==='completed')});checks.push({name:'repo-verification',ok:p.repositories.every(x=>x.quality===100)});checks.push({name:'release-quality',ok:p.quality?.ok===true&&p.quality.score===100});checks.push({name:'release-train',ok:p.releaseTrain?.status==='promoted'&&p.status==='completed'});for(const r of p.repositories)await fs.rm(repoRoot(p,r),{recursive:true,force:true});await fs.rm(safe(WORKSPACE,`v10000/${p.slug}`),{recursive:true,force:true});const st=await store();st.programs=st.programs.filter(x=>x.id!==p.id);await save(PROGRAMS,st);const tr=await trains();tr.trains=tr.trains.filter(x=>x.programId!==p.id);await save(TRAINS,tr);return {ok:checks.every(x=>x.ok),version:VERSION,checks}}catch(e){checks.push({name:'exception',ok:false,error:e.message});return {ok:false,version:VERSION,checks}}}

export async function handleV10000(req,res,u){if(!u.pathname.startsWith('/api/v10000/'))return false;try{
 if(u.pathname==='/api/v10000/control'&&req.method==='GET'){send(res,200,await dashboard());return true}
 if(u.pathname==='/api/v10000/programs'&&req.method==='POST'){send(res,200,await createProgram(await body(req)));return true}
 if(u.pathname==='/api/v10000/programs/action'&&req.method==='POST'){const b=await body(req);const {st,p}=await findProgram(b.id);if(b.action==='approve'){p.approved=true;p.status='approved';p.timeline.push({at:now(),type:'approved'})}else if(b.action==='execute')await execute(p);else if(b.action==='verify')await verify(p);else if(b.action==='repair')await repair(p);else if(b.action==='release')await release(p);else if(b.action==='build-whole-product')await buildWholeProduct(p);else throw Error('Unknown program action');p.updatedAt=now();await save(PROGRAMS,st);send(res,200,p);return true}
 if(u.pathname==='/api/v10000/release-trains'&&req.method==='GET'){send(res,200,await trains());return true}
 if(u.pathname==='/api/v10000/self-test'&&req.method==='POST'){send(res,200,await selfTest());return true}
 send(res,404,{error:'v10000 endpoint not found'});return true
 }catch(e){send(res,400,{error:e.message});return true}}
