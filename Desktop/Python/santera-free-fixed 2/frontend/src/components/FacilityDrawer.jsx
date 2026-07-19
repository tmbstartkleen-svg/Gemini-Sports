import { useEffect, useMemo, useState } from 'react'
import './FacilityDrawer.css'

function normalize(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
}

function formatDate(value) {
  if (!value) return 'Date unavailable'

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return 'Date unavailable'
  }

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function scoreFacility(facility, recalls, projects) {
  let score = Number(
    facility.opportunity_score ||
    facility.score ||
    45
  )

  const criticalRecalls = recalls.filter(
    item => item.priority === 'Critical'
  ).length

  const highRecalls = recalls.filter(
    item => item.priority === 'High'
  ).length

  score += Math.min(criticalRecalls * 18, 36)
  score += Math.min(highRecalls * 10, 20)
  score += Math.min(projects.length * 12, 24)

  if (facility.priority === 'Critical') score += 15
  if (facility.priority === 'High') score += 10
  if (facility.phone) score += 3
  if (facility.website) score += 3
  if ((facility.contacts || []).length) score += 5

  return Math.max(0, Math.min(100, score))
}

function scoreLabel(score) {
  if (score >= 90) return 'Hot opportunity'
  if (score >= 75) return 'High potential'
  if (score >= 55) return 'Active prospect'
  return 'Monitor'
}

function buildAddress(facility) {
  return [
    facility.address,
    facility.city,
    facility.state,
  ]
    .filter(Boolean)
    .join(', ')
}

function createMapsUrl(facility) {
  const address = buildAddress(facility)

  if (!address) return ''

  return (
    'https://www.google.com/maps/search/?api=1&query=' +
    encodeURIComponent(address)
  )
}


function createVacationRentalUrl(facility) {
  const destination = [facility.city, facility.state]
    .filter(Boolean)
    .join(', ') || buildAddress(facility)

  if (!destination) return ''

  return (
    'https://www.google.com/search?q=' +
    encodeURIComponent(`vacation rentals near ${destination}`)
  )
}

function NearbyPanel({ facility }) {
  const [category, setCategory] = useState('hotels')
  const [radius, setRadius] = useState(10)
  const [places, setPlaces] = useState([])
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')

  const lat = Number(facility.lat)
  const lng = Number(facility.lng)
  const hasCoordinates = Number.isFinite(lat) && Number.isFinite(lng)
  const vacationRentalUrl = createVacationRentalUrl(facility)

  useEffect(() => {
    if (!hasCoordinates || category === 'rentals') return undefined

    const controller = new AbortController()

    async function loadNearby() {
      setStatus('loading')
      setError('')

      try {
        const params = new URLSearchParams({
          lat: String(lat),
          lng: String(lng),
          radius: String(radius),
          category,
        })
        const response = await fetch(`/api/nearby?${params}`, {
          signal: controller.signal,
        })
        const payload = await response.json()

        if (!response.ok) {
          throw new Error(payload.detail || payload.error || 'Nearby search failed.')
        }

        setPlaces(Array.isArray(payload.places) ? payload.places : [])
        setStatus('ready')
      } catch (loadError) {
        if (loadError.name === 'AbortError') return
        setPlaces([])
        setError(loadError.message || 'Nearby search failed.')
        setStatus('error')
      }
    }

    loadNearby()
    return () => controller.abort()
  }, [category, hasCoordinates, lat, lng, radius])

  return (
    <section className="facility-drawer-section">
      <div className="facility-section-heading">
        <h3>Nearby travel</h3>
        <span>{category === 'rentals' ? 'External search' : `${places.length} found`}</span>
      </div>

      <div className="nearby-category-tabs">
        {[
          ['hotels', 'Hotels'],
          ['rentals', 'Vacation rentals'],
          ['sitdown', 'Sit-down'],
          ['fastfood', 'Fast food'],
        ].map(([value, label]) => (
          <button
            type="button"
            className={category === value ? 'active' : ''}
            key={value}
            onClick={() => setCategory(value)}
          >
            {label}
          </button>
        ))}
      </div>

      {category !== 'rentals' && (
        <label className="nearby-radius-control">
          <span>Search radius</span>
          <select value={radius} onChange={event => setRadius(Number(event.target.value))}>
            {[5, 10, 25, 50].map(value => (
              <option key={value} value={value}>{value} miles</option>
            ))}
          </select>
        </label>
      )}

      {!hasCoordinates ? (
        <EmptyState>
          This facility needs latitude and longitude before nearby places can be searched.
        </EmptyState>
      ) : category === 'rentals' ? (
        <div className="nearby-rental-card">
          <strong>Vacation-rental search</strong>
          <p>
            Direct Airbnb inventory is not exposed through a public listing API. Use this search to compare vacation rentals near the selected facility without presenting unverified availability or pricing.
          </p>
          {vacationRentalUrl && (
            <a href={vacationRentalUrl} target="_blank" rel="noreferrer">
              Search vacation rentals
            </a>
          )}
        </div>
      ) : status === 'loading' ? (
        <EmptyState>Searching nearby places…</EmptyState>
      ) : status === 'error' ? (
        <EmptyState>{error}</EmptyState>
      ) : !places.length ? (
        <EmptyState>No matching places were found within {radius} miles.</EmptyState>
      ) : (
        <div className="nearby-place-list">
          {places.map(place => (
            <article className="nearby-place-card" key={place.id}>
              <div className="nearby-place-heading">
                <div>
                  <strong>{place.name}</strong>
                  <span>
                    {place.distance_miles} mi
                    {place.cuisine ? ` · ${place.cuisine}` : ''}
                  </span>
                </div>
                <span className="nearby-distance">{place.distance_miles} mi</span>
              </div>

              {(place.address || place.opening_hours) && (
                <p>
                  {place.address || 'Address unavailable'}
                  {place.opening_hours ? ` · ${place.opening_hours}` : ''}
                </p>
              )}

              <div className="nearby-place-actions">
                {place.phone && <a href={`tel:${place.phone}`}>Call</a>}
                {place.website && (
                  <a href={place.website} target="_blank" rel="noreferrer">Website</a>
                )}
                <a href={place.directions_url} target="_blank" rel="noreferrer">Directions</a>
              </div>
            </article>
          ))}
        </div>
      )}

      <p className="nearby-source-note">Place data © OpenStreetMap contributors.</p>
    </section>
  )
}

function DrawerTab({
  active,
  children,
  onClick,
}) {
  return (
    <button
      type="button"
      className={
        active
          ? 'facility-drawer-tab active'
          : 'facility-drawer-tab'
      }
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function EmptyState({ children }) {
  return (
    <p className="facility-drawer-empty">
      {children}
    </p>
  )
}

export default function FacilityDrawer({
  facility,
  recalls = [],
  projects = [],
  onClose,
  onAddToRoute,
  onRemoveFromRoute,
  isInRoute = false,
}) {
  const [activeTab, setActiveTab] = useState('overview')

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        onClose?.()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener(
        'keydown',
        handleKeyDown
      )
    }
  }, [onClose])

  useEffect(() => {
    setActiveTab('overview')
  }, [facility?.id])

  const facilityName =
    facility?.name ||
    facility?.firm ||
    'Unknown facility'

  const relatedRecalls = useMemo(() => {
    const selectedName = normalize(facilityName)

    return recalls
      .filter(recall => {
        const recallName = normalize(
          recall.firm ||
          recall.company ||
          recall.facility_name
        )

        return (
          recallName.includes(selectedName) ||
          selectedName.includes(recallName)
        )
      })
      .sort((a, b) =>
        String(
          b.date ||
          b.report_date ||
          b.published_date ||
          ''
        ).localeCompare(
          String(
            a.date ||
            a.report_date ||
            a.published_date ||
            ''
          )
        )
      )
  }, [facilityName, recalls])

  const relatedProjects = useMemo(() => {
    const selectedName = normalize(facilityName)
    const selectedParent = normalize(facility?.parent)

    return projects
      .filter(project => {
        const text = normalize(
          [
            project.title,
            project.description,
            project.company,
          ]
            .filter(Boolean)
            .join(' ')
        )

        return (
          text.includes(selectedName) ||
          (
            selectedParent &&
            text.includes(selectedParent)
          )
        )
      })
      .sort((a, b) =>
        String(
          b.date ||
          b.project_date ||
          ''
        ).localeCompare(
          String(
            a.date ||
            a.project_date ||
            ''
          )
        )
      )
  }, [facilityName, facility?.parent, projects])

  const opportunityScore = useMemo(
    () =>
      scoreFacility(
        facility || {},
        relatedRecalls,
        relatedProjects
      ),
    [facility, relatedRecalls, relatedProjects]
  )

  if (!facility) return null

  const address = buildAddress(facility)
  const mapsUrl = createMapsUrl(facility)
  const contacts = facility.contacts || []

  return (
    <div
      className="facility-drawer-overlay"
      onClick={onClose}
    >
      <aside
        className="facility-intelligence-drawer"
        onClick={event => event.stopPropagation()}
      >
        <header className="facility-drawer-header">
          <div>
            <p className="eyebrow">
              FACILITY INTELLIGENCE
            </p>

            <h2>{facilityName}</h2>

            <p>
              {address || 'Location unavailable'}
            </p>
          </div>

          <button
            type="button"
            className="facility-drawer-close"
            onClick={onClose}
            aria-label="Close facility intelligence"
          >
            ×
          </button>
        </header>

        <section className="facility-score-card">
          <div className="facility-score-copy">
            <span>Opportunity score</span>
            <strong>{opportunityScore}</strong>
            <small>
              {scoreLabel(opportunityScore)}
            </small>
          </div>

          <div
            className="facility-score-ring"
            style={{
              '--facility-score':
                `${opportunityScore * 3.6}deg`,
            }}
          >
            <span>{opportunityScore}</span>
          </div>
        </section>

        <nav className="facility-drawer-tabs">
          <DrawerTab
            active={activeTab === 'overview'}
            onClick={() => setActiveTab('overview')}
          >
            Overview
          </DrawerTab>

          <DrawerTab
            active={activeTab === 'timeline'}
            onClick={() => setActiveTab('timeline')}
          >
            Timeline
          </DrawerTab>

          <DrawerTab
            active={activeTab === 'contacts'}
            onClick={() => setActiveTab('contacts')}
          >
            Contacts
          </DrawerTab>

          <DrawerTab
            active={activeTab === 'nearby'}
            onClick={() => setActiveTab('nearby')}
          >
            Nearby
          </DrawerTab>

          <DrawerTab
            active={activeTab === 'notes'}
            onClick={() => setActiveTab('notes')}
          >
            Notes
          </DrawerTab>
        </nav>

        <div className="facility-drawer-content">
          {activeTab === 'overview' && (
            <>
              <section className="facility-drawer-section">
                <div className="facility-section-heading">
                  <h3>Facility profile</h3>
                  <span>
                    {facility.status || 'Prospect'}
                  </span>
                </div>

                <dl className="facility-detail-grid">
                  <div>
                    <dt>Parent company</dt>
                    <dd>
                      {facility.parent ||
                        'Not available'}
                    </dd>
                  </div>

                  <div>
                    <dt>Category</dt>
                    <dd>
                      {facility.category ||
                        'Not available'}
                    </dd>
                  </div>

                  <div>
                    <dt>Products</dt>
                    <dd>
                      {facility.products ||
                        'Not available'}
                    </dd>
                  </div>

                  <div>
                    <dt>Plant phone</dt>
                    <dd>
                      {facility.phone ||
                        'Not available'}
                    </dd>
                  </div>

                  <div>
                    <dt>Website</dt>
                    <dd>
                      {facility.website ||
                        'Not available'}
                    </dd>
                  </div>

                  <div>
                    <dt>USDA establishment</dt>
                    <dd>
                      {facility.establishment_number ||
                        'Not available'}
                    </dd>
                  </div>
                </dl>
              </section>

              <section className="facility-drawer-section">
                <div className="facility-section-heading">
                  <h3>Intelligence summary</h3>
                </div>

                <div className="facility-intelligence-summary">
                  <article>
                    <strong>
                      {relatedRecalls.length}
                    </strong>
                    <span>Linked recalls</span>
                  </article>

                  <article>
                    <strong>
                      {relatedProjects.length}
                    </strong>
                    <span>Growth signals</span>
                  </article>

                  <article>
                    <strong>{contacts.length}</strong>
                    <span>Contacts</span>
                  </article>

                  <article>
                    <strong>
                      {facility.priority || 'Medium'}
                    </strong>
                    <span>Priority</span>
                  </article>
                </div>
              </section>

              <section className="facility-drawer-section">
                <div className="facility-section-heading">
                  <h3>Recommended action</h3>
                </div>

                <div className="facility-recommendation">
                  <span>Next best action</span>

                  <strong>
                    {opportunityScore >= 85
                      ? 'Request a plant visit'
                      : opportunityScore >= 70
                        ? 'Begin direct outreach'
                        : 'Continue monitoring'}
                  </strong>

                  <p>
                    {relatedRecalls.length
                      ? 'Use recent food-safety activity as context while emphasizing preventive sanitation, transition planning and multi-shift support.'
                      : relatedProjects.length
                        ? 'Lead with growth support, staffing stability and scalable sanitation coverage.'
                        : 'Confirm the facility profile, identify decision-makers and build the relationship before presenting service options.'}
                  </p>
                </div>
              </section>
            </>
          )}

          {activeTab === 'timeline' && (
            <section className="facility-drawer-section">
              <div className="facility-section-heading">
                <h3>Intelligence timeline</h3>

                <span>
                  {relatedRecalls.length +
                    relatedProjects.length}{' '}
                  events
                </span>
              </div>

              {!relatedRecalls.length &&
              !relatedProjects.length ? (
                <EmptyState>
                  No linked intelligence events were found.
                </EmptyState>
              ) : (
                <div className="facility-timeline">
                  {[
                    ...relatedRecalls.map(item => ({
                      id: `recall-${item.id}`,
                      type: 'Food safety',
                      title:
                        item.product ||
                        item.title ||
                        'Recall activity',
                      date:
                        item.date ||
                        item.report_date ||
                        item.published_date,
                      detail:
                        item.reason ||
                        item.description ||
                        '',
                    })),
                    ...relatedProjects.map(item => ({
                      id: `project-${item.id}`,
                      type: 'Growth',
                      title:
                        item.title ||
                        'Growth project',
                      date:
                        item.date ||
                        item.project_date,
                      detail:
                        item.description || '',
                    })),
                  ]
                    .sort((a, b) =>
                      String(b.date || '').localeCompare(
                        String(a.date || '')
                      )
                    )
                    .map(event => (
                      <article
                        className="facility-timeline-item"
                        key={event.id}
                      >
                        <span
                          className={
                            event.type === 'Food safety'
                              ? 'facility-timeline-dot recall'
                              : 'facility-timeline-dot growth'
                          }
                        />

                        <div>
                          <small>
                            {event.type} ·{' '}
                            {formatDate(event.date)}
                          </small>

                          <strong>{event.title}</strong>

                          {event.detail && (
                            <p>{event.detail}</p>
                          )}
                        </div>
                      </article>
                    ))}
                </div>
              )}
            </section>
          )}

          {activeTab === 'contacts' && (
            <section className="facility-drawer-section">
              <div className="facility-section-heading">
                <h3>Facility contacts</h3>
                <span>{contacts.length}</span>
              </div>

              {!contacts.length ? (
                <EmptyState>
                  No facility contacts have been added.
                </EmptyState>
              ) : (
                <div className="facility-contact-list">
                  {contacts.map(contact => (
                    <article
                      className="facility-contact-card"
                      key={
                        contact.id ||
                        contact.email ||
                        contact.name
                      }
                    >
                      <div>
                        <strong>
                          {contact.name ||
                            'Unnamed contact'}
                        </strong>

                        <span>
                          {contact.role ||
                            'Facility contact'}
                        </span>
                      </div>

                      <div className="facility-contact-actions">
                        {contact.phone && (
                          <a
                            href={`tel:${contact.phone}`}
                          >
                            Call
                          </a>
                        )}

                        {contact.email && (
                          <a
                            href={`mailto:${contact.email}`}
                          >
                            Email
                          </a>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}

          {activeTab === 'nearby' && (
            <NearbyPanel facility={facility} />
          )}

          {activeTab === 'notes' && (
            <section className="facility-drawer-section">
              <div className="facility-section-heading">
                <h3>Facility notes</h3>
              </div>

              {typeof facility.notes === 'string' &&
              facility.notes ? (
                <p className="facility-notes-copy">
                  {facility.notes}
                </p>
              ) : Array.isArray(facility.notes) &&
                facility.notes.length ? (
                <div className="facility-note-list">
                  {facility.notes.map((note, index) => (
                    <article key={note.id || index}>
                      <p>
                        {note.text ||
                          note.note ||
                          String(note)}
                      </p>

                      {note.created_at && (
                        <small>
                          {formatDate(
                            note.created_at
                          )}
                        </small>
                      )}
                    </article>
                  ))}
                </div>
              ) : (
                <EmptyState>
                  No facility notes have been added.
                </EmptyState>
              )}
            </section>
          )}
        </div>

        <footer className="facility-drawer-actions">
          {facility.phone && (
            <a
              className="facility-action secondary"
              href={`tel:${facility.phone}`}
            >
              Call plant
            </a>
          )}

          {facility.website && (
            <a
              className="facility-action secondary"
              href={facility.website}
              target="_blank"
              rel="noreferrer"
            >
              Website
            </a>
          )}

          {mapsUrl && (
            <a
              className="facility-action secondary"
              href={mapsUrl}
              target="_blank"
              rel="noreferrer"
            >
              Directions
            </a>
          )}

          <button
            type="button"
            className={
              isInRoute
                ? 'facility-action route added'
                : 'facility-action route'
            }
            onClick={() => {
              if (isInRoute) {
                onRemoveFromRoute?.(facility.id)
              } else {
                onAddToRoute?.(facility)
              }
            }}
          >
            {isInRoute
              ? 'Remove from route'
              : 'Add to route'}
          </button>
        </footer>
      </aside>
    </div>
  )
}
