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

function isPlaceholder(value = '') {
  const text = clean(value).toLowerCase()

  return (
    !text ||
    text === 'unknown city' ||
    text === 'address not published' ||
    text === 'not available'
  )
}

function canGeocode(facility) {
  const address = clean(facility.address)
  const city = clean(facility.city)
  const state = clean(facility.state)

  const validAddress = !isPlaceholder(address)
  const validCity = !isPlaceholder(city)
  const validState = Boolean(state)

  return validAddress || (validCity && validState)
}

function buildQueries(facility) {
  const address = clean(facility.address)
  const city = clean(facility.city)
  const state = clean(facility.state)
  const name = clean(facility.name)

  const queries = []

  if (!isPlaceholder(address)) {
    queries.push(
      [address, city, state, 'USA']
        .filter(Boolean)
        .join(', ')
    )
  }

  if (!isPlaceholder(city) && state) {
    queries.push(
      [name, city, state, 'USA']
        .filter(Boolean)
        .join(', ')
    )

    queries.push(
      [city, state, 'USA']
        .filter(Boolean)
        .join(', ')
    )
  }

  return [...new Set(queries)]
}

function validUSCoordinates(lat, lng) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= 18 &&
    lat <= 72 &&
    lng >= -180 &&
    lng <= -60
  )
}

function delay(milliseconds) {
  return new Promise(resolve =>
    setTimeout(resolve, milliseconds)
  )
}

async function searchNominatim(query) {
  const searchUrl =
    'https://nominatim.openstreetmap.org/search?' +
    new URLSearchParams({
      q: query,
      format: 'jsonv2',
      limit: '1',
      countrycodes: 'us',
      addressdetails: '1',
    }).toString()

  const response = await fetch(searchUrl, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Santera-Facility-Geocoder/1.0',
    },
  })

  if (!response.ok) {
    throw new Error(
      `Nominatim returned ${response.status}`
    )
  }

  const results = await response.json()
  const first = results[0]

  if (!first) {
    return null
  }

  const lat = Number(first.lat)
  const lng = Number(first.lon)

  if (!validUSCoordinates(lat, lng)) {
    return null
  }

  return {
    lat,
    lng,
    display_name: clean(first.display_name),
    type: clean(first.type),
    category: clean(first.category),
    query,
  }
}

async function geocodeFacility(facility) {
  const queries = buildQueries(facility)

  for (let index = 0; index < queries.length; index += 1) {
    const query = queries[index]
    const result = await searchNominatim(query)

    if (result) {
      return result
    }

    if (index < queries.length - 1) {
      await delay(1100)
    }
  }

  return null
}

async function updateStatus(
  db,
  facilityId,
  status,
  result = ''
) {
  const timestamp = new Date().toISOString()

  await db
    .prepare(`
      UPDATE facilities
      SET
        geocode_status = ?,
        geocode_attempted_at = ?,
        geocode_result = ?,
        updated_at = ?
      WHERE id = ?
    `)
    .bind(
      status,
      timestamp,
      result,
      timestamp,
      facilityId
    )
    .run()
}

async function getTotals(db) {
  return db
    .prepare(`
      SELECT
        COUNT(*) AS all_facilities,

        SUM(
          CASE
            WHEN lat IS NOT NULL
             AND lng IS NOT NULL
            THEN 1
            ELSE 0
          END
        ) AS mapped_facilities,

        SUM(
          CASE
            WHEN (lat IS NULL OR lng IS NULL)
             AND (
               geocode_status IS NULL
               OR geocode_status = ''
               OR geocode_status = 'pending'
               OR geocode_status = 'processing'
             )
            THEN 1
            ELSE 0
          END
        ) AS pending_facilities,

        SUM(
          CASE
            WHEN (lat IS NULL OR lng IS NULL)
             AND geocode_status = 'failed'
            THEN 1
            ELSE 0
          END
        ) AS failed_facilities,

        SUM(
          CASE
            WHEN (lat IS NULL OR lng IS NULL)
             AND geocode_status = 'skipped'
            THEN 1
            ELSE 0
          END
        ) AS skipped_facilities

      FROM facilities
    `)
    .first()
}

async function getNeedsAttention(db) {
  const result = await db
    .prepare(`
      SELECT
        id,
        name,
        address,
        city,
        state,
        geocode_status,
        geocode_result,
        geocode_attempted_at
      FROM facilities
      WHERE
        (lat IS NULL OR lng IS NULL)
        AND geocode_status = 'skipped'
      ORDER BY name ASC
      LIMIT 100
    `)
    .all()

  return (result.results || []).map(facility => ({
    id: facility.id,
    name: clean(facility.name) || 'Unnamed facility',
    address: clean(facility.address),
    city: clean(facility.city),
    state: clean(facility.state),
    status: 'skipped',
    reason:
      clean(facility.geocode_result) ||
      'Missing usable address, city, or state.',
    attempted_at: facility.geocode_attempted_at,
  }))
}

export async function onRequestPost({ env, request }) {
  try {
    if (!env.DB) {
      throw new Error(
        'D1 binding DB is not available.'
      )
    }

    const requestUrl = new URL(request.url)

    const limit = Math.min(
      Math.max(
        Number(
          requestUrl.searchParams.get('limit') || 5
        ),
        1
      ),
      25
    )

    const retryFailed =
      requestUrl.searchParams.get('retry_failed') === '1'

    const query = retryFailed
      ? `
        SELECT
          id,
          name,
          address,
          city,
          state,
          lat,
          lng,
          geocode_status
        FROM facilities
        WHERE
          (lat IS NULL OR lng IS NULL)
          AND geocode_status IN ('failed', 'skipped')
        ORDER BY geocode_attempted_at ASC
        LIMIT 250
      `
      : `
        SELECT
          id,
          name,
          address,
          city,
          state,
          lat,
          lng,
          geocode_status
        FROM facilities
        WHERE
          (lat IS NULL OR lng IS NULL)
          AND (
            geocode_status IS NULL
            OR geocode_status = ''
            OR geocode_status = 'pending'
            OR geocode_status = 'processing'
          )
        ORDER BY updated_at DESC
        LIMIT 250
      `

    const rows = await env.DB.prepare(query).all()
    const available = rows.results || []

    const candidates = available
      .filter(canGeocode)
      .slice(0, limit)

    const remainingSlots = Math.max(
      0,
      limit - candidates.length
    )

    const invalidCandidates = available
      .filter(facility => !canGeocode(facility))
      .slice(0, remainingSlots)

    const updated = []
    const skipped = []
    const failed = []

    for (const facility of invalidCandidates) {
      const reason =
        'Missing usable address, city, or state.'

      await updateStatus(
        env.DB,
        facility.id,
        'skipped',
        reason
      )

      skipped.push({
        id: facility.id,
        name: facility.name,
        reason,
      })
    }

    for (const facility of candidates) {
      try {
        await updateStatus(
          env.DB,
          facility.id,
          'processing',
          ''
        )

        const location =
          await geocodeFacility(facility)

        if (!location) {
          const reason =
            'No matching United States location found.'

          await updateStatus(
            env.DB,
            facility.id,
            'failed',
            reason
          )

          failed.push({
            id: facility.id,
            name: facility.name,
            reason,
          })

          await delay(1100)
          continue
        }

        const timestamp = new Date().toISOString()

        await env.DB
          .prepare(`
            UPDATE facilities
            SET
              lat = ?,
              lng = ?,
              geocode_status = 'complete',
              geocode_attempted_at = ?,
              geocode_result = ?,
              updated_at = ?
            WHERE id = ?
          `)
          .bind(
            location.lat,
            location.lng,
            timestamp,
            JSON.stringify(location),
            timestamp,
            facility.id
          )
          .run()

        updated.push({
          id: facility.id,
          name: facility.name,
          lat: location.lat,
          lng: location.lng,
          display_name: location.display_name,
          query: location.query,
        })

        await delay(1100)
      } catch (error) {
        const reason =
          error instanceof Error
            ? error.message
            : String(error)

        await updateStatus(
          env.DB,
          facility.id,
          'failed',
          reason
        )

        failed.push({
          id: facility.id,
          name: facility.name,
          reason,
        })
      }
    }

    const totals = await getTotals(env.DB)
    const needsAttention =
      await getNeedsAttention(env.DB)

    return json({
      processed:
        candidates.length +
        invalidCandidates.length,
      updated_count: updated.length,
      skipped_count: skipped.length,
      failed_count: failed.length,
      updated,
      skipped,
      failed,
      totals,
      needs_attention: needsAttention,
    })
  } catch (error) {
    return json(
      {
        error: 'Facility geocoding failed',
        detail:
          error instanceof Error
            ? error.message
            : String(error),
      },
      500
    )
  }
}
