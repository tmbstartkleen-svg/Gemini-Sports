const START_DATE = '20260301';
const USDA_PAGE_ENDPOINT = 'https://r.jina.ai/https://www.fsis.usda.gov/recalls';

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

const json = (data, status = 200) =>
  Response.json(data, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8'
    }
  });

const clean = value => String(value ?? '').trim();

const cleanDate = value => {
  const text = clean(value);
  const compactMatch = text.match(/\b(20\d{2})[-/]?(\d{2})[-/]?(\d{2})\b/);

  if (compactMatch) {
    return `${compactMatch[1]}${compactMatch[2]}${compactMatch[3]}`;
  }

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    const year = parsed.getUTCFullYear();
    const month = String(parsed.getUTCMonth() + 1).padStart(2, '0');
    const day = String(parsed.getUTCDate()).padStart(2, '0');
    return `${year}${month}${day}`;
  }

  return '';
};

const slug = value =>
  clean(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120);

const stableId = (prefix, ...parts) =>
  `${prefix}-${slug(parts.filter(Boolean).join('-')) || crypto.randomUUID()}`;

const priority = score =>
  score >= 85 ? 'Critical' :
  score >= 70 ? 'High' :
  score >= 50 ? 'Medium' :
  'Low';

function scoreRecall(record) {
  let score = 30;
  const text = `${record.reason || ''} ${record.product || ''}`.toLowerCase();

  if (/class i\b/i.test(record.classification || '')) score += 30;
  else if (/class ii\b/i.test(record.classification || '')) score += 15;

  if (/listeria|salmonella|e\.?\s?coli|pathogen|contaminat/.test(text)) score += 22;
  if (/foreign material|metal|glass|plastic/.test(text)) score += 12;
  if (/undeclared|allergen|misbrand/.test(text)) score += 8;

  const date = cleanDate(record.date);

  if (date) {
    const eventDate = new Date(`${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T12:00:00Z`);
    const age = (Date.now() - eventDate.getTime()) / 864e5;

    if (Number.isFinite(age)) {
      score += Math.max(0, 15 - Math.floor(age / 7));
    }
  }

  return Math.min(100, score);
}

function normalizeFDA(record) {
  const firm = clean(record.recalling_firm) || 'Unknown FDA firm';
  const city = clean(record.city) || 'Unknown city';
  const state = clean(record.state);
  const date = cleanDate(record.report_date || record.recall_initiation_date);
  const recallNumber = clean(record.recall_number);
  const eventId = clean(record.event_id);

  const item = {
    id: stableId('FDA', recallNumber || eventId, firm, date),
    source: 'FDA',
    recall_number: recallNumber,
    event_id: eventId,
    firm,
    address: clean(record.address_1) || 'Address not published',
    city,
    state,
    date,
    classification: clean(record.classification) || 'Unclassified',
    product: clean(record.product_description) || 'Food product',
    reason: clean(record.reason_for_recall),
    url: 'https://www.accessdata.fda.gov/scripts/ires/index.cfm#/',
    raw: record
  };

  item.score = scoreRecall(item);
  item.priority = priority(item.score);
  return item;
}

function extractUSDARecallNumber(text = '') {
  const match = clean(text).match(/\b(?:PHA-\d{8}-\d{2}|\d{3}-\d{4}(?:-EXP)?)\b/i);
  return match ? match[0].toUpperCase() : '';
}

function extractUSDADate(text = '') {
  const patterns = [
    /\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\s+[A-Z][a-z]{2}\s+\d{1,2},\s+20\d{2}\b/,
    /\b[A-Z][a-z]+\s+\d{1,2},\s+20\d{2}\b/,
    /\b\d{1,2}\/\d{1,2}\/20\d{2}\b/
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return cleanDate(match[0]);
  }

  return '';
}

function extractUSDAClassification(text = '') {
  const match = text.match(/\b(?:High|Low)\s*-\s*Class\s+(?:I|II|III|IV|V|VI|VII|VIII|IX|X)\b/i);
  if (match) return clean(match[0]);
  if (/public health alert/i.test(text)) return 'Public Health Alert';
  return 'FSIS Alert';
}

function extractUSDAHazard(text = '') {
  const hazards = [
    'Product Contamination',
    'Unreported Allergens',
    'Misbranding',
    'Foreign Material',
    'Processing Defect',
    'Produced Without Benefit of Inspection'
  ];

  return hazards.find(hazard => text.toLowerCase().includes(hazard.toLowerCase())) || '';
}

function extractUSDAURL(text = '') {
  const links = [...text.matchAll(/\((https:\/\/www\.fsis\.usda\.gov\/[^)]+)\)/gi)];
  const match = links.find(item => /recalls-alerts|recall|public-health-alert/i.test(item[1]));
  return match?.[1] || 'https://www.fsis.usda.gov/recalls';
}

function extractUSDATitle(text = '') {
  const lines = text.split('\n').map(clean).filter(Boolean);
  const line = lines.find(value => {
    const lower = value.toLowerCase();
    return lower.includes('recalls') || lower.includes('public health alert');
  });

  if (line) {
    return line.replace(/^\[[^\]]+\]\([^)]+\)\s*/, '').replace(/^#+\s*/, '').trim();
  }

  return 'USDA FSIS Recall or Public Health Alert';
}

function extractUSDAFirm(title = '', text = '') {
  const recallMatch = title.match(/^(.+?)\s+Recalls\b/i);
  if (recallMatch) return clean(recallMatch[1]);

  const alertMatch = title.match(/^FSIS Issues Public Health Alert for (.+?) Product/i);
  if (alertMatch) return clean(alertMatch[1]);

  const establishmentMatch = text.match(/(?:company|establishment|firm)\s+([A-Z][^,\n.]{2,100})/i);
  return establishmentMatch ? clean(establishmentMatch[1]) : 'USDA FSIS Alert';
}

function parseUSDAPage(text = '') {
  const blocks = text
    .split(/(?=\b(?:PHA-\d{8}-\d{2}|\d{3}-\d{4}(?:-EXP)?)\b)/gi)
    .map(clean)
    .filter(block => block.length > 60);

  const seen = new Set();
  const results = [];

  for (const block of blocks) {
    const recallNumber = extractUSDARecallNumber(block);
    if (!recallNumber || seen.has(recallNumber)) continue;

    const date = extractUSDADate(block);
    if (!date || date < START_DATE) continue;

    const title = extractUSDATitle(block);
    const firm = extractUSDAFirm(title, block);
    const classification = extractUSDAClassification(block);
    const hazard = extractUSDAHazard(block);
    const url = extractUSDAURL(block);

    const item = {
      id: stableId('USDA', recallNumber),
      source: 'USDA',
      recall_number: recallNumber,
      event_id: recallNumber,
      firm,
      address: 'Address not published',
      city: 'Unknown city',
      state: '',
      date,
      classification,
      product: title || 'Meat, poultry, or egg product',
      reason: hazard || clean(block.slice(0, 2500)),
      url,
      raw: {
        recall_number: recallNumber,
        title,
        classification,
        text: block
      }
    };

    item.score = scoreRecall(item);
    item.priority = priority(item.score);
    results.push(item);
    seen.add(recallNumber);
  }

  return results.sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

const decode = (value = '') => value
  .replace(/<!\[CDATA\[|\]\]>/g, '')
  .replace(/&amp;/g, '&')
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'")
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>');

const xmlText = (block, tag) =>
  decode((block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i')) || [])[1] || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const host = url => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

function projectStage(title, description) {
  const text = `${title} ${description}`.toLowerCase();
  if (/groundbreak|breaks ground|under construction|construction begins/.test(text)) return 'Under Construction';
  if (/open(?:s|ed|ing)|operational|production begins/.test(text)) return 'Opening / Operational';
  if (/expand|expansion|adding (a )?line|capital investment/.test(text)) return 'Expansion';
  if (/announce|plan|propos|approved|selects site/.test(text)) return 'Announced / Planned';
  return 'Project Intelligence';
}

function projectScore(item) {
  const text = `${item.title} ${item.description}`.toLowerCase();
  let score = 50;

  if (/under construction|groundbreak|breaks ground/.test(text)) score += 18;
  if (/open(?:s|ed|ing)|production begins/.test(text)) score += 14;
  if (/\$\s?\d+\s?(million|billion)|\d+\s?(million|billion)\s+dollar/.test(text)) score += 10;
  if (/meat|poultry|ready-to-eat|dairy|seafood|frozen/.test(text)) score += 8;

  const age = (Date.now() - new Date(item.date).getTime()) / 864e5;
  if (Number.isFinite(age)) score += Math.max(0, 12 - Math.floor(age / 30));

  return Math.min(100, score);
}

function parseRSS(xml) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)]
    .map(match => {
      const block = match[1];
      const title = xmlText(block, 'title');
      const link = xmlText(block, 'link');
      const description = xmlText(block, 'description');
      const published = xmlText(block, 'pubDate');

      const item = {
        id: stableId('CONST', link || title),
        title,
        description,
        link,
        date: published ? new Date(published).toISOString() : '',
        source: host(link) || 'Public news'
      };

      item.stage = projectStage(title, description);
      item.score = projectScore(item);
      item.priority = priority(item.score);
      return item;
    })
    .filter(item => item.title && item.link);
}

async function fetchFDA() {
  const url = `https://api.fda.gov/food/enforcement.json?search=report_date:[${START_DATE}+TO+99991231]&sort=report_date:desc&limit=1000`;
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Santera-Food-Facility-Intelligence/1.0' }
  });

  if (!response.ok) throw new Error(`FDA ${response.status}`);
  return (await response.json()).results?.map(normalizeFDA) || [];
}

async function fetchUSDA() {
  const response = await fetch(USDA_PAGE_ENDPOINT, {
    headers: {
      Accept: 'text/plain',
      'User-Agent': 'Santera-Food-Facility-Intelligence/3.0'
    }
  });

  if (!response.ok) throw new Error(`USDA reader ${response.status}`);
  return parseUSDAPage(await response.text());
}

async function fetchConstruction() {
  const settled = await Promise.allSettled(
    QUERIES.map(async query => {
      const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Santera-Construction-Intelligence/0.3' }
      });

      if (!response.ok) throw new Error(`RSS ${response.status}`);
      return parseRSS(await response.text());
    })
  );

  const dedupe = new Map();

  for (const result of settled) {
    if (result.status !== 'fulfilled') continue;

    for (const item of result.value) {
      const key = slug(item.title).slice(0, 100);
      if (!dedupe.has(key)) dedupe.set(key, item);
    }
  }

  return [...dedupe.values()]
    .sort((a, b) => (b.score - a.score) || String(b.date).localeCompare(String(a.date)))
    .slice(0, 250);
}

async function upsertFacility(db, item) {
  const id = stableId('FAC', item.firm, item.city, item.state);
  const now = new Date().toISOString();

  await db.prepare(`
    INSERT INTO facilities (
      id,name,parent,address,city,state,phone,website,lat,lng,priority,status,
      category,products,employees,establishment_number,notes,source_url,created_at,updated_at
    )
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET
      name=excluded.name,
      address=CASE WHEN facilities.address='' OR facilities.address='Address not published' THEN excluded.address ELSE facilities.address END,
      city=CASE WHEN facilities.city='' OR facilities.city='Unknown city' THEN excluded.city ELSE facilities.city END,
      state=CASE WHEN facilities.state='' THEN excluded.state ELSE facilities.state END,
      priority=CASE
        WHEN excluded.priority='Critical'
          OR (excluded.priority='High' AND facilities.priority NOT IN ('Critical'))
        THEN excluded.priority
        ELSE facilities.priority
      END,
      products=CASE WHEN length(excluded.products)>length(facilities.products) THEN excluded.products ELSE facilities.products END,
      source_url=excluded.source_url,
      updated_at=excluded.updated_at
  `)
    .bind(
      id,item.firm,'',item.address || 'Address not published',item.city || 'Unknown city',item.state || '',
      '','',null,null,item.priority,'Auto-imported lead',item.source,item.product || '',null,'',
      'Automatically imported from official recall data.',item.url || '',now,now
    )
    .run();

  return id;
}

async function findExistingRecallId(db, item) {
  const source = clean(item.source).toUpperCase();
  const recallNumber = clean(item.recall_number).toUpperCase();
  const eventId = clean(item.event_id).toUpperCase();
  const firmName = clean(item.firm).toUpperCase();
  const reportDate = clean(item.date);
  const product = clean(item.product).toUpperCase();

  if (recallNumber) {
    const existing = await db.prepare(`
      SELECT id FROM recall_events
      WHERE UPPER(TRIM(source)) = ?
        AND UPPER(TRIM(COALESCE(recall_number, ''))) = ?
      LIMIT 1
    `).bind(source, recallNumber).first();

    if (existing?.id) return existing.id;
  }

  if (eventId) {
    const existing = await db.prepare(`
      SELECT id FROM recall_events
      WHERE UPPER(TRIM(source)) = ?
        AND UPPER(TRIM(COALESCE(event_id, ''))) = ?
      LIMIT 1
    `).bind(source, eventId).first();

    if (existing?.id) return existing.id;
  }

  const fallback = await db.prepare(`
    SELECT id FROM recall_events
    WHERE UPPER(TRIM(source)) = ?
      AND UPPER(TRIM(COALESCE(firm_name, ''))) = ?
      AND TRIM(COALESCE(report_date, '')) = ?
      AND UPPER(TRIM(COALESCE(product, ''))) = ?
    LIMIT 1
  `).bind(source, firmName, reportDate, product).first();

  return fallback?.id || null;
}

async function saveRecall(db, item, facilityId) {
  const now = new Date().toISOString();
  const source = clean(item.source).toUpperCase();
  const recallNumber = clean(item.recall_number).toUpperCase();
  const existingId = await findExistingRecallId(db, item);
  const recordId = existingId || item.id;

  if (recallNumber) {
    await db.prepare(`
      DELETE FROM recall_events
      WHERE UPPER(TRIM(source)) = ?
        AND UPPER(TRIM(COALESCE(recall_number, ''))) = ?
        AND id <> ?
    `).bind(source, recallNumber, recordId).run();
  }

  await db.prepare(`
    INSERT INTO recall_events (
      id,facility_id,source,recall_number,event_id,firm_name,city,state,report_date,
      classification,product,reason,source_url,priority,score,raw_json,created_at,updated_at
    )
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET
      facility_id=excluded.facility_id,
      source=excluded.source,
      recall_number=excluded.recall_number,
      event_id=excluded.event_id,
      firm_name=excluded.firm_name,
      city=excluded.city,
      state=excluded.state,
      report_date=excluded.report_date,
      classification=excluded.classification,
      product=excluded.product,
      reason=excluded.reason,
      source_url=excluded.source_url,
      priority=excluded.priority,
      score=excluded.score,
      raw_json=excluded.raw_json,
      updated_at=excluded.updated_at
  `)
    .bind(
      recordId,facilityId,source,recallNumber,clean(item.event_id),clean(item.firm),clean(item.city),
      clean(item.state),clean(item.date),clean(item.classification),clean(item.product),clean(item.reason),
      clean(item.url),clean(item.priority),Number(item.score || 0),JSON.stringify(item.raw || item),now,now
    )
    .run();
}

async function saveProject(db, item) {
  const now = new Date().toISOString();
  const existing = await db.prepare(`
    SELECT id FROM construction_projects
    WHERE LOWER(TRIM(source_url)) = LOWER(TRIM(?))
       OR LOWER(TRIM(title)) = LOWER(TRIM(?))
    LIMIT 1
  `).bind(clean(item.link), clean(item.title)).first();

  const recordId = existing?.id || item.id;

  await db.prepare(`
    INSERT INTO construction_projects (
      id,facility_id,title,description,project_date,stage,source_name,source_url,
      priority,score,raw_json,created_at,updated_at
    )
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET
      title=excluded.title,
      description=excluded.description,
      project_date=excluded.project_date,
      stage=excluded.stage,
      source_name=excluded.source_name,
      source_url=excluded.source_url,
      priority=excluded.priority,
      score=excluded.score,
      raw_json=excluded.raw_json,
      updated_at=excluded.updated_at
  `)
    .bind(
      recordId,null,item.title,item.description,item.date,item.stage,item.source,item.link,
      item.priority,item.score,JSON.stringify(item),now,now
    )
    .run();
}

async function runSync(env, force = false) {
  if (!env.DB) throw new Error('D1 binding DB is not available.');

  const last = await env.DB.prepare(`
    SELECT completed_at FROM sync_runs
    WHERE status IN ('complete', 'partial')
    ORDER BY completed_at DESC
    LIMIT 1
  `).first();

  if (!force && last?.completed_at && Date.now() - new Date(last.completed_at).getTime() < 15 * 60 * 1000) {
    return {
      skipped: true,
      reason: 'A successful sync ran less than 15 minutes ago.',
      last_completed_at: last.completed_at
    };
  }

  const runId = crypto.randomUUID();
  const startedAt = new Date().toISOString();

  await env.DB.prepare('INSERT INTO sync_runs (id,started_at,status) VALUES (?,?,?)')
    .bind(runId,startedAt,'running')
    .run();

  let fda = [];
  let usda = [];
  let projects = [];
  const facilities = new Set();
  const errors = [];

  const results = await Promise.allSettled([fetchFDA(), fetchUSDA(), fetchConstruction()]);

  if (results[0].status === 'fulfilled') fda = results[0].value;
  else errors.push(String(results[0].reason));

  if (results[1].status === 'fulfilled') usda = results[1].value;
  else errors.push(String(results[1].reason));

  if (results[2].status === 'fulfilled') projects = results[2].value;
  else errors.push(String(results[2].reason));

  for (const item of [...fda, ...usda]) {
    try {
      const facilityId = await upsertFacility(env.DB, item);
      facilities.add(facilityId);
      await saveRecall(env.DB, item, facilityId);
    } catch (error) {
      errors.push(`Recall ${item.source} ${item.recall_number || item.event_id || item.id}: ${String(error)}`);
    }
  }

  for (const project of projects) {
    try {
      await saveProject(env.DB, project);
    } catch (error) {
      errors.push(`Project ${project.title}: ${String(error)}`);
    }
  }

  const completedAt = new Date().toISOString();
  const status = errors.length === 3 && !fda.length && !usda.length && !projects.length
    ? 'failed'
    : errors.length
      ? 'partial'
      : 'complete';

  await env.DB.prepare(`
    UPDATE sync_runs SET
      completed_at=?,status=?,fda_records=?,usda_records=?,construction_records=?,
      facilities_upserted=?,error=?
    WHERE id=?
  `)
    .bind(
      completedAt,status,fda.length,usda.length,projects.length,facilities.size,
      errors.join(' | ').slice(0, 20000),runId
    )
    .run();

  return {
    run_id: runId,
    status,
    started_at: startedAt,
    completed_at: completedAt,
    fda_records: fda.length,
    usda_records: usda.length,
    construction_records: projects.length,
    facilities_upserted: facilities.size,
    errors
  };
}

export async function onRequestGet({ env, request }) {
  try {
    const force = new URL(request.url).searchParams.get('force') === '1';
    return json(await runSync(env, force));
  } catch (error) {
    return json({ error: 'Automatic sync failed', detail: String(error) }, 500);
  }
}

export const onRequestPost = onRequestGet;
