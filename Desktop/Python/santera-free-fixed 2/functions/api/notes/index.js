const json = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
export async function onRequestPost({ request, env }) {
  const d = await request.json();
  if (!env.DB) return json({ error: 'D1 database not configured' }, 503);
  if (!d.facility_id || !d.body) return json({ error: 'facility_id and body are required' }, 400);
  const id = crypto.randomUUID();
  await env.DB.prepare('INSERT INTO facility_notes (id,facility_id,body,created_at) VALUES (?,?,?,?)').bind(id,d.facility_id,d.body,new Date().toISOString()).run();
  return json({ ok: true, id });
}
