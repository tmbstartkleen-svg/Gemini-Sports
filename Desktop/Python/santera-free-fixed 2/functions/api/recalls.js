const json = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
export async function onRequestGet({ env, request }) {
  if (!env.DB) return json({ error: 'D1 binding DB is not available.', results: [] }, 503);
  try {
    const url = new URL(request.url);
    const limit = Math.min(1000, Math.max(1, Number(url.searchParams.get('limit') || 500)));
    const { results } = await env.DB.prepare(`SELECT r.*, f.name AS facility_name, f.address AS facility_address, f.phone AS facility_phone, f.website AS facility_website
      FROM recall_events r LEFT JOIN facilities f ON f.id=r.facility_id
      ORDER BY r.score DESC, r.report_date DESC LIMIT ?`).bind(limit).all();
    return json({ results: results || [] });
  } catch (error) { return json({ error: 'Recall database query failed', detail: String(error), results: [] }, 500); }
}
