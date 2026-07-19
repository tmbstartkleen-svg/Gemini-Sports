const json = (data, status = 200) =>
  Response.json(data, {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  })

const CATEGORY_FILTERS = {
  hotels: [
    '["tourism"~"hotel|motel|hostel|guest_house"]',
  ],
  sitdown: [
    '["amenity"="restaurant"]',
    '["amenity"="cafe"]',
  ],
  fastfood: [
    '["amenity"="fast_food"]',
  ],
}

function clean(value = '') {
  return String(value ?? '').trim()
}

function toNumber(value) {
  if (value === null || String(value).trim() === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function radians(value) {
  return (value * Math.PI) / 180
}

function distanceMiles(lat1, lng1, lat2, lng2) {
  const earthRadiusMiles = 3958.8
  const latDelta = radians(lat2 - lat1)
  const lngDelta = radians(lng2 - lng1)
  const a =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(radians(lat1)) *
      Math.cos(radians(lat2)) *
      Math.sin(lngDelta / 2) ** 2

  return earthRadiusMiles * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function getCoordinates(element) {
  if (Number.isFinite(element.lat) && Number.isFinite(element.lon)) {
    return { lat: element.lat, lng: element.lon }
  }

  if (
    Number.isFinite(element.center?.lat) &&
    Number.isFinite(element.center?.lon)
  ) {
    return {
      lat: element.center.lat,
      lng: element.center.lon,
    }
  }

  return null
}

function formatAddress(tags = {}) {
  const street = [tags['addr:housenumber'], tags['addr:street']]
    .filter(Boolean)
    .join(' ')

  return [
    street,
    tags['addr:city'] || tags['addr:town'] || tags['addr:village'],
    tags['addr:state'],
    tags['addr:postcode'],
  ]
    .filter(Boolean)
    .join(', ')
}

function normalizePlace(element, origin, category) {
  const coordinates = getCoordinates(element)
  if (!coordinates) return null

  const tags = element.tags || {}
  const name = clean(tags.name || tags.brand || tags.operator)
  if (!name) return null

  const distance = distanceMiles(
    origin.lat,
    origin.lng,
    coordinates.lat,
    coordinates.lng
  )

  const website = clean(
    tags.website || tags['contact:website'] || tags.url
  )
  const phone = clean(
    tags.phone || tags['contact:phone']
  )
  const cuisine = clean(tags.cuisine)
    .split(';')
    .filter(Boolean)
    .map(value => value.replaceAll('_', ' '))
    .join(', ')

  return {
    id: `${element.type}-${element.id}`,
    name,
    category,
    subtype: clean(tags.tourism || tags.amenity),
    address: formatAddress(tags),
    phone,
    website,
    cuisine,
    opening_hours: clean(tags.opening_hours),
    wheelchair: clean(tags.wheelchair),
    takeaway: clean(tags.takeaway),
    drive_through: clean(tags.drive_through),
    lat: coordinates.lat,
    lng: coordinates.lng,
    distance_miles: Number(distance.toFixed(1)),
    directions_url:
      `https://www.google.com/maps/dir/?api=1&destination=${coordinates.lat},${coordinates.lng}`,
  }
}

export async function onRequestGet({ request }) {
  try {
    const url = new URL(request.url)
    const lat = toNumber(url.searchParams.get('lat'))
    const lng = toNumber(url.searchParams.get('lng'))
    const category = clean(url.searchParams.get('category') || 'hotels')
    const radiusMiles = Math.min(
      Math.max(toNumber(url.searchParams.get('radius')) || 10, 1),
      50
    )

    if (lat === null || lng === null) {
      return json({ error: 'Valid lat and lng parameters are required.' }, 400)
    }

    const filters = CATEGORY_FILTERS[category]
    if (!filters) {
      return json(
        { error: 'category must be hotels, sitdown, or fastfood.' },
        400
      )
    }

    const radiusMeters = Math.round(radiusMiles * 1609.344)
    const clauses = filters
      .flatMap(filter => [
        `node(around:${radiusMeters},${lat},${lng})${filter};`,
        `way(around:${radiusMeters},${lat},${lng})${filter};`,
        `relation(around:${radiusMeters},${lat},${lng})${filter};`,
      ])
      .join('\n')

    const query = `[out:json][timeout:20];\n(\n${clauses}\n);\nout center tags;`
    const overpassUrl =
      'https://overpass-api.de/api/interpreter?data=' +
      encodeURIComponent(query)

    const response = await fetch(overpassUrl, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Santera-Facility-Intelligence/1.0',
      },
    })

    if (!response.ok) {
      throw new Error(`Nearby provider returned HTTP ${response.status}`)
    }

    const payload = await response.json()
    const origin = { lat, lng }
    const seen = new Set()

    const places = (payload.elements || [])
      .map(element => normalizePlace(element, origin, category))
      .filter(Boolean)
      .filter(place => {
        const key = `${place.name.toLowerCase()}-${place.lat.toFixed(4)}-${place.lng.toFixed(4)}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      .sort((a, b) => a.distance_miles - b.distance_miles)
      .slice(0, 40)

    return json({
      places,
      count: places.length,
      category,
      radius_miles: radiusMiles,
      source: 'OpenStreetMap contributors',
    })
  } catch (error) {
    return json(
      {
        error: 'Could not load nearby places.',
        detail: error instanceof Error ? error.message : String(error),
      },
      502
    )
  }
}
