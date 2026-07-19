import { useEffect, useMemo, useState } from 'react'
import {
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
} from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'react-leaflet-cluster/dist/assets/MarkerCluster.css'
import 'react-leaflet-cluster/dist/assets/MarkerCluster.Default.css'
import './FacilityMap.css'

const DEFAULT_CENTER = [39.8283, -98.5795]

function FitBounds({ facilities }) {
  const map = useMap()

  useEffect(() => {
    if (!facilities.length) {
      map.setView(DEFAULT_CENTER, 4)
      return
    }

    map.fitBounds(
      L.latLngBounds(
        facilities.map(facility => [
          Number(facility.lat),
          Number(facility.lng),
        ])
      ),
      {
        padding: [40, 40],
        maxZoom: 11,
      }
    )
  }, [facilities, map])

  return null
}

const markerIcon = L.divIcon({
  className: 'facility-marker-wrapper',
  html: '<span class="facility-marker"></span>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
  popupAnchor: [0, -10],
})

export default function FacilityMap({ onOpenFacility }) {
  const [facilities, setFacilities] = useState([])
  const [search, setSearch] = useState('')
  const [stateFilter, setStateFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function loadFacilities() {
      try {
        setLoading(true)
        setError('')

        const response = await fetch(
          '/api/facilities?mapped=1'
        )

        const data = await response.json()

        if (!response.ok) {
          throw new Error(
            data.detail ||
              data.error ||
              `Request failed with status ${response.status}`
          )
        }

        if (!cancelled) {
          setFacilities(data.facilities || [])
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(
            requestError?.message ||
              'Could not load facilities.'
          )
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadFacilities()

    return () => {
      cancelled = true
    }
  }, [])

  const states = useMemo(
    () =>
      [
        ...new Set(
          facilities
            .map(facility => facility.state)
            .filter(Boolean)
        ),
      ].sort(),
    [facilities]
  )

  const visibleFacilities = useMemo(() => {
    const query = search.trim().toLowerCase()

    return facilities.filter(facility => {
      const searchable = [
        facility.name,
        facility.address,
        facility.city,
        facility.state,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return (
        (!query || searchable.includes(query)) &&
        (!stateFilter ||
          facility.state === stateFilter)
      )
    })
  }, [facilities, search, stateFilter])

  const visibleStateCount = new Set(
    visibleFacilities
      .map(facility => facility.state)
      .filter(Boolean)
  ).size

  return (
    <section className="facility-map-page">
      <header>
        <p className="facility-map-page__eyebrow">
          Data Management
        </p>

        <h2>Facility Map</h2>

        <p>
          Explore mapped facilities and open individual
          facility records.
        </p>
      </header>

      <div className="facility-map-stats">
        <div>
          <span>Mapped Facilities</span>
          <strong>{facilities.length}</strong>
        </div>

        <div>
          <span>Visible</span>
          <strong>{visibleFacilities.length}</strong>
        </div>

        <div>
          <span>States</span>
          <strong>{visibleStateCount}</strong>
        </div>
      </div>

      <div className="facility-map-filters">
        <label>
          Search

          <input
            type="search"
            value={search}
            onChange={event =>
              setSearch(event.target.value)
            }
            placeholder="Facility, city, or address..."
          />
        </label>

        <label>
          State

          <select
            value={stateFilter}
            onChange={event =>
              setStateFilter(event.target.value)
            }
          >
            <option value="">All states</option>

            {states.map(state => (
              <option key={state} value={state}>
                {state}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={() => {
            setSearch('')
            setStateFilter('')
          }}
        >
          Clear filters
        </button>
      </div>

      {error && (
        <div className="facility-map-page__error">
          {error}
        </div>
      )}

      <div className="facility-map-shell">
        {loading ? (
          <div className="facility-map-placeholder">
            Loading facilities...
          </div>
        ) : visibleFacilities.length === 0 ? (
          <div className="facility-map-placeholder">
            No mapped facilities match these filters.
          </div>
        ) : (
          <MapContainer
            center={DEFAULT_CENTER}
            zoom={4}
            scrollWheelZoom
            className="facility-map"
          >
            <TileLayer
              attribution="&copy; OpenStreetMap contributors"
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            <FitBounds
              facilities={visibleFacilities}
            />

            <MarkerClusterGroup
              chunkedLoading
              showCoverageOnHover={false}
            >
              {visibleFacilities.map(facility => (
                <Marker
                  key={facility.id}
                  position={[
                    Number(facility.lat),
                    Number(facility.lng),
                  ]}
                  icon={markerIcon}
                >
                  <Popup>
                    <article className="facility-map-popup">
                      <h3>{facility.name}</h3>

                      <p>
                        {[
                          facility.address,
                          [
                            facility.city,
                            facility.state,
                          ]
                            .filter(Boolean)
                            .join(', '),
                        ]
                          .filter(Boolean)
                          .join(' — ')}
                      </p>

                      <p>
                        <strong>Status:</strong>{' '}
                        {facility.status}
                      </p>

                      {onOpenFacility && (
                        <button
                          type="button"
                          onClick={() =>
                            onOpenFacility(facility)
                          }
                        >
                          Open Facility
                        </button>
                      )}
                    </article>
                  </Popup>
                </Marker>
              ))}
            </MarkerClusterGroup>
          </MapContainer>
        )}
      </div>
    </section>
  )
}
