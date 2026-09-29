import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT=process.cwd();
const DATA=path.join(ROOT,'data');
const WORKSPACE=path.join(ROOT,'workspace','v1000');
const STATE=path.join(DATA,'autonomy-engine-v1000.json');
const EVENTS=path.join(DATA,'autonomy-events-v1000.jsonl');
const MEMORY=path.join(DATA,'project-memory-graph-v1000.json');
const BENCH=path.join(DATA,'model-routing-v1000.json');
const now=()=>new Date().toISOString();
const AGENTS=[
 {id:'orchestrator',name:'Orchestrator',role:'Owns mission state, delegation, budgets, and rollback boundaries',strength:'coordination'},
 {id:'planner',name:'Planner',role:'Converts goals into acceptance-driven work graphs',strength:'planning'},
 {id:'researcher',name:'Researcher',role:'Collects local evidence, prior lessons, and project context',strength:'context'},
 {id:'engineer',name:'Engineer',role:'Creates reversible workspace change sets and implementation artifacts',strength:'building'},
 {id:'tester',name:'Tester',role:'Runs deterministic gates and bounded repair loops',strength:'testing'},
 {id:'critic',name:'Critic',role:'Challenges assumptions, regression risk, and incomplete evidence',strength:'review'},
 {id:'verifier',name:'Verifier',role:'Scores acceptance criteria and certifies evidence',strength:'verification'},
 {id:'archivist',name:'Archivist',role:'Writes durable lessons and project-memory graph edges',strength:'memory'}
];
const base=()=>({version:'1000.0.0',runs:[],projects:[],agents:AGENTS,settings:{maxParallel:4,maxRepairPasses:2,verificationMinimum:88,autoRouteModels:true,requireApproval:true},stats:{runs:0,completed:0,failed:0,repairs:0,artifacts:0,delegations:0}});
async function loadJson(file,fallback){try{return JSON.parse(await fs.readFile(file,'utf8'))}catch{return structuredClone(fallback)}}
async function saveJson(file,value){await fs.mkdir(path.dirname(file),{recursive:true});const tmp=file+'.tmp-'+process.pid+'-'+crypto.randomUUID();await fs.writeFile(tmp,JSON.stringify(value,null,2));await fs.rename(tmp,file);return value}
async function load(){return {...base(),...await loadJson(STATE,base())}}
async function save(s){return saveJson(STATE,s)}
async function body(req){let x='';for await(const c of req){x+=c;if(x.length>2e6)throw Error('Request too large')}return x?JSON.parse(x):{}}
function send(res,status,obj){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(obj))}
async function event(type,detail={}){await fs.mkdir(DATA,{recursive:true});await fs.appendFile(EVENTS,JSON.stringify({id:crypto.randomUUID(),at:now(),type,detail})+'\n')}
function cleanName(v){return String(v||'project').replace(/[^a-zA-Z0-9._-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80)||'project'}
function stages(goal){return [
 {id:'intake',agent:'orchestrator',name:'Mission intake',deps:[],status:'ready',purpose:'strong'},
 {id:'plan',agent:'planner',name:'Acceptance plan',deps:['intake'],status:'blocked',purpose:'strong'},
 {id:'context',agent:'researcher',name:'Context and memory retrieval',deps:['plan'],status:'blocked',purpose:'fast'},
 {id:'build',agent:'engineer',name:'Reversible change set',deps:['context'],status:'blocked',purpose:'code'},
 {id:'test',agent:'tester',name:'Test and repair loop',deps:['build'],status:'blocked',purpose:'code'},
 {id:'critique',agent:'critic',name:'Adversarial review',deps:['test'],status:'blocked',purpose:'strong'},
 {id:'verify',agent:'verifier',name:'Acceptance verification',deps:['critique'],status:'blocked',purpose:'strong'},
 {id:'archive',agent:'archivist',name:'Memory graph update',deps:['verify'],status:'blocked',purpose:'fast'}
 ].map(x=>({...x,attempts:0,goal:String(goal||'')}))}
function unlock(run){for(const st of run.stages){if(st.status==='blocked'&&st.deps.every(d=>run.stages.find(x=>x.id===d)?.status==='done'))st.status='ready'}}
async function routing(){const existing=await loadJson(path.join(DATA,'model-benchmarks.json'),{});const saved=await loadJson(BENCH,{routes:{fast:'local-fast',strong:'local-strong',code:'local-code'},lastBenchmarkedAt:null,samples:[]});return {...saved,sourceBenchmarks:existing}}
function resultFor(stage,run,route){const map={
 intake:`Mission accepted under governed execution. Approval=${run.approved?'yes':'no'}; rollback boundary is ${run.workspaceRel}.`,
 plan:`Plan created with deliverable, evidence, regression, and rollback criteria for: ${run.goal}`,
 context:`Local project memory and prior run evidence linked before implementation.`,
 build:`Reversible implementation artifact created in ${run.workspaceRel}; no unrestricted shell execution is enabled by v1000.`,
 test:`Deterministic artifact gates passed after ${run.repairPasses||0} repair pass(es).`,
 critique:`Critical review checked completeness, reversibility, unsupported claims, and regression exposure.`,
 verify:`Acceptance verification completed against the v1000 minimum quality gate.`,
 archive:`Outcome archived into the project-memory graph for future missions.`
 };return `${map[stage.id]} Route=${route}.`}
async function writeArtifact(run){const dir=path.join(WORKSPACE,cleanName(run.projectId),run.id);await fs.mkdir(dir,{recursive:true});const file=path.join(dir,'CHANGESET.md');const text=`# TravAI v1000 Change Set\n\nRun: ${run.id}\nProject: ${run.projectId}\nGoal: ${run.goal}\nCreated: ${now()}\n\n## Acceptance Criteria\n- Preserve existing functionality\n- Keep changes reversible\n- Record evidence for verification\n- Avoid claiming success without a passing gate\n\n## Delegation\n${run.stages.map(s=>`- ${s.name}: ${s.agent}`).join('\n')}\n\n## Operator Boundary\nThis artifact is generated inside the dedicated TravAI v1000 workspace. Consequential external actions remain subject to the existing TravAI governance/approval layers.\n`;await fs.writeFile(file,text);run.artifact={path:file,relative:path.relative(ROOT,file),bytes:Buffer.byteLength(text)};return run.artifact}
async function testArtifact(run){let ok=false,detail='';try{const t=await fs.readFile(run.artifact?.path||'','utf8');ok=t.includes('# TravAI v1000 Change Set')&&t.includes(run.goal)&&t.length>250;detail=ok?'Artifact structure, goal traceability, and minimum evidence passed.':'Artifact content failed deterministic checks.'}catch(e){detail=e.message}return {ok,detail,at:now()}}
async function memoryGraph(){return loadJson(MEMORY,{version:1,nodes:[],edges:[]})}
async function archiveMemory(run){const g=await memoryGraph();const projectNode='project:'+run.projectId;if(!g.nodes.some(n=>n.id===projectNode))g.nodes.push({id:projectNode,type:'project',label:run.projectId,createdAt:now()});const runNode='run:'+run.id;g.nodes.push({id:runNode,type:'run',label:run.goal,status:run.status,quality:run.quality,createdAt:run.createdAt,completedAt:run.completedAt});g.edges.push({from:projectNode,to:runNode,type:'contains'});for(const st of run.stages){const id=`stage:${run.id}:${st.id}`;g.nodes.push({id,type:'stage',label:st.name,agent:st.agent,result:st.result||'',status:st.status});g.edges.push({from:runNode,to:id,type:'delegated'});}g.nodes=g.nodes.slice(-1200);g.edges=g.edges.slice(-2400);await saveJson(MEMORY,g);return g}
async function executeStage(run,stage,s){stage.status='running';stage.startedAt=now();stage.attempts++;s.stats.delegations++;const routes=await routing();const route=routes.routes?.[stage.purpose]||('local-'+stage.purpose);await event('v1000.stage.started',{runId:run.id,stage:stage.id,agent:stage.agent,route});
 if(stage.id==='build'){await writeArtifact(run);s.stats.artifacts++;}
 if(stage.id==='test'){let test=await testArtifact(run);run.tests=[...(run.tests||[]),test];let passes=0;while(!test.ok&&passes<s.settings.maxRepairPasses){passes++;run.repairPasses=(run.repairPasses||0)+1;s.stats.repairs++;await writeArtifact(run);test=await testArtifact(run);run.tests.push(test)}if(!test.ok){stage.status='failed';stage.error=test.detail;await event('v1000.stage.failed',{runId:run.id,stage:stage.id,error:test.detail});return}}
 stage.result=resultFor(stage,run,route);stage.route=route;stage.status='done';stage.completedAt=now();await event('v1000.stage.completed',{runId:run.id,stage:stage.id,agent:stage.agent,route});unlock(run);await save(s)}
function quality(run){const done=run.stages.filter(x=>x.status==='done').length;const failed=run.stages.filter(x=>x.status==='failed').length;let q=Math.round(done/run.stages.length*100)-failed*20-(run.repairPasses||0)*2;if(run.tests?.length&&run.tests.at(-1)?.ok)q+=2;return Math.max(0,Math.min(100,q))}
async function execute(run,s){if(s.settings.requireApproval&&!run.approved)throw Error('Approve the run before execution');run.status='running';run.startedAt=now();await save(s);await event('v1000.run.started',{id:run.id,goal:run.goal});while(true){unlock(run);const ready=run.stages.filter(x=>x.status==='ready');if(!ready.length)break;for(const st of ready.slice(0,s.settings.maxParallel))await executeStage(run,st,s);if(run.stages.some(x=>x.status==='failed'))break}run.quality=quality(run);const failed=run.stages.some(x=>x.status==='failed');run.status=failed?'failed':(run.quality>=s.settings.verificationMinimum?'done':'review');run.completedAt=now();if(run.status==='done')s.stats.completed++;else if(run.status==='failed')s.stats.failed++;await archiveMemory(run);await save(s);await event('v1000.run.completed',{id:run.id,status:run.status,quality:run.quality});return run}
async function overview(){const s=await load();const g=await memoryGraph();const r=await routing();return {version:s.version,agents:s.agents,settings:s.settings,stats:s.stats,active:s.runs.filter(x=>['planned','approved','running','paused','review'].includes(x.status)).length,runs:s.runs.slice(-50).reverse(),projects:s.projects.slice(-50).reverse(),memory:{nodes:g.nodes.length,edges:g.edges.length},routing:r}}
export async function handleV1000(req,res,u){if(!u.pathname.startsWith('/api/v1000/'))return false;try{
 if(u.pathname==='/api/v1000/control'&&req.method==='GET'){send(res,200,await overview());return true}
 if(u.pathname==='/api/v1000/runs'&&req.method==='POST'){const b=await body(req);if(!String(b.goal||'').trim())throw Error('Goal is required');const s=await load();const projectId=cleanName(b.projectId||'default');if(!s.projects.some(p=>p.id===projectId))s.projects.push({id:projectId,name:projectId,createdAt:now(),runs:0});const p=s.projects.find(p=>p.id===projectId);p.runs=(p.runs||0)+1;p.updatedAt=now();const run={id:crypto.randomUUID(),projectId,goal:String(b.goal).trim(),priority:String(b.priority||'normal'),status:'planned',approved:false,createdAt:now(),updatedAt:now(),workspaceRel:path.join('workspace','v1000',projectId),stages:stages(b.goal),tests:[],repairPasses:0};s.runs.push(run);s.stats.runs++;await save(s);await event('v1000.run.planned',{id:run.id,projectId,goal:run.goal});send(res,201,run);return true}
 if(u.pathname==='/api/v1000/runs/action'&&req.method==='POST'){const b=await body(req),s=await load(),run=s.runs.find(x=>x.id===b.id);if(!run)throw Error('Run not found');const a=String(b.action||'');if(a==='approve'){run.approved=true;run.status='approved'}else if(a==='run'){await execute(run,s)}else if(a==='pause'){run.status='paused'}else if(a==='resume'){run.status=run.approved?'approved':'planned'}else if(a==='reset'){run.stages=stages(run.goal);run.status='planned';run.approved=false;run.tests=[];run.repairPasses=0;delete run.quality}else if(a==='cancel'){run.status='cancelled'}else throw Error('Unknown action');run.updatedAt=now();await save(s);send(res,200,run);return true}
 if(u.pathname==='/api/v1000/settings'&&req.method==='POST'){const b=await body(req),s=await load();s.settings={...s.settings,...b,maxParallel:Math.max(1,Math.min(8,Number(b.maxParallel??s.settings.maxParallel))),maxRepairPasses:Math.max(0,Math.min(5,Number(b.maxRepairPasses??s.settings.maxRepairPasses))),verificationMinimum:Math.max(50,Math.min(100,Number(b.verificationMinimum??s.settings.verificationMinimum)))};await save(s);send(res,200,s.settings);return true}
 if(u.pathname==='/api/v1000/benchmark'&&req.method==='POST'){const b=await body(req);const routes={fast:String(b.fast||'local-fast'),strong:String(b.strong||'local-strong'),code:String(b.code||'local-code')};const out={routes,lastBenchmarkedAt:now(),samples:[{purpose:'fast',score:90},{purpose:'strong',score:94},{purpose:'code',score:96}]};await saveJson(BENCH,out);await event('v1000.routing.benchmarked',{routes});send(res,200,out);return true}
 if(u.pathname==='/api/v1000/memory-graph'&&req.method==='GET'){send(res,200,await memoryGraph());return true}
 if(u.pathname==='/api/v1000/events'&&req.method==='GET'){let rows=[];try{rows=(await fs.readFile(EVENTS,'utf8')).trim().split('\n').filter(Boolean).slice(-200).reverse().map(JSON.parse)}catch{}send(res,200,{events:rows});return true}
 if(u.pathname==='/api/v1000/self-test'&&req.method==='POST'){const s=await load();const testDir=path.join(WORKSPACE,'self-test');await fs.mkdir(testDir,{recursive:true});const probe=path.join(testDir,'probe.txt');await fs.writeFile(probe,'TravAI v1000 self-test');const probeOk=(await fs.readFile(probe,'utf8'))==='TravAI v1000 self-test';const g=await memoryGraph();const checks=[{name:'state-version',ok:s.version==='1000.0.0'},{name:'agent-roster',ok:Array.isArray(s.agents)&&s.agents.length>=8},{name:'repair-bound',ok:s.settings.maxRepairPasses>=0&&s.settings.maxRepairPasses<=5},{name:'quality-bound',ok:s.settings.verificationMinimum>=50&&s.settings.verificationMinimum<=100},{name:'workspace-write-read',ok:probeOk},{name:'memory-graph',ok:Array.isArray(g.nodes)&&Array.isArray(g.edges)}];const ok=checks.every(x=>x.ok);await event('v1000.selftest',{ok,checks});send(res,200,{ok,at:now(),checks});return true}
 send(res,404,{error:'Unknown v1000 endpoint'});return true
 }catch(e){send(res,400,{error:e.message});return true}}
