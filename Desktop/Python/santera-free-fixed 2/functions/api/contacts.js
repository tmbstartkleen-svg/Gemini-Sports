const json = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' } });
export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: 'D1 binding DB is not available.' }, 503);
  try {
    const c = await request.json();
    if (!c.facility_id || !c.name) return json({ error: 'Facility and contact name are required.' }, 400);
    const now = new Date().toISOString();
    const id = c.id || crypto.randomUUID();
    await env.DB.prepare(`INSERT INTO contacts (id,facility_id,name,role,phone,email,linkedin,source,verified_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .bind(id,c.facility_id,c.name,c.role||'',c.phone||'',c.email||'',c.linkedin||'',c.source||'Team entry',c.verified_at||now.slice(0,10),now).run();
    return json({ ok: true, id });
  } catch (error) { return json({ error: 'Contact save failed', detail: String(error) }, 500); }
}
