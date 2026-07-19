const json = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
export async function onRequestPost({ request, env }) {
  const d = await request.json();
  if (!env.DB) return json({ error: 'D1 database not configured' }, 503);
  if (!d.facility_id || !d.name) return json({ error: 'facility_id and name are required' }, 400);
  const id = d.id || crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO contacts (id,facility_id,name,role,phone,email,linkedin,source,verified_at,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,role=excluded.role,phone=excluded.phone,email=excluded.email,linkedin=excluded.linkedin,source=excluded.source,verified_at=excluded.verified_at`
  ).bind(id,d.facility_id,d.name,d.role||'',d.phone||'',d.email||'',d.linkedin||'',d.source||'Team entry',d.verified_at||new Date().toISOString().slice(0,10),new Date().toISOString()).run();
  return json({ ok: true, id });
}
export async function onRequestDelete({ request, env }) {
  if (!env.DB) return json({ error: 'D1 database not configured' }, 503);
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return json({ error: 'id required' }, 400);
  await env.DB.prepare('DELETE FROM contacts WHERE id=?').bind(id).run();
  return json({ ok: true });
}
