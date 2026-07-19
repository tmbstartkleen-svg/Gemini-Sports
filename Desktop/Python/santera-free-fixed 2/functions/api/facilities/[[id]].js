const json = (data, status = 200) => Response.json(data, {
  status,
  headers: { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' }
});

function normalizeFacility(row) {
  return {
    ...row,
    contacts: [],
    notes: []
  };
}

export async function onRequestGet({ env, params }) {
  if (!env.DB) return json({ mode: 'local', facilities: [], error: 'D1 binding DB is not available.' }, 200);
  try {
    if (params.id) {
      const facility = await env.DB.prepare('SELECT * FROM facilities WHERE id = ?').bind(params.id).first();
      if (!facility) return json({ error: 'Facility not found' }, 404);
      const contacts = await env.DB.prepare('SELECT * FROM contacts WHERE facility_id = ? ORDER BY created_at DESC').bind(params.id).all();
      const notes = await env.DB.prepare('SELECT * FROM facility_notes WHERE facility_id = ? ORDER BY created_at DESC').bind(params.id).all();
      return json({ mode: 'shared', facility: { ...facility, contacts: contacts.results || [], notes: notes.results || [] } });
    }
    const facilitiesResult = await env.DB.prepare('SELECT * FROM facilities ORDER BY updated_at DESC').all();
    const facilities = (facilitiesResult.results || []).map(normalizeFacility);
    if (facilities.length) {
      const contacts = (await env.DB.prepare('SELECT * FROM contacts ORDER BY created_at DESC').all()).results || [];
      const notes = (await env.DB.prepare('SELECT * FROM facility_notes ORDER BY created_at DESC').all()).results || [];
      const byId = new Map(facilities.map(f => [f.id, f]));
      for (const c of contacts) if (byId.has(c.facility_id)) byId.get(c.facility_id).contacts.push(c);
      for (const n of notes) if (byId.has(n.facility_id)) byId.get(n.facility_id).notes.push(n);
    }
    return json({ mode: 'shared', facilities });
  } catch (error) {
    return json({ error: 'Facility database query failed', detail: String(error) }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: 'D1 binding DB is not available.' }, 503);
  try {
    const f = await request.json();
    if (!f.name || !f.address || !f.city) return json({ error: 'Name, address, and city are required.' }, 400);
    const now = new Date().toISOString();
    const id = f.id || crypto.randomUUID();
    await env.DB.prepare(`
      INSERT INTO facilities (id,name,parent,address,city,state,phone,website,lat,lng,priority,status,category,products,employees,establishment_number,notes,source_url,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name,parent=excluded.parent,address=excluded.address,city=excluded.city,state=excluded.state,
        phone=excluded.phone,website=excluded.website,lat=excluded.lat,lng=excluded.lng,priority=excluded.priority,
        status=excluded.status,category=excluded.category,products=excluded.products,employees=excluded.employees,
        establishment_number=excluded.establishment_number,notes=excluded.notes,source_url=excluded.source_url,updated_at=excluded.updated_at
    `).bind(
      id, f.name, f.parent || '', f.address, f.city, f.state || '', f.phone || '', f.website || '',
      f.lat ?? null, f.lng ?? null, f.priority || 'Medium', f.status || 'Prospect', f.category || '',
      f.products || '', f.employees ?? null, f.establishment_number || '', typeof f.notes === 'string' ? f.notes : '',
      f.source_url || '', f.created_at || now, now
    ).run();
    return json({ ok: true, id });
  } catch (error) {
    return json({ error: 'Facility save failed', detail: String(error) }, 500);
  }
}

export async function onRequestDelete({ env, params }) {
  if (!env.DB) return json({ error: 'D1 binding DB is not available.' }, 503);
  if (!params.id) return json({ error: 'Facility id is required.' }, 400);
  try {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM contacts WHERE facility_id = ?').bind(params.id),
      env.DB.prepare('DELETE FROM facility_notes WHERE facility_id = ?').bind(params.id),
      env.DB.prepare('DELETE FROM facilities WHERE id = ?').bind(params.id)
    ]);
    return json({ ok: true });
  } catch (error) {
    return json({ error: 'Facility delete failed', detail: String(error) }, 500);
  }
}
