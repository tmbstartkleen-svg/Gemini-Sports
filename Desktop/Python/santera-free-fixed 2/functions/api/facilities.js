const json = (data, status = 200) =>
  Response.json(data, {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })

function clean(value = '') {
  return String(value ?? '').trim()
}

export async function onRequestGet({ env, request }) {
  try {
    if (!env.DB) {
      throw new Error('D1 binding DB is not available.')
    }

    const url = new URL(request.url)
    const mappedOnly = url.searchParams.get('mapped') !== '0'
    const state = clean(url.searchParams.get('state'))
    const status = clean(url.searchParams.get('status'))
    const search = clean(url.searchParams.get('search'))

    const limit = Math.min(
      Math.max(Number(url.searchParams.get('limit') || 1000), 1),
      2000
    )

    const where = []
    const bindings = []

    if (mappedOnly) {
      where.push('lat IS NOT NULL')
      where.push('lng IS NOT NULL')
    }

    if (state) {
      where.push('state = ?')
      bindings.push(state)
    }

    if (status) {
      where.push(
        "COALESCE(NULLIF(geocode_status, ''), 'Unknown') = ?"
      )
      bindings.push(status)
    }

    if (search) {
      where.push(`(
        LOWER(COALESCE(name, '')) LIKE ?
        OR LOWER(COALESCE(address, '')) LIKE ?
        OR LOWER(COALESCE(city, '')) LIKE ?
        OR LOWER(COALESCE(state, '')) LIKE ?
      )`)

      const pattern = `%${search.toLowerCase()}%`
      bindings.push(pattern, pattern, pattern, pattern)
    }

    bindings.push(limit)

    const result = await env.DB
      .prepare(`
        SELECT
          id,
          name,
          address,
          city,
          state,
          'United States' AS country,
          '' AS supplier,
          COALESCE(
            NULLIF(geocode_status, ''),
            'Unknown'
          ) AS status,
          lat,
          lng
        FROM facilities
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY name COLLATE NOCASE ASC
        LIMIT ?
      `)
      .bind(...bindings)
      .all()

    const facilities = (result.results || []).map(facility => ({
      id: facility.id,
      name: clean(facility.name) || 'Unnamed facility',
      address: clean(facility.address),
      city: clean(facility.city),
      state: clean(facility.state),
      country: clean(facility.country) || 'United States',
      supplier: clean(facility.supplier),
      status: clean(facility.status) || 'Unknown',
      lat: Number(facility.lat),
      lng: Number(facility.lng),
    }))

    return json({
      facilities,
      count: facilities.length,
    })
  } catch (error) {
    return json(
      {
        error: 'Could not load facilities',
        detail:
          error instanceof Error
            ? error.message
            : String(error),
      },
      500
    )
  }
}
