const json = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });

export async function onRequestGet({ env }) {
  if (!env.DB) return json({ mode: 'local', facilities: [] });
  const { results } = await env.DB.prepare(`
    SELECT f.*,
      (SELECT COUNT(*) FROM recall_events r WHERE r.facility_id=f.id) AS recall_count,
      (SELECT MAX(report_date) FROM recall_events r WHERE r.facility_id=f.id) AS latest_recall_date,
      COALESCE((SELECT json_group_array(json_object('id',c.id,'name',c.name,'role',c.role,'phone',c.phone,'email',c.email,'linkedin',c.linkedin,'source',c.source,'verified_at',c.verified_at)) FROM contacts c WHERE c.facility_id=f.id), '[]') AS contacts_json,
      COALESCE((SELECT json_group_array(json_object('id',n.id,'body',n.body,'created_at',n.created_at)) FROM facility_notes n WHERE n.facility_id=f.id ORDER BY n.created_at DESC), '[]') AS notes_json
    FROM facilities f ORDER BY updated_at DESC
  `).all();
  const facilities = results.map(row => ({ ...row, contacts: JSON.parse(row.contacts_json || '[]'), notes: JSON.parse(row.notes_json || '[]') }));
  return json({ mode: 'shared', facilities });
}

export async function onRequestPost({ request, env }) {
  const data = await request.json();
  if (!data.name || !data.address || !data.city) return json({ error: 'name, address and city are required' }, 400);
  if (!env.DB) return json({ error: 'D1 database not configured', mode: 'local' }, 503);
  const id = data.id || crypto.randomUUID();
  const now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO facilities
    (id,name,parent,address,city,state,phone,website,lat,lng,priority,status,category,products,employees,establishment_number,notes,source_url,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET name=excluded.name,parent=excluded.parent,address=excluded.address,city=excluded.city,state=excluded.state,phone=excluded.phone,website=excluded.website,lat=excluded.lat,lng=excluded.lng,priority=excluded.priority,status=excluded.status,category=excluded.category,products=excluded.products,employees=excluded.employees,establishment_number=excluded.establishment_number,notes=excluded.notes,source_url=excluded.source_url,updated_at=excluded.updated_at`
  ).bind(id,data.name,data.parent||'',data.address,data.city,data.state||'',data.phone||'',data.website||'',data.lat||null,data.lng||null,data.priority||'Medium',data.status||'Prospect',data.category||'',data.products||'',data.employees||null,data.establishment_number||'',data.notes||'',data.source_url||'',data.created_at||now,now).run();
  return json({ ok: true, id });
}
