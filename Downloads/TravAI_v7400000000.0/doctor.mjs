import http from 'node:http';
const base=process.env.TRAVAI_URL||process.env.TRAVIS_AI_URL||'http://127.0.0.1:4783';
const checks=['/api/health','/api/mission/summary','/api/executive','/api/command-intelligence','/api/workstation','/api/cognitive','/api/chief-of-staff','/api/learning','/api/projects/portfolio','/api/projects/context','/api/workstation/capabilities','/api/work-queue','/api/mission-portfolio','/api/project-memory-graph','/api/command-deck','/api/forge','/api/programs','/api/project-brain','/api/improvement','/api/release-gate','/api/portfolio-os','/api/portfolio-os/graph','/api/portfolio-os/ledger','/api/project-contracts','/api/release-trains','/api/engineering-lab','/api/evidence-bundles','/api/nexus','/api/campaigns','/api/portfolio/dependencies','/api/proof-index','/api/reliability','/api/architect','/api/specs','/api/traceability','/api/code-intelligence','/api/security-audit','/api/release-board','/api/constellation','/api/constellation/workspaces','/api/constellation/provenance','/api/constellation/governance','/api/v1000/control','/api/v1000/memory-graph'];
let failed=0;
for(const p of checks){
  await new Promise(resolve=>{
    const req=http.get(base+p,r=>{let b='';r.on('data',d=>b+=d);r.on('end',()=>{const ok=r.statusCode>=200&&r.statusCode<300;console.log(`${ok?'PASS':'FAIL'} ${p} -> ${r.statusCode}`);if(!ok)failed++;resolve()})});
    req.setTimeout(10000,()=>req.destroy(new Error('timeout')));
    req.on('error',e=>{failed++;console.error(`FAIL ${p} -> ${e.message}`);resolve()});
  });
}
if(failed){console.error(`Doctor failed: ${failed} check(s) failed.`);process.exitCode=1}else console.log(`Doctor passed: ${checks.length}/${checks.length} checks healthy.`);
