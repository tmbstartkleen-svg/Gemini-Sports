const json = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
export async function onRequestDelete({ params, env }) {
  if (!env.DB) return json({ error: 'D1 database not configured' }, 503);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM contacts WHERE facility_id=?').bind(params.id),
    env.DB.prepare('DELETE FROM facility_notes WHERE facility_id=?').bind(params.id),
    env.DB.prepare('DELETE FROM facilities WHERE id=?').bind(params.id)
  ]);
  return json({ ok: true });
}
