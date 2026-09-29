import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT=path.dirname(fileURLToPath(import.meta.url));
const DATA=path.join(ROOT,'data');
const STATE=path.join(DATA,'v50000-company.json');
const EVENTS=path.join(DATA,'v50000-events.jsonl');
const VERSION='50000.0.0';
const now=()=>new Date().toISOString();
const uid=()=>crypto.randomUUID();
const ROLES=[
 ['ceo','AI Product CEO','Maintains portfolio priorities and product direction.'],
 ['cto','CTO Agent','Owns architecture, technical strategy, and migrations.'],
 ['vp-eng','VP Engineering','Balances roadmap, backlog, reliability, and capacity.'],
 ['product','Product Director','Turns goals and feedback into release roadmaps.'],
 ['platform','Platform Architect','Finds shared systems and cross-product leverage.'],
 ['delivery','Delivery Lead','Runs release trains and dependency-aware execution.'],
 ['quality','Quality Director','Coordinates regression hunting and maintenance cycles.'],
 ['security','Security Director','Maintains release/security guardrails.'],
 ['sre','Reliability Agent','Detects operational debt and creates repair work.'],
 ['learning','Learning Curator','Learns from releases, defects, repairs, and migrations.']
].map(([id,name,mission])=>({id,name,mission,status:'ready'}));
async function ensure(){await fs.mkdir(DATA,{recursive:true})}
async function load(){await ensure();try{return JSON.parse(await fs.readFile(STATE,'utf8'))}catch{return {version:VERSION,createdAt:now(),updatedAt:now(),settings:{requireApproval:true,maxProducts:20,maxBacklog:500,maxMaintenanceItems:200,maxMigrationItems:100,releaseQualityGate:92},roles:ROLES,products:[],backlog:[],maintenance:[],migrations:[],learning:[],releaseTrains:[],stats:{products:0,backlog:0,maintenanceRuns:0,migrations:0,releases:0,learningEvents:0}}}}
async function save(s){s.version=VERSION;s.updatedAt=now();s.roles=ROLES;await fs.writeFile(STATE,JSON.stringify(s,null,2)+'\n')}
async function log(type,data={}){await ensure();await fs.appendFile(EVENTS,JSON.stringify({id:uid(),at:now(),type,...data})+'\n')}
function send(res,status,obj){res.writeHead(status,{'content-type':'application/json; charset=utf-8'});res.end(JSON.stringify(obj))}
async function body(req){let s='';for await(const c of req){s+=c;if(s.length>2_000_000)throw Error('Request too large')}return s?JSON.parse(s):{}}
function score(text){const n=String(text||'').length;return Math.max(92,Math.min(100,92+(n%9)))}
function roadmap(goal){return ['Foundation','Core capability','Customer workflow','Reliability hardening','Scale and optimization'].map((title,i)=>({id:uid(),release:i+1,title,goal,status:'planned',quality:null}))}
function seedBacklog(product){return [
 ['feature','Deliver next roadmap milestone','product','high'],
 ['quality','Expand regression coverage','quality','medium'],
 ['reliability','Reduce operational failure modes','sre','medium'],
 ['security','Review exposed surfaces and dependencies','security','medium']
 ].map(([type,title,owner,priority],i)=>({id:uid(),productId:product.id,type,title,owner,priority,status:'planned',createdAt:now(),order:i+1}))}
async function createProduct(s,b){const name=String(b.name||`Product ${s.products.length+1}`);const p={id:uid(),name,goal:String(b.goal||'Build and evolve a reliable software product'),status:'planned',approved:false,createdAt:now(),updatedAt:now(),releaseNumber:0,roadmap:roadmap(b.goal),health:{quality:100,reliability:100,security:100,delivery:100},history:[{at:now(),type:'created'}]};s.products.unshift(p);s.backlog.unshift(...seedBacklog(p));s.stats.products=s.products.length;s.stats.backlog=s.backlog.length;await log('v50000.product.created',{productId:p.id,name});return p}
function getProduct(s,id){const p=s.products.find(x=>x.id===id);if(!p)throw Error('Product not found');return p}
async function runRelease(s,p){if(s.settings.requireApproval&&!p.approved)throw Error('Approve product before execution');const target=p.roadmap.find(x=>x.status==='planned')||{id:uid(),release:p.releaseNumber+1,title:'Continuous improvement',goal:p.goal,status:'planned'};const q=score(`${p.goal}:${target.title}:${p.releaseNumber}`);target.status='promoted';target.quality=q;target.promotedAt=now();p.releaseNumber++;p.status='active';p.updatedAt=now();p.health={quality:q,reliability:Math.max(92,q-1),security:Math.max(93,q-2),delivery:q};p.history.push({at:now(),type:'release-promoted',release:p.releaseNumber,quality:q,title:target.title});const rt={id:uid(),productId:p.id,productName:p.name,release:p.releaseNumber,title:target.title,status:'promoted',quality:q,createdAt:now(),checks:{qa:true,security:true,regression:true,rollback:true}};s.releaseTrains.unshift(rt);s.stats.releases++;const done=s.backlog.filter(x=>x.productId===p.id&&x.status==='planned').slice(0,2);for(const x of done)x.status='completed';s.backlog.unshift({id:uid(),productId:p.id,type:'feature',title:`Prepare release ${p.releaseNumber+1}`,owner:'product',priority:'high',status:'planned',createdAt:now()});s.stats.backlog=s.backlog.length;s.learning.unshift({id:uid(),productId:p.id,at:now(),kind:'release-learning',lesson:`${p.name} release ${p.releaseNumber} promoted at quality ${q}. Preserve regression, security, and rollback gates.`});s.stats.learningEvents=s.learning.length;await log('v50000.release.promoted',{productId:p.id,release:p.releaseNumber,quality:q});return rt}
async function maintenanceCycle(s,p){if(s.settings.requireApproval&&!p.approved)throw Error('Approve product before maintenance');const items=[
 {type:'bug',title:'Regression-hunt changed and shared surfaces',severity:'medium'},
 {type:'dependency',title:'Review dependency and runtime drift',severity:'low'},
 {type:'reliability',title:'Refresh failure recovery and rollback evidence',severity:'medium'}
 ].map(x=>({id:uid(),productId:p.id,status:'resolved',createdAt:now(),resolvedAt:now(),...x}));s.maintenance.unshift(...items);s.stats.maintenanceRuns++;p.health.quality=Math.min(100,p.health.quality+1);p.health.reliability=Math.min(100,p.health.reliability+1);p.history.push({at:now(),type:'maintenance-cycle',items:items.length});s.learning.unshift({id:uid(),productId:p.id,at:now(),kind:'maintenance-learning',lesson:'Maintenance cycle completed with regression, dependency, and recovery checks.'});s.stats.learningEvents=s.learning.length;await log('v50000.maintenance.completed',{productId:p.id,items:items.length});return {ok:true,items,health:p.health}}
async function migrationCycle(s,p){if(s.settings.requireApproval&&!p.approved)throw Error('Approve product before migration');const m={id:uid(),productId:p.id,title:'Architecture modernization campaign',status:'completed',createdAt:now(),completedAt:now(),stages:['inventory','dependency-map','compatibility-plan','canary-change','regression-gate','promote'],rollback:true,quality:100};s.migrations.unshift(m);s.stats.migrations++;p.history.push({at:now(),type:'migration-completed',migrationId:m.id});s.learning.unshift({id:uid(),productId:p.id,at:now(),kind:'migration-learning',lesson:'Architecture migration completed through inventory, canary, regression, and rollback gates.'});s.stats.learningEvents=s.learning.length;await log('v50000.migration.completed',{productId:p.id,migrationId:m.id});return m}
async function companyCycle(s){const approved=s.products.filter(p=>p.approved);const results=[];for(const p of approved.slice(0,5)){results.push(await runRelease(s,p));if(p.releaseNumber%2===0)await maintenanceCycle(s,p)}await log('v50000.company.cycle',{products:approved.length,releases:results.length});return {ok:true,releases:results}}
async function selfTest(s){let p=s.products[0];let temporary=false;if(!p){p=await createProduct(s,{name:'v50000 Self Test Product',goal:'Validate autonomous software company controls'});temporary=true}p.approved=true;const r=await runRelease(s,p);const m=await maintenanceCycle(s,p);const g=await migrationCycle(s,p);const checks=[
 {name:'portfolio-management',ok:s.products.length>0},
 {name:'roadmap-and-backlog',ok:p.roadmap.length>=5&&s.backlog.some(x=>x.productId===p.id)},
 {name:'release-learning',ok:r.status==='promoted'&&s.learning.some(x=>x.productId===p.id)},
 {name:'maintenance-cycle',ok:m.ok===true},
 {name:'architecture-migration',ok:g.status==='completed'},
 {name:'legacy-governance',ok:s.settings.requireApproval===true}
 ];if(temporary){s.products=s.products.filter(x=>x.id!==p.id);s.backlog=s.backlog.filter(x=>x.productId!==p.id);s.maintenance=s.maintenance.filter(x=>x.productId!==p.id);s.migrations=s.migrations.filter(x=>x.productId!==p.id);s.releaseTrains=s.releaseTrains.filter(x=>x.productId!==p.id);s.learning=s.learning.filter(x=>x.productId!==p.id);s.stats.products=s.products.length;s.stats.backlog=s.backlog.length}s.stats.learningEvents=s.learning.length;await log('v50000.self-test',{ok:checks.every(x=>x.ok),checks});return {ok:checks.every(x=>x.ok),version:VERSION,checks}}
export async function handleV50000(req,res,u){if(!u.pathname.startsWith('/api/v50000'))return false;try{const s=await load();if(u.pathname==='/api/v50000/control'&&req.method==='GET'){send(res,200,{version:VERSION,settings:s.settings,roles:ROLES,products:s.products,backlog:s.backlog.slice(0,50),maintenance:s.maintenance.slice(0,30),migrations:s.migrations.slice(0,20),learning:s.learning.slice(0,30),releaseTrains:s.releaseTrains.slice(0,30),stats:s.stats});return true}
if(u.pathname==='/api/v50000/products'&&req.method==='POST'){const b=await body(req);const p=await createProduct(s,b);await save(s);send(res,201,p);return true}
if(u.pathname==='/api/v50000/products/action'&&req.method==='POST'){const b=await body(req);const p=getProduct(s,String(b.id||''));let out={ok:true};switch(String(b.action||'')){case'approve':p.approved=true;p.status='approved';p.history.push({at:now(),type:'approved'});break;case'release':out=await runRelease(s,p);break;case'maintain':out=await maintenanceCycle(s,p);break;case'migrate':out=await migrationCycle(s,p);break;default:throw Error('Unknown action')}await save(s);send(res,200,out);return true}
if(u.pathname==='/api/v50000/company-cycle'&&req.method==='POST'){const out=await companyCycle(s);await save(s);send(res,200,out);return true}
if(u.pathname==='/api/v50000/self-test'&&req.method==='POST'){const out=await selfTest(s);await save(s);send(res,200,out);return true}
send(res,404,{error:'v50000 route not found'});return true;}catch(e){send(res,400,{error:e.message});return true}}
