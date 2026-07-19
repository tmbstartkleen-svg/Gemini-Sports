import { useEffect, useMemo, useState } from 'react'
import {
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
} from 'react-leaflet'
import L from 'leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'

import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import './TerritoryMap.css'

const USA_CENTER = [39.5, -98.35]
const USA_ZOOM = 4
const PRIORITIES = ['Critical', 'High', 'Medium', 'Low']

function Icon({ name, size = 18 }) {
  const paths = {
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
    route: <><circle cx="6" cy="19" r="2" /><circle cx="18" cy="5" r="2" /><path d="M8 19h3a4 4 0 0 0 4-4V9a4 4 0 0 1 4-4" /></>,
    map: <><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3Z" /><path d="M9 3v15M15 6v15" /></>,
    pin: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
    alert: <><path d="M10.3 3.6 2.5 17a2 2 0 0 0 1.7 3h15.6a2 2 0 0 0 1.7-3L13.7 3.6a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4M12 17h.01" /></>,
    target: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></>,
    layers: <><path d="m12 2 9 5-9 5-9-5Z" /><path d="m3 12 9 5 9-5M3 17l9 5 9-5" /></>,
    chevron: <path d="m9 18 6-6-6-6" />,
    close: <><path d="M18 6 6 18M6 6l12 12" /></>,
  }

  return (
    <svg
      aria-hidden="true"
      className="tm-icon"
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    >
      {paths[name]}
    </svg>
  )
}

function normalizeCoordinate(value) {
  if (value === null || value === undefined || value === '') return null

  const normalized =
    typeof value === 'string' ? value.trim().replace(',', '') : value
  const number = Number(normalized)

  return Number.isFinite(number) ? number : null
}

function readCoordinates(facility) {
  let latitude = normalizeCoordinate(
    facility.lat ??
      facility.latitude ??
      facility.location_lat ??
      facility.locationLat ??
      facility.geocode_lat ??
      facility.geocodeLat ??
      facility.coordinates?.lat ??
      facility.coordinates?.latitude ??
      facility.location?.lat ??
      facility.location?.latitude
  )

  let longitude = normalizeCoordinate(
    facility.lng ??
      facility.lon ??
      facility.longitude ??
      facility.location_lng ??
      facility.location_lon ??
      facility.locationLng ??
      facility.locationLon ??
      facility.geocode_lng ??
      facility.geocode_lon ??
      facility.geocodeLng ??
      facility.geocodeLon ??
      facility.coordinates?.lng ??
      facility.coordinates?.lon ??
      facility.coordinates?.longitude ??
      facility.location?.lng ??
      facility.location?.lon ??
      facility.location?.longitude
  )

  const looksReversed =
    latitude !== null &&
    longitude !== null &&
    Math.abs(latitude) > 90 &&
    Math.abs(longitude) <= 90

  if (looksReversed) {
    const originalLatitude = latitude
    latitude = longitude
    longitude = originalLatitude
  }

  return { latitude, longitude }
}

function isValidUSCoordinate(latitude, longitude) {
  return (
    latitude !== null &&
    longitude !== null &&
    latitude >= 18 &&
    latitude <= 72 &&
    longitude >= -180 &&
    longitude <= -60
  )
}

function normalizePriority(value) {
  const text = String(value || '').trim().toLowerCase()

  if (text === 'critical') return 'Critical'
  if (text === 'high') return 'High'
  if (text === 'low') return 'Low'
  return 'Medium'
}

function markerColor(priority) {
  const colors = {
    Critical: '#fb7185',
    High: '#fb923c',
    Medium: '#facc15',
    Low: '#86efac',
  }

  return colors[priority] || '#5ee3ad'
}

function priorityMarkerIcon(priority, routeSelected = false) {
  const color = markerColor(priority)
  const size = priority === 'Critical' ? 22 : priority === 'High' ? 20 : 18

  return L.divIcon({
    className: 'tm-marker-shell',
    html: `
      <span
        class="tm-marker ${routeSelected ? 'is-route' : ''}"
        style="--tm-marker-color:${color};width:${size}px;height:${size}px"
        aria-hidden="true"
      ></span>
    `,
    iconSize: [size + 16, size + 16],
    iconAnchor: [(size + 16) / 2, (size + 16) / 2],
    popupAnchor: [0, -(size / 2 + 10)],
  })
}

function facilityName(facility) {
  return (
    facility.name ??
    facility.facility_name ??
    facility.facilityName ??
    facility.company_name ??
    facility.companyName ??
    facility.firm_name ??
    facility.firmName ??
    facility.company ??
    'Unknown facility'
  )
}

function facilityAddress(facility) {
  return (
    facility.address ??
    facility.street_address ??
    facility.streetAddress ??
    facility.address1 ??
    facility.street ??
    ''
  )
}

function facilityCity(facility) {
  return facility.city ?? facility.location_city ?? ''
}

function facilityState(facility) {
  return facility.state ?? facility.state_code ?? facility.stateCode ?? ''
}

function facilityKey(facility, index) {
  return String(
    facility.id ??
      facility.facility_id ??
      facility.facilityId ??
      facility.provider_id ??
      facility.providerId ??
      `${facilityName(facility)}-${facility.lat}-${facility.lng}-${index}`
  )
}

function locationQuality(facility) {
  const result = String(
    facility.geocode_result ?? facility.geocodeResult ?? ''
  ).toLowerCase()
  const status = String(
    facility.geocode_status ?? facility.geocodeStatus ?? ''
  ).toLowerCase()
  const address = String(facility.address || '').toLowerCase()

  if (status === 'complete' && address && address !== 'address not published') {
    return 'Verified address'
  }

  if (
    result.includes('county') ||
    result.includes('city') ||
    address === 'address not published'
  ) {
    return 'Estimated location'
  }

  return 'Mapped location'
}

function ResetMapButton() {
  const map = useMap()

  return (
    <button
      className="tm-map-control"
      onClick={() => {
        map.setView(USA_CENTER, USA_ZOOM)
        map.invalidateSize()
      }}
      type="button"
    >
      <Icon name="target" size={16} />
      Reset view
    </button>
  )
}

function MapFocus({ facility }) {
  const map = useMap()

  useEffect(() => {
    if (!facility) return

    map.flyTo([facility.lat, facility.lng], Math.max(map.getZoom(), 9), {
      duration: 0.85,
    })
  }, [facility, map])

  return null
}

function MetricCard({ icon, label, value, detail, tone = 'default' }) {
  return (
    <div className={`tm-metric tm-metric--${tone}`}>
      <div className="tm-metric__icon">
        <Icon name={icon} size={19} />
      </div>
      <div>
        <strong>{value.toLocaleString()}</strong>
        <span>{label}</span>
        <small>{detail}</small>
      </div>
    </div>
  )
}

export default function TerritoryMap({
  facilities = [],
  onSelectFacility,
  onAddToRoute,
  routeFacilities = [],
}) {
  const [search, setSearch] = useState('')
  const [activePriorities, setActivePriorities] = useState(
    () => new Set(PRIORITIES)
  )
  const [focusedFacility, setFocusedFacility] = useState(null)
  const [panelOpen, setPanelOpen] = useState(true)

  const normalizedFacilities = useMemo(
    () =>
      facilities.map((facility, index) => {
        const { latitude, longitude } = readCoordinates(facility)

        return {
          ...facility,
          _mapKey: facilityKey(facility, index),
          name: facilityName(facility),
          address: facilityAddress(facility),
          city: facilityCity(facility),
          state: facilityState(facility),
          lat: latitude,
          lng: longitude,
          priority: normalizePriority(facility.priority),
        }
      }),
    [facilities]
  )

  const mappedFacilities = useMemo(
    () =>
      normalizedFacilities.filter(facility =>
        isValidUSCoordinate(facility.lat, facility.lng)
      ),
    [normalizedFacilities]
  )

  const unmappedFacilities = useMemo(
    () =>
      normalizedFacilities.filter(
        facility => !isValidUSCoordinate(facility.lat, facility.lng)
      ),
    [normalizedFacilities]
  )

  const routeIds = useMemo(
    () =>
      new Set(
        routeFacilities.map(facility =>
          String(facility.id ?? facility.facility_id ?? facility.facilityId)
        )
      ),
    [routeFacilities]
  )

  const visibleFacilities = useMemo(() => {
    const query = search.trim().toLowerCase()

    return mappedFacilities.filter(facility => {
      if (!activePriorities.has(facility.priority)) return false
      if (!query) return true

      return [
        facility.name,
        facility.parent,
        facility.address,
        facility.city,
        facility.state,
        facility.category,
        facility.products,
        facility.phone,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(query)
    })
  }, [activePriorities, mappedFacilities, search])

  const priorityQueue = useMemo(
    () =>
      visibleFacilities
        .filter(facility => ['Critical', 'High'].includes(facility.priority))
        .sort((a, b) => {
          const rank = { Critical: 0, High: 1 }
          return rank[a.priority] - rank[b.priority] || a.name.localeCompare(b.name)
        })
        .slice(0, 6),
    [visibleFacilities]
  )

  const criticalCount = mappedFacilities.filter(
    facility => facility.priority === 'Critical'
  ).length
  const mappedPercent = facilities.length
    ? Math.round((mappedFacilities.length / facilities.length) * 100)
    : 0

  function isInRoute(facility) {
    const id = facility.id ?? facility.facility_id ?? facility.facilityId
    return id !== undefined && routeIds.has(String(id))
  }

  function togglePriority(priority) {
    setActivePriorities(current => {
      const next = new Set(current)
      next.has(priority) ? next.delete(priority) : next.add(priority)
      return next
    })
  }

  function focusFacility(facility) {
    setFocusedFacility(null)
    window.requestAnimationFrame(() => setFocusedFacility(facility))
  }

  return (
    <section className="tm-shell">
      <header className="tm-header">
        <div>
          <div className="tm-kicker">
            <span className="tm-live-dot" />
            Live territory intelligence
          </div>
          <h2>Territory Command Center</h2>
          <p>
            Monitor coverage, prioritize high-value facilities, and build routes
            from one operational map.
          </p>
        </div>

        <div className="tm-header__status">
          <span>Map health</span>
          <strong>{mappedPercent}%</strong>
          <div className="tm-progress" aria-label={`${mappedPercent}% mapped`}>
            <span style={{ width: `${mappedPercent}%` }} />
          </div>
        </div>
      </header>

      <div className="tm-metrics">
        <MetricCard
          detail="In the facility database"
          icon="layers"
          label="Total facilities"
          value={facilities.length}
        />
        <MetricCard
          detail={`${mappedPercent}% coverage`}
          icon="map"
          label="Mapped"
          tone="success"
          value={mappedFacilities.length}
        />
        <MetricCard
          detail="Immediate attention"
          icon="alert"
          label="Critical priority"
          tone="danger"
          value={criticalCount}
        />
        <MetricCard
          detail="Current route plan"
          icon="route"
          label="Route stops"
          tone="info"
          value={routeFacilities.length}
        />
      </div>

      <div className="tm-toolbar">
        <label className="tm-search">
          <Icon name="search" size={18} />
          <input
            aria-label="Search facilities"
            onChange={event => setSearch(event.target.value)}
            placeholder="Search facility, city, state, or product"
            type="search"
            value={search}
          />
          {search && (
            <button
              aria-label="Clear search"
              onClick={() => setSearch('')}
              type="button"
            >
              <Icon name="close" size={16} />
            </button>
          )}
        </label>

        <div className="tm-filters" aria-label="Priority filters">
          {PRIORITIES.map(priority => {
            const active = activePriorities.has(priority)

            return (
              <button
                aria-pressed={active}
                className={active ? 'is-active' : ''}
                key={priority}
                onClick={() => togglePriority(priority)}
                style={{ '--tm-filter-color': markerColor(priority) }}
                type="button"
              >
                <span />
                {priority}
              </button>
            )
          })}

          <button
            className="tm-show-all"
            onClick={() => setActivePriorities(new Set(PRIORITIES))}
            type="button"
          >
            Show all
          </button>
        </div>
      </div>

      <div className={`tm-workspace ${panelOpen ? '' : 'is-panel-closed'}`}>
        <div className="tm-map-wrap">
          <MapContainer
            center={USA_CENTER}
            className="tm-map"
            maxZoom={18}
            minZoom={3}
            scrollWheelZoom
            zoom={USA_ZOOM}
          >
            <TileLayer
              attribution="&copy; OpenStreetMap contributors"
              maxZoom={19}
              url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            <ResetMapButton />
            <MapFocus facility={focusedFacility} />

            <MarkerClusterGroup
              chunkedLoading
              maxClusterRadius={48}
              removeOutsideVisibleBounds
              showCoverageOnHover={false}
              spiderfyOnMaxZoom
              zoomToBoundsOnClick
            >
              {visibleFacilities.map(facility => {
                const routeSelected = isInRoute(facility)

                return (
                  <Marker
                    icon={priorityMarkerIcon(facility.priority, routeSelected)}
                    key={facility._mapKey}
                    position={[facility.lat, facility.lng]}
                  >
                    <Popup>
                      <div className="tm-popup">
                        <div className="tm-popup__heading">
                          <span
                            style={{ backgroundColor: markerColor(facility.priority) }}
                          />
                          <div>
                            <strong>{facility.name}</strong>
                            <small>{facility.priority} priority</small>
                          </div>
                        </div>

                        <p>
                          {[facility.address, facility.city, facility.state]
                            .filter(Boolean)
                            .join(', ') || 'Location details unavailable'}
                        </p>

                        <div className="tm-popup__meta">
                          <span>{locationQuality(facility)}</span>
                          {routeSelected && <span>Route stop</span>}
                        </div>

                        {facility.phone && (
                          <a className="tm-popup__phone" href={`tel:${facility.phone}`}>
                            {facility.phone}
                          </a>
                        )}

                        <div className="tm-popup__actions">
                          {onSelectFacility && (
                            <button
                              onClick={() => onSelectFacility(facility)}
                              type="button"
                            >
                              View facility
                            </button>
                          )}

                          {onAddToRoute && (
                            <button
                              disabled={routeSelected}
                              onClick={() => onAddToRoute(facility)}
                              type="button"
                            >
                              {routeSelected ? 'Added to route' : 'Add to route'}
                            </button>
                          )}
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                )
              })}
            </MarkerClusterGroup>
          </MapContainer>

          <div className="tm-map-status">
            <span><b>{visibleFacilities.length}</b> visible</span>
            <span><b>{mappedFacilities.length}</b> mapped</span>
            <span><b>{unmappedFacilities.length}</b> need coordinates</span>
          </div>

          {!panelOpen && (
            <button
              className="tm-panel-toggle tm-panel-toggle--open"
              onClick={() => setPanelOpen(true)}
              type="button"
            >
              <Icon name="layers" size={17} />
              Open intelligence
            </button>
          )}
        </div>

        {panelOpen && (
          <aside className="tm-panel">
            <div className="tm-panel__header">
              <div>
                <span>Action queue</span>
                <h3>Priority intelligence</h3>
              </div>
              <button
                aria-label="Close intelligence panel"
                onClick={() => setPanelOpen(false)}
                type="button"
              >
                <Icon name="close" size={18} />
              </button>
            </div>

            <div className="tm-panel__summary">
              <div>
                <span>High-value facilities</span>
                <strong>{priorityQueue.length}</strong>
              </div>
              <div>
                <span>Active filters</span>
                <strong>{activePriorities.size}</strong>
              </div>
            </div>

            <div className="tm-queue">
              {priorityQueue.length > 0 ? (
                priorityQueue.map(facility => (
                  <button
                    className="tm-queue-item"
                    key={facility._mapKey}
                    onClick={() => focusFacility(facility)}
                    type="button"
                  >
                    <span
                      className="tm-queue-item__priority"
                      style={{ backgroundColor: markerColor(facility.priority) }}
                    />
                    <span className="tm-queue-item__content">
                      <strong>{facility.name}</strong>
                      <small>
                        {[facility.city, facility.state].filter(Boolean).join(', ') ||
                          'Location available'}
                      </small>
                      <em>{facility.priority}</em>
                    </span>
                    <Icon name="chevron" size={17} />
                  </button>
                ))
              ) : (
                <div className="tm-empty-state">
                  <Icon name="target" size={24} />
                  <strong>No priority facilities visible</strong>
                  <p>Adjust the search or priority filters to expand the queue.</p>
                </div>
              )}
            </div>

            <div className="tm-panel__footer">
              <div>
                <Icon name="pin" size={16} />
                <span>
                  {unmappedFacilities.length === 0
                    ? 'All facilities are mapped.'
                    : `${unmappedFacilities.length} facilities still need coordinates.`}
                </span>
              </div>
            </div>
          </aside>
        )}
      </div>
    </section>
  )
}
