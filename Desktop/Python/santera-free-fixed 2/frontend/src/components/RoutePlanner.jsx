import { useMemo, useState } from 'react'

function hasValidCoordinates(facility) {
  const latitude = Number(facility.lat)
  const longitude = Number(facility.lng)

  return (
    facility.lat !== null &&
    facility.lat !== undefined &&
    facility.lat !== '' &&
    facility.lng !== null &&
    facility.lng !== undefined &&
    facility.lng !== '' &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180 &&
    !(latitude === 0 && longitude === 0)
  )
}

function distanceBetween(a, b) {
  const earthRadiusMiles = 3958.8

  const latitude1 = Number(a.lat) * Math.PI / 180
  const latitude2 = Number(b.lat) * Math.PI / 180

  const latitudeDifference =
    (Number(b.lat) - Number(a.lat)) * Math.PI / 180

  const longitudeDifference =
    (Number(b.lng) - Number(a.lng)) * Math.PI / 180

  const value =
    Math.sin(latitudeDifference / 2) ** 2 +
    Math.cos(latitude1) *
      Math.cos(latitude2) *
      Math.sin(longitudeDifference / 2) ** 2

  const angularDistance =
    2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value))

  return earthRadiusMiles * angularDistance
}

function optimizeNearestNeighbor(facilities) {
  if (facilities.length <= 2) {
    return [...facilities]
  }

  const remaining = facilities.slice(1)
  const route = [facilities[0]]

  while (remaining.length) {
    const current = route[route.length - 1]

    let closestIndex = 0
    let closestDistance = Infinity

    remaining.forEach((facility, index) => {
      const distance = distanceBetween(current, facility)

      if (distance < closestDistance) {
        closestDistance = distance
        closestIndex = index
      }
    })

    route.push(remaining.splice(closestIndex, 1)[0])
  }

  return route
}

function buildGoogleMapsUrl(route) {
  if (!route.length) return ''

  const origin = `${route[0].lat},${route[0].lng}`
  const destination =
    `${route[route.length - 1].lat},${route[route.length - 1].lng}`

  const waypoints = route
    .slice(1, -1)
    .map(item => `${item.lat},${item.lng}`)
    .join('|')

  const parameters = new URLSearchParams({
    api: '1',
    origin,
    destination,
    travelmode: 'driving',
  })

  if (waypoints) {
    parameters.set('waypoints', waypoints)
  }

  return `https://www.google.com/maps/dir/?${parameters.toString()}`
}

export default function RoutePlanner({
  facilities = [],
  routeFacilities = [],
  onAddFacility,
  onRemoveFacility,
  onClearRoute,
  onSelectFacility,
}) {
  const [search, setSearch] = useState('')
  const [optimizedRoute, setOptimizedRoute] = useState([])

  const validFacilities = useMemo(
    () => facilities.filter(hasValidCoordinates),
    [facilities]
  )

  const availableFacilities = useMemo(() => {
    const selectedIds = new Set(
      routeFacilities.map(facility => facility.id)
    )

    return validFacilities.filter(facility => {
      const matchesSearch =
        !search ||
        JSON.stringify(facility)
          .toLowerCase()
          .includes(search.toLowerCase())

      return !selectedIds.has(facility.id) && matchesSearch
    })
  }, [validFacilities, routeFacilities, search])

  const activeRoute = optimizedRoute.length
    ? optimizedRoute
    : routeFacilities

  const routeDistance = useMemo(() => {
    if (activeRoute.length < 2) return 0

    return activeRoute.slice(1).reduce((total, facility, index) => {
      return total + distanceBetween(activeRoute[index], facility)
    }, 0)
  }, [activeRoute])

  const estimatedDriveHours = routeDistance / 50
  const googleMapsUrl = buildGoogleMapsUrl(activeRoute)

  function optimizeRoute() {
    const validSelected = routeFacilities.filter(hasValidCoordinates)
    setOptimizedRoute(optimizeNearestNeighbor(validSelected))
  }

  function removeFacility(facility) {
    onRemoveFacility(facility)
    setOptimizedRoute([])
  }

  function clearRoute() {
    onClearRoute()
    setOptimizedRoute([])
  }

  return (
    <section className="route-planner-page">
      <div className="route-metrics">
        <article>
          <span>Selected stops</span>
          <strong>{routeFacilities.length}</strong>
          <small>Facilities planned</small>
        </article>

        <article>
          <span>Estimated mileage</span>
          <strong>{Math.round(routeDistance)}</strong>
          <small>Straight-line planning estimate</small>
        </article>

        <article>
          <span>Estimated drive time</span>
          <strong>{estimatedDriveHours.toFixed(1)}h</strong>
          <small>Preliminary estimate</small>
        </article>
      </div>

      <div className="route-planner-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">FACILITY SELECTION</p>
              <h3>Add route stops</h3>
            </div>
          </div>

          <input
            className="route-search"
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Search facilities, cities, or states..."
          />

          <div className="route-facility-list">
            {availableFacilities.slice(0, 100).map(facility => (
              <article
                className="route-facility-row"
                key={facility.id}
              >
                <button
                  type="button"
                  className="route-facility-main"
                  onClick={() => onSelectFacility(facility)}
                >
                  <strong>{facility.name}</strong>
                  <small>
                    {[facility.city, facility.state]
                      .filter(Boolean)
                      .join(', ')}
                  </small>
                </button>

                <button
                  type="button"
                  className="route-add-button"
                  onClick={() => {
                    onAddFacility(facility)
                    setOptimizedRoute([])
                  }}
                >
                  Add
                </button>
              </article>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-heading route-heading">
            <div>
              <p className="eyebrow">VISIT ITINERARY</p>
              <h3>Selected route</h3>
            </div>

            <button
              type="button"
              className="secondary-button"
              onClick={clearRoute}
              disabled={!routeFacilities.length}
            >
              Clear
            </button>
          </div>

          {!activeRoute.length ? (
            <p className="drawer-empty">
              Add facilities to begin planning a route.
            </p>
          ) : (
            <div className="route-stop-list">
              {activeRoute.map((facility, index) => (
                <article
                  className="route-stop"
                  key={facility.id}
                >
                  <span className="route-stop-number">
                    {index + 1}
                  </span>

                  <button
                    type="button"
                    className="route-stop-main"
                    onClick={() => onSelectFacility(facility)}
                  >
                    <strong>{facility.name}</strong>
                    <small>
                      {[facility.address, facility.city, facility.state]
                        .filter(Boolean)
                        .join(', ')}
                    </small>
                  </button>

                  <button
                    type="button"
                    className="route-remove-button"
                    onClick={() => removeFacility(facility)}
                  >
                    Remove
                  </button>
                </article>
              ))}
            </div>
          )}

          <div className="route-actions">
            <button
              type="button"
              className="primary-button"
              disabled={routeFacilities.length < 2}
              onClick={optimizeRoute}
            >
              Optimize stop order
            </button>

            {googleMapsUrl && (
              <a
                className="secondary-button"
                href={googleMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open in Google Maps
              </a>
            )}
          </div>
        </section>
      </div>
    </section>
  )
}
