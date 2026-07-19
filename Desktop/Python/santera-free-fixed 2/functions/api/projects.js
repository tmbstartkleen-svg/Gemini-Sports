const json = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
export async function onRequestGet({ env, request }) {
  if (!env.DB) return json({ error: 'D1 binding DB is not available.', results: [] }, 503);
  try {
    const url = new URL(request.url);
    const limit = Math.min(1000, Math.max(1, Number(url.searchParams.get('limit') || 500)));
    const { results } = await env.DB.prepare('SELECT * FROM construction_projects ORDER BY score DESC, project_date DESC LIMIT ?').bind(limit).all();
    return json({ results: results || [] });
  } catch (error) { return json({ error: 'Construction database query failed', detail: String(error), results: [] }, 500); }
}
