const QUERIES = [
  '"food processing plant" (construction OR expansion OR groundbreaking OR opening) United States',
  '"meat processing plant" (construction OR expansion OR opening) United States',
  '"poultry processing plant" (construction OR expansion OR opening) United States',
  '"dairy plant" (construction OR expansion OR opening) United States',
  '"beverage facility" (construction OR expansion OR opening) United States',
  '"frozen food plant" (construction OR expansion OR opening) United States',
  'site:foodengineeringmag.com plant expansion food facility',
  'site:foodprocessing.com plant expansion food processing',
  'site:businessfacilities.com food manufacturing facility expansion',
  'site:areadevelopment.com food processing facility expansion'
];

const decode = (s='') => s
  .replace(/<!\[CDATA\[|\]\]>/g,'')
  .replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'")
  .replace(/&lt;/g,'<').replace(/&gt;/g,'>');
const text = (block, tag) => decode((block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`,'i'))||[])[1]||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./,''); } catch { return ''; } };
function stageFor(title, description){
  const t=(title+' '+description).toLowerCase();
  if(/groundbreak|breaks ground|under construction|construction begins/.test(t)) return 'Under Construction';
  if(/open(?:s|ed|ing)|operational|production begins/.test(t)) return 'Opening / Operational';
  if(/expand|expansion|adding (a )?line|capital investment/.test(t)) return 'Expansion';
  if(/announce|plan|propos|approved|selects site/.test(t)) return 'Announced / Planned';
  return 'Project Intelligence';
}
function scoreFor(item){
  const t=(item.title+' '+item.description).toLowerCase();
  let n=50;
  if(/under construction|groundbreak|breaks ground/.test(t)) n+=18;
  if(/open(?:s|ed|ing)|production begins/.test(t)) n+=14;
  if(/\$\s?\d+\s?(million|billion)|\d+\s?(million|billion)\s+dollar/.test(t)) n+=10;
  if(/meat|poultry|ready-to-eat|dairy|seafood|frozen/.test(t)) n+=8;
  const age=(Date.now()-new Date(item.date).getTime())/864e5;
  if(Number.isFinite(age)) n+=Math.max(0,12-Math.floor(age/30));
  return Math.min(100,n);
}
function parseRSS(xml, query){
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map((m,i)=>{
    const b=m[1], title=text(b,'title'), link=text(b,'link'), description=text(b,'description'), pub=text(b,'pubDate');
    const item={id:`CONST-${btoa(unescape(encodeURIComponent(link||title))).replace(/[^a-z0-9]/gi,'').slice(0,24)}-${i}`,title,description,link,date:pub?new Date(pub).toISOString():'',source:host(link)||'Public news',query,stage:stageFor(title,description)};
    item.score=scoreFor(item); item.priority=item.score>=85?'Critical':item.score>=70?'High':item.score>=50?'Medium':'Low';
    return item;
  }).filter(x=>x.title&&x.link);
}
export async function onRequestGet(){
  const settled=await Promise.allSettled(QUERIES.map(async q=>{
    const url='https://news.google.com/rss/search?q='+encodeURIComponent(q)+'&hl=en-US&gl=US&ceid=US:en';
    const r=await fetch(url,{headers:{'User-Agent':'Santera-Construction-Intelligence/0.2'},cf:{cacheTtl:1800,cacheEverything:true}});
    if(!r.ok) throw new Error(String(r.status));
    return parseRSS(await r.text(),q);
  }));
  const dedupe=new Map();
  for(const s of settled) if(s.status==='fulfilled') for(const item of s.value){
    const key=item.title.toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,100);
    if(!dedupe.has(key)) dedupe.set(key,item);
  }
  const results=[...dedupe.values()].sort((a,b)=>(b.score-a.score)||String(b.date).localeCompare(String(a.date))).slice(0,200);
  return Response.json({results,updated_at:new Date().toISOString(),source_method:'Public news RSS aggregation',coverage_note:'Nationwide public-announcement discovery; verify project details at the linked source.'},{headers:{'Cache-Control':'public, max-age=1800','Access-Control-Allow-Origin':'*'}});
}
