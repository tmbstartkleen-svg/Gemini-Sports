const json = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' } });
export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: 'D1 binding DB is not available.' }, 503);
  try {
    const n = await request.json();
    if (!n.facility_id || !n.body) return json({ error: 'Facility and note text are required.' }, 400);
    const id = n.id || crypto.randomUUID();
    const created_at = new Date().toISOString();
    await env.DB.prepare('INSERT INTO facility_notes (id,facility_id,body,created_at) VALUES (?,?,?,?)').bind(id,n.facility_id,n.body,created_at).run();
    return json({ ok: true, id, created_at });
  } catch (error) { return json({ error: 'Note save failed', detail: String(error) }, 500); }
}
