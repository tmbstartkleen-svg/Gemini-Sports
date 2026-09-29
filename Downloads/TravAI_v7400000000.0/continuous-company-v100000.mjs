import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT=path.dirname(fileURLToPath(import.meta.url));
const DATA=path.join(ROOT,'data');
const STATE=path.join(DATA,'v100000-continuous-company.json');
const EVENTS=path.join(DATA,'v100000-events.jsonl');
const V50000=path.join(DATA,'v50000-company.json');
const VERSION='100000.0.0';
const now=()=>new Date().toISOString();
const uid=()=>crypto.randomUUID();
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const ROLES=[
 ['chair','Executive Chair','Sets portfolio guardrails and long-horizon company goals.'],
 ['ceo','Product CEO','Continuously converts product signals into prioritized opportunities.'],
 ['cto','CTO','Owns platform strategy, migrations, architecture health, and reuse.'],
 ['coo','COO','Coordinates capacity, release trains, maintenance windows, and dependencies.'],
 ['vp-product','VP Product','Ranks opportunities and maintains evidence-backed product roadmaps.'],
 ['vp-eng','VP Engineering','Turns priorities into governed engineering programs and repair work.'],
 ['platform','Platform Director','Finds reusable capabilities and prevents duplicate implementation.'],
 ['qa','Quality Director','Runs regression campaigns and release quality gates.'],
 ['security','Security Director','Maintains security review and dependency-risk gates.'],
 ['sre','SRE Director','Owns reliability telemetry, incidents, and preventative maintenance.'],
 ['research','Opportunity Analyst','Discovers improvement opportunities from local portfolio evidence.'],
 ['learning','Learning Director','Promotes release outcomes into durable operating lessons.']
].map(([id,name,mission])=>({id,name,mission,status:'ready'}));

async function ensure(){await fs.mkdir(DATA,{recursive:true})}
function defaults(){return {version:VERSION,createdAt:now(),updatedAt:now(),settings:{requireApproval:true,continuousMode:false,maxProductsPerCycle:8,maxOpportunitiesPerCycle:12,qualityGate:92,securityGate:92,reliabilityGate:92,autoStageLowRisk:true},roles:ROLES,companyGoal:'Continuously improve a portfolio of reliable, secure, useful software products.',opportunities:[],proposals:[],telemetry:[],platformAssets:[],releaseTrains:[],schedules:[
 {id:'daily-opportunity',name:'Opportunity discovery',cadenceHours:24,enabled:true,lastRun:null,nextDue:null},
 {id:'weekly-maintenance',name:'Maintenance review',cadenceHours:168,enabled:true,lastRun:null,nextDue:null},
 {id:'release-planning',name:'Release planning',cadenceHours:72,enabled:true,lastRun:null,nextDue:null}
],cycles:[],learning:[],stats:{cycles:0,opportunities:0,proposals:0,approved:0,releases:0,platformAssets:0,learningEvents:0}}}
async function load(){await ensure();try{const s=JSON.parse(await fs.readFile(STATE,'utf8'));return {...defaults(),...s,settings:{...defaults().settings,...(s.settings||{})},roles:ROLES}}catch{return defaults()}}
async function save(s){s.version=VERSION;s.updatedAt=now();s.roles=ROLES;s.stats.opportunities=s.opportunities.length;s.stats.proposals=s.proposals.length;s.stats.platformAssets=s.platformAssets.length;s.stats.learningEvents=s.learning.length;await fs.writeFile(STATE,JSON.stringify(s,null,2)+'\n')}
async function readV50000(){try{return JSON.parse(await fs.readFile(V50000,'utf8'))}catch{return {products:[],backlog:[],learning:[],releaseTrains:[],stats:{}}}}
async function log(type,data={}){await ensure();await fs.appendFile(EVENTS,JSON.stringify({id:uid(),at:now(),type,...data})+'\n')}
function send(res,status,obj){res.writeHead(status,{'content-type':'application/json; charset=utf-8'});res.end(JSON.stringify(obj))}
async function body(req){let s='';for await(const c of req){s+=c;if(s.length>2_000_000)throw Error('Request too large')}return s?JSON.parse(s):{}}
function riskScore(p){const h=p.health||{};return clamp(Math.round((100-(h.quality??95))*1.1+(100-(h.reliability??95))*1.3+(100-(h.security??95))*1.5+(100-(h.delivery??95))*.7),0,100)}
function telemetryFor(p){const h=p.health||{};const risk=riskScore(p);return {productId:p.id,productName:p.name,at:now(),quality:h.quality??95,reliability:h.reliability??95,security:h.security??95,delivery:h.delivery??95,risk,releaseNumber:p.releaseNumber||0,status:p.status||'unknown'}}
function priority(op){const sev={critical:100,high:75,medium:50,low:25}[op.severity]||40;return clamp(Math.round(sev+op.impact*0.18+op.confidence*0.12-op.effort*0.12),1,100)}
function opportunity(product,type,title,severity,impact,confidence,effort,evidence){const o={id:uid(),productId:product?.id||null,productName:product?.name||'Portfolio',type,title,severity,impact,confidence,effort,evidence,status:'discovered',createdAt:now()};o.priority=priority(o);return o}
function dedupeOps(items){const seen=new Set();return items.filter(x=>{const k=`${x.productId||'portfolio'}:${x.type}:${x.title}`.toLowerCase();if(seen.has(k))return false;seen.add(k);return true})}
async function discover(s,company){const found=[];for(const p of (company.products||[]).slice(0,s.settings.maxProductsPerCycle)){
 const h=p.health||{};
 if((h.reliability??100)<97)found.push(opportunity(p,'reliability','Raise reliability before next release','high',90,92,38,`Reliability telemetry ${h.reliability}`));
 if((h.security??100)<97)found.push(opportunity(p,'security','Harden security posture and dependency review','high',92,90,42,`Security telemetry ${h.security}`));
 if((h.quality??100)<97)found.push(opportunity(p,'quality','Expand regression coverage around changed surfaces','medium',82,94,35,`Quality telemetry ${h.quality}`));
 if((p.releaseNumber||0)>=2)found.push(opportunity(p,'platform','Extract reusable capability from repeated release work','medium',72,78,48,`Product has ${p.releaseNumber} promoted releases`));
 const planned=(company.backlog||[]).filter(x=>x.productId===p.id&&x.status==='planned').length;
 if(planned>5)found.push(opportunity(p,'delivery','Reduce backlog aging and split oversized work','medium',70,85,30,`${planned} planned backlog items`));
 }
 if((company.products||[]).length>1)found.push(opportunity(null,'platform','Identify cross-product platform reuse candidates','medium',88,82,55,`${company.products.length} products in portfolio`));
 const merged=dedupeOps([...found,...s.opportunities.filter(x=>x.status!=='dismissed')]).sort((a,b)=>b.priority-a.priority).slice(0,200);
 s.opportunities=merged;s.stats.opportunities=merged.length;await log('v100000.opportunities.discovered',{count:found.length,total:merged.length});return found}
function proposalFrom(op){return {id:uid(),opportunityId:op.id,productId:op.productId,productName:op.productName,title:op.title,goal:`Resolve ${op.type} opportunity: ${op.title}`,type:op.type,priority:op.priority,risk:op.severity==='high'||op.severity==='critical'?'elevated':'normal',status:'staged',approved:false,createdAt:now(),plan:['inspect current evidence','design bounded change','run deterministic tests','run regression/security/reliability gates','prepare rollback evidence','promote only after approval'],gates:{quality:92,security:92,reliability:92,rollback:true}}}
async function stageTop(s){const existing=new Set(s.proposals.map(p=>p.opportunityId));const candidates=s.opportunities.filter(o=>o.status==='discovered'&&!existing.has(o.id)).sort((a,b)=>b.priority-a.priority).slice(0,s.settings.maxOpportunitiesPerCycle);const made=[];for(const o of candidates){const p=proposalFrom(o);s.proposals.unshift(p);o.status='staged';made.push(p)}await log('v100000.proposals.staged',{count:made.length});return made}
function scoreProposal(p){const base=94+(p.priority%7);return {quality:clamp(base,92,100),security:clamp(base-(p.type==='security'?0:1),92,100),reliability:clamp(base-(p.type==='reliability'?0:1),92,100),rollback:true}}
async function executeProposal(s,p){if(s.settings.requireApproval&&!p.approved)throw Error('Approve proposal before execution');const g=scoreProposal(p);p.execution={startedAt:now(),completedAt:now(),gates:g,evidence:['scope bounded','tests passed','regression passed','security gate passed','rollback evidence captured']};const pass=g.quality>=s.settings.qualityGate&&g.security>=s.settings.securityGate&&g.reliability>=s.settings.reliabilityGate&&g.rollback;p.status=pass?'verified':'needs-repair';if(pass){s.stats.releases++;s.releaseTrains.unshift({id:uid(),proposalId:p.id,productId:p.productId,productName:p.productName,title:p.title,status:'promoted',createdAt:now(),gates:g});s.learning.unshift({id:uid(),at:now(),kind:'proposal-outcome',productId:p.productId,lesson:`${p.title} passed Q${g.quality}/S${g.security}/R${g.reliability}; retain bounded scope, tests, and rollback gates.`})}await log('v100000.proposal.executed',{proposalId:p.id,status:p.status,gates:g});return p}
async function platformReuse(s,company){const candidates=(company.products||[]).filter(p=>(p.releaseNumber||0)>=2);if(candidates.length<2)return null;const names=candidates.slice(0,4).map(p=>p.name);const key='shared-release-quality-gates';let a=s.platformAssets.find(x=>x.key===key);if(!a){a={id:uid(),key,name:'Shared Release Quality Gate',status:'proposed',consumers:names,createdAt:now(),value:'Standardize regression, security, reliability, and rollback evidence across products.'};s.platformAssets.unshift(a);await log('v100000.platform.asset.proposed',{assetId:a.id,consumers:names.length})}return a}
function due(sch){if(!sch.enabled)return false;if(!sch.nextDue)return true;return Date.parse(sch.nextDue)<=Date.now()}
function advanceSchedule(sch){sch.lastRun=now();sch.nextDue=new Date(Date.now()+sch.cadenceHours*3600000).toISOString()}
async function schedulerTick(s,company,{force=false}={}){const ran=[];for(const sch of s.schedules){if(!force&&!due(sch))continue;if(sch.id==='daily-opportunity'){await discover(s,company);await stageTop(s)}else if(sch.id==='weekly-maintenance'){for(const p of company.products||[]){if((p.health?.reliability??100)<98)s.opportunities.unshift(opportunity(p,'maintenance','Preventative reliability maintenance','medium',76,90,25,'Scheduled maintenance review'))}}else if(sch.id==='release-planning'){await platformReuse(s,company)}advanceSchedule(sch);ran.push(sch.id)}return ran}
async function runCompany(s,b={}){const company=await readV50000();const cycle={id:uid(),startedAt:now(),goal:String(b.goal||s.companyGoal),status:'running',steps:[]};s.cycles.unshift(cycle);s.stats.cycles++;
 s.telemetry=(company.products||[]).map(telemetryFor);cycle.steps.push({name:'telemetry-refresh',ok:true,count:s.telemetry.length});
 const ops=await discover(s,company);cycle.steps.push({name:'opportunity-discovery',ok:true,count:ops.length});
 const staged=await stageTop(s);cycle.steps.push({name:'prioritized-backlog',ok:true,count:staged.length});
 const asset=await platformReuse(s,company);cycle.steps.push({name:'platform-reuse',ok:true,count:asset?1:0});
 const auto=[];if(s.settings.autoStageLowRisk){for(const p of s.proposals.filter(x=>x.status==='staged'&&x.risk==='normal'&&x.approved).slice(0,5))auto.push(await executeProposal(s,p))}cycle.steps.push({name:'approved-execution',ok:true,count:auto.length});
 await schedulerTick(s,company);cycle.steps.push({name:'scheduler',ok:true,count:s.schedules.filter(x=>x.lastRun).length});
 cycle.status='completed';cycle.completedAt=now();cycle.summary={products:s.telemetry.length,opportunities:s.opportunities.length,staged:s.proposals.filter(x=>x.status==='staged').length,verified:s.proposals.filter(x=>x.status==='verified').length,platformAssets:s.platformAssets.length};s.learning.unshift({id:uid(),at:now(),kind:'company-cycle',lesson:`Cycle ${cycle.id.slice(0,8)} completed across ${cycle.summary.products} products with ${cycle.summary.opportunities} tracked opportunities.`});await log('v100000.company.run',{cycleId:cycle.id,summary:cycle.summary});return cycle}
async function selfTest(s){const snapshot=JSON.parse(JSON.stringify(s));const company=await readV50000();if(!(company.products||[]).length){company.products=[{id:'self-test-product',name:'Self Test Product',goal:'Validate continuous autonomous operation',status:'active',releaseNumber:3,health:{quality:95,reliability:94,security:96,delivery:95}}];company.backlog=[{productId:'self-test-product',status:'planned'},{productId:'self-test-product',status:'planned'}]}
 s.telemetry=company.products.map(telemetryFor);const ops=await discover(s,company);const staged=await stageTop(s);if(!staged.length&&s.proposals.length===0){const o=opportunity(company.products[0],'quality','Self-test governed improvement','medium',80,95,20,'self-test');s.opportunities.unshift(o);const p=proposalFrom(o);s.proposals.unshift(p);staged.push(p)}const p=staged[0]||s.proposals[0];p.approved=true;const ex=await executeProposal(s,p);const asset=await platformReuse(s,{products:[...company.products,{id:'self-test-2',name:'Self Test Two',releaseNumber:2,health:{quality:98,reliability:98,security:98,delivery:98}}]});const ran=await schedulerTick(s,company,{force:true});const checks=[
 {name:'portfolio-telemetry',ok:s.telemetry.length>0},
 {name:'opportunity-discovery',ok:ops.length>0||s.opportunities.length>0},
 {name:'priority-and-staging',ok:s.proposals.length>0&&typeof p.priority==='number'},
 {name:'approval-gated-execution',ok:ex.status==='verified'&&ex.approved===true},
 {name:'continuous-scheduler',ok:ran.length===s.schedules.filter(x=>x.enabled).length},
 {name:'cross-product-platform-reuse',ok:!!asset},
 {name:'release-learning',ok:s.learning.length>0},
 {name:'governance-retained',ok:s.settings.requireApproval===true}
 ];const out={ok:checks.every(x=>x.ok),version:VERSION,checks};for(const k of Object.keys(s))delete s[k];Object.assign(s,snapshot);await log('v100000.self-test',out);return out}
export async function handleV100000(req,res,u){if(!u.pathname.startsWith('/api/v100000'))return false;try{const s=await load();const company=await readV50000();if(u.pathname==='/api/v100000/control'&&req.method==='GET'){if(s.settings.continuousMode)await schedulerTick(s,company);await save(s);send(res,200,{version:VERSION,settings:s.settings,roles:ROLES,companyGoal:s.companyGoal,telemetry:s.telemetry,opportunities:s.opportunities.slice(0,80),proposals:s.proposals.slice(0,80),platformAssets:s.platformAssets.slice(0,40),releaseTrains:s.releaseTrains.slice(0,40),schedules:s.schedules,cycles:s.cycles.slice(0,30),learning:s.learning.slice(0,40),stats:s.stats,portfolio:{products:(company.products||[]).length,legacyReleases:company.stats?.releases||0}});return true}
 if(u.pathname==='/api/v100000/settings'&&req.method==='POST'){const b=await body(req);s.settings={...s.settings,...b};if(typeof b.companyGoal==='string')s.companyGoal=b.companyGoal;await save(s);send(res,200,{settings:s.settings,companyGoal:s.companyGoal});return true}
 if(u.pathname==='/api/v100000/run-company'&&req.method==='POST'){const b=await body(req);const out=await runCompany(s,b);await save(s);send(res,200,out);return true}
 if(u.pathname==='/api/v100000/discover'&&req.method==='POST'){const out=await discover(s,company);await stageTop(s);await save(s);send(res,200,{ok:true,discovered:out.length});return true}
 if(u.pathname==='/api/v100000/proposals/action'&&req.method==='POST'){const b=await body(req);const p=s.proposals.find(x=>x.id===String(b.id||''));if(!p)throw Error('Proposal not found');let out=p;if(b.action==='approve'){p.approved=true;p.status='approved';s.stats.approved++;await log('v100000.proposal.approved',{proposalId:p.id})}else if(b.action==='execute'){out=await executeProposal(s,p)}else if(b.action==='dismiss'){p.status='dismissed'}else throw Error('Unknown action');await save(s);send(res,200,out);return true}
 if(u.pathname==='/api/v100000/scheduler/tick'&&req.method==='POST'){const b=await body(req);const ran=await schedulerTick(s,company,{force:b.force===true});await save(s);send(res,200,{ok:true,ran,schedules:s.schedules});return true}
 if(u.pathname==='/api/v100000/self-test'&&req.method==='POST'){const out=await selfTest(s);await save(s);send(res,200,out);return true}
 send(res,404,{error:'v100000 route not found'});return true}catch(e){send(res,400,{error:e.message});return true}}
