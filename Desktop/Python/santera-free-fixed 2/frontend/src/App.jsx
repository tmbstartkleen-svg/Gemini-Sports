import { useEffect, useMemo, useState } from 'react'
import './App.css'
import FacilityDrawer from './components/FacilityDrawer'
import FacilityMap from './components/FacilityMap'
import RoutePlanner from './components/RoutePlanner'
import GeocodingPanel from './components/GeocodingPanel'

const priorityRank = {
  Critical: 4,
  High: 3,
  Medium: 2,
  Low: 1,
}

function formatDate(value) {
  const text = String(value || '')
  const match = text.match(/(20\d{2})[-/]?(\d{2})[-/]?(\d{2})/)

  if (!match) return 'Date unavailable'

  return new Date(
    `${match[1]}-${match[2]}-${match[3]}T12:00:00`
  ).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function normalizeRecall(row) {
  return {
    id: row.id,
    source: row.source || 'FDA',
    firm:
      row.firm_name ||
      row.facility_name ||
      row.company ||
      'Unknown facility',
    city: row.city || '',
    state: row.state || '',
    date:
      row.report_date ||
      row.published_date ||
      row.date ||
      '',
    classification: row.classification || 'Unclassified',
    product: row.product || row.title || 'Food product',
    reason: row.reason || row.description || '',
    score: Number(row.score || 50),
    priority: row.priority || 'Medium',
    url: row.source_url || '#',
  }
}

function normalizeProject(row) {
  return {
    id: row.id,
    title: row.title || 'Construction project',
    description: row.description || '',
    date: row.project_date || row.date || '',
    stage: row.stage || 'Project Intelligence',
    source: row.source_name || row.source || 'Public source',
    score: Number(row.score || 50),
    priority: row.priority || 'Medium',
    url: row.source_url || row.link || '#',
  }
}

function sortPriority(items) {
  return [...items].sort((a, b) => {
    const priorityDifference =
      (priorityRank[b.priority] || 0) -
      (priorityRank[a.priority] || 0)

    if (priorityDifference) return priorityDifference

    const scoreDifference =
      Number(b.score || 0) - Number(a.score || 0)

    if (scoreDifference) return scoreDifference

    return String(b.date || '').localeCompare(String(a.date || ''))
  })
}

function groupRecallFacilities(items) {
  const grouped = new Map()

  for (const item of items) {
    const company = String(item.firm || '').trim()
    const key = company.toLowerCase()

    if (!key) continue

    const current = grouped.get(key)

    if (!current) {
      grouped.set(key, {
        ...item,
        recallCount: 1,
      })
      continue
    }

    const strongest = sortPriority([current, item])[0]

    grouped.set(key, {
      ...strongest,
      firm: company,
      recallCount: current.recallCount + 1,
    })
  }

  return sortPriority([...grouped.values()])
}

function PriorityBadge({ priority, score }) {
  return (
    <span className={`priority-badge ${priority}`}>
      {score ?? priority}
    </span>
  )
}

function Sidebar({ view, setView }) {
  const navigation = [
    ['dashboard', 'Overview'],
    ['recalls', 'Recall Intelligence'],
    ['construction', 'Construction'],
    ['facilities', 'Facilities'],
    ['map', 'Facility Map'],
    ['route', 'Route Planner'],
  ]

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">S</div>

        <div>
          <strong>Santera</strong>
          <small>Facility Intelligence</small>
        </div>
      </div>

      <nav>
        {navigation.map(([id, label]) => (
          <button
            key={id}
            className={view === id ? 'nav active' : 'nav'}
            onClick={() => setView(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="database-status">
        <span className="status-dot" />
        Cloudflare D1 connected
      </div>
    </aside>
  )
}

function Dashboard({ recalls, projects, facilities }) {
  const groupedRecalls = useMemo(
    () => groupRecallFacilities(recalls),
    [recalls]
  )

  const topOpportunities = useMemo(() => {
    return sortPriority([
      ...groupedRecalls.map(item => ({
        ...item,
        type: 'recall',
        displayName: item.firm,
      })),
      ...projects.map(item => ({
        ...item,
        type: 'project',
        displayName: item.title,
      })),
    ]).slice(0, 8)
  }, [groupedRecalls, projects])

  return (
    <>
      <section className="hero">
        <div>
          <p className="eyebrow">SANTERA PRIORITY ENGINE</p>

          <h2>
            The strongest food-processing sanitation opportunities,
            ranked automatically.
          </h2>

          <p className="hero-copy">
            Live FDA and USDA recall intelligence, nationwide
            construction signals, facility records, and sales
            prioritization.
          </p>
        </div>

        <div className="score-ring">
          <strong>{topOpportunities[0]?.score || '--'}</strong>
          <span>Top priority</span>
        </div>
      </section>

      <section className="metrics">
        <article>
          <span>Recall records</span>
          <strong>{recalls.length}</strong>
          <small>Since March 1, 2026</small>
        </article>

        <article>
          <span>Unique recall prospects</span>
          <strong>{groupedRecalls.length}</strong>
          <small>Companies grouped once</small>
        </article>

        <article>
          <span>Construction leads</span>
          <strong>{projects.length}</strong>
          <small>Nationwide public sources</small>
        </article>

        <article>
          <span>Facility records</span>
          <strong>{facilities.length}</strong>
          <small>Shared D1 database</small>
        </article>
      </section>

      <section className="dashboard-grid">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">LATEST + PRIORITY</p>
              <h3>Top opportunities</h3>
            </div>
          </div>

          <div className="opportunity-list">
            {topOpportunities.map(item => (
              <div
                className="opportunity-row"
                key={`${item.type}-${item.id}`}
              >
                <div>
                  <strong>{item.displayName}</strong>

                  <small>
                    {formatDate(item.date)} ·{' '}
                    {item.type === 'recall'
                      ? item.source
                      : item.stage}
                  </small>

                  {item.type === 'recall' &&
                    item.recallCount > 1 && (
                      <small className="grouped-label">
                        {item.recallCount} recall records grouped
                      </small>
                    )}
                </div>

                <PriorityBadge
                  priority={item.priority}
                  score={item.score}
                />
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">CONSTRUCTION PIPELINE</p>
              <h3>Newest project signals</h3>
            </div>
          </div>

          <div className="opportunity-list">
            {sortPriority(projects)
              .slice(0, 7)
              .map(project => (
                <a
                  className="opportunity-row link-row"
                  key={project.id}
                  href={project.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  <div>
                    <strong>{project.title}</strong>

                    <small>
                      {formatDate(project.date)} · {project.stage}
                    </small>
                  </div>

                  <PriorityBadge
                    priority={project.priority}
                    score={project.score}
                  />
                </a>
              ))}
          </div>
        </article>
      </section>
    </>
  )
}

function RecallPage({ recalls, search }) {
  const [source, setSource] = useState('all')
  const [priority, setPriority] = useState('all')
  const [viewMode, setViewMode] = useState('facilities')

  const filteredRecords = useMemo(() => {
    return sortPriority(
      recalls.filter(item => {
        const sourceMatch =
          source === 'all' || item.source === source

        const priorityMatch =
          priority === 'all' || item.priority === priority

        const searchMatch =
          !search ||
          JSON.stringify(item)
            .toLowerCase()
            .includes(search.toLowerCase())

        return sourceMatch && priorityMatch && searchMatch
      })
    )
  }, [recalls, source, priority, search])

  const groupedFacilities = useMemo(() => {
    return groupRecallFacilities(filteredRecords)
  }, [filteredRecords])

  const displayedItems =
    viewMode === 'facilities'
      ? groupedFacilities
      : filteredRecords

  return (
    <>
      <div className="toolbar">
        <select
          value={source}
          onChange={event => setSource(event.target.value)}
        >
          <option value="all">All sources</option>
          <option value="FDA">FDA</option>
          <option value="USDA">USDA</option>
        </select>

        <select
          value={priority}
          onChange={event => setPriority(event.target.value)}
        >
          <option value="all">All priorities</option>
          <option>Critical</option>
          <option>High</option>
          <option>Medium</option>
          <option>Low</option>
        </select>

        <select
          value={viewMode}
          onChange={event => setViewMode(event.target.value)}
        >
          <option value="facilities">Group by facility</option>
          <option value="records">Show every recall record</option>
        </select>
      </div>

      <section className="card-grid">
        {displayedItems.map(item => (
          <article
            className="intelligence-card"
            key={
              viewMode === 'facilities'
                ? `${item.source}-${item.firm}`
                : item.id
            }
          >
            <div className="card-header">
              <span className="source-chip">
                {item.source} · {item.classification}
              </span>

              <PriorityBadge
                priority={item.priority}
                score={item.score}
              />
            </div>

            <h3>{item.firm}</h3>

            {viewMode === 'facilities' &&
              item.recallCount > 1 && (
                <p className="grouped-label">
                  {item.recallCount} recall records grouped
                </p>
              )}

            <p>{item.product}</p>

            <p className="reason">
              <strong>Latest reason:</strong> {item.reason}
            </p>

            <div className="card-footer">
              <span>
                {[item.city, item.state]
                  .filter(Boolean)
                  .join(', ')}
              </span>

              <span>{formatDate(item.date)}</span>
            </div>

            <a
              className="secondary-button"
              href={item.url}
              target="_blank"
              rel="noreferrer"
            >
              Latest official source
            </a>
          </article>
        ))}
      </section>
    </>
  )
}

function ConstructionPage({ projects, search }) {
  const filtered = useMemo(() => {
    return sortPriority(
      projects.filter(item =>
        !search
          ? true
          : JSON.stringify(item)
              .toLowerCase()
              .includes(search.toLowerCase())
      )
    )
  }, [projects, search])

  return (
    <section className="card-grid">
      {filtered.map(item => (
        <article className="intelligence-card" key={item.id}>
          <div className="card-header">
            <span className="source-chip">{item.stage}</span>

            <PriorityBadge
              priority={item.priority}
              score={item.score}
            />
          </div>

          <h3>{item.title}</h3>
          <p>{item.description}</p>

          <div className="card-footer">
            <span>{item.source}</span>
            <span>{formatDate(item.date)}</span>
          </div>

          <a
            className="secondary-button"
            href={item.url}
            target="_blank"
            rel="noreferrer"
          >
            Open source
          </a>
        </article>
      ))}
    </section>
  )
}

function FacilitiesPage({ facilities, search, onSelectFacility }) {
  const filtered = facilities.filter(item =>
    !search
      ? true
      : JSON.stringify(item)
          .toLowerCase()
          .includes(search.toLowerCase())
  )

  return (
    <section className="card-grid">
      {filtered.map(item => (
        <article
          className="intelligence-card"
          key={item.id}
          onClick={() => onSelectFacility(item)}
          onKeyDown={event => {
            if (event.key === 'Enter' || event.key === ' ') {
              onSelectFacility(item)
            }
          }}
          role="button"
          tabIndex={0}
        >
          <div className="card-header">
            <span className="source-chip">
              {item.status || 'Prospect'}
            </span>

            <PriorityBadge
              priority={item.priority || 'Medium'}
            />
          </div>

          <h3>{item.name}</h3>

          <p>{item.parent || 'Independent / unknown parent'}</p>

          <p>
            {[item.address, item.city, item.state]
              .filter(Boolean)
              .join(', ')}
          </p>

          <div className="card-footer">
            <span>{(item.contacts || []).length} contacts</span>
            <span>{item.phone || 'No plant phone'}</span>
          </div>
        </article>
      ))}
    </section>
  )
}

export default function App() {
  const [view, setView] = useState('dashboard')
  const [search, setSearch] = useState('')
  const [recalls, setRecalls] = useState([])
  const [projects, setProjects] = useState([])
  const [facilities, setFacilities] = useState([])
  const [routeFacilities, setRouteFacilities] = useState([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState('')
  const [selectedFacility, setSelectedFacility] = useState(null)

  function addRouteFacility(facility) {
    if (!facility) return

    setRouteFacilities(current => {
      const alreadySelected = current.some(
        item => String(item.id) === String(facility.id)
      )

      return alreadySelected ? current : [...current, facility]
    })
  }

  function removeRouteFacility(idOrFacility) {
    const id =
      typeof idOrFacility === 'object'
        ? idOrFacility?.id
        : idOrFacility

    setRouteFacilities(current =>
      current.filter(item => String(item.id) !== String(id))
    )
  }

  function clearRoute() {
    setRouteFacilities([])
  }

  async function fetchJSON(url) {
    const response = await fetch(url)

    if (!response.ok) {
      throw new Error(`${url}: ${response.status}`)
    }

    return response.json()
  }

  async function loadData() {
    setLoading(true)
    setError('')

    try {
      const [recallData, projectData, facilityData] =
        await Promise.all([
          fetchJSON('/api/recalls'),
          fetchJSON('/api/projects'),
          fetchJSON('/api/facilities'),
        ])

      setRecalls(
        (recallData.results || []).map(normalizeRecall)
      )

      setProjects(
        (projectData.results || []).map(normalizeProject)
      )

      setFacilities(facilityData.facilities || [])
    } catch (loadError) {
      setError(loadError.message)
    } finally {
      setLoading(false)
    }
  }

  async function refreshIntelligence() {
    setSyncing(true)
    setError('')

    try {
      await fetchJSON(`/api/sync?force=1&t=${Date.now()}`)
      await loadData()
    } catch (syncError) {
      setError(syncError.message)
    } finally {
      setSyncing(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const pageTitle = {
    dashboard: 'Intelligence Overview',
    recalls: 'Recall Intelligence',
    construction: 'Construction Intelligence',
    facilities: 'Facility Database',
    map: 'Facility Map',
    route: 'Route Planner',
  }[view]

  return (
    <div className="app-shell">
      <Sidebar view={view} setView={setView} />

      <main>
        <header className="topbar">
          <div>
            <p className="eyebrow">
              FOOD MANUFACTURING PROSPECTING
            </p>
            <h1>{pageTitle}</h1>
          </div>

          <div className="top-actions">
            <input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Search recalls, facilities, projects..."
            />

            <button
              className="primary-button"
              onClick={refreshIntelligence}
              disabled={syncing}
            >
              {syncing ? 'Synchronizing…' : 'Refresh intelligence'}
            </button>
          </div>
        </header>

        {error && <div className="error-banner">{error}</div>}

        {loading ? (
          <div className="loading-panel">
            Loading Santera intelligence…
          </div>
        ) : (
          <>
            {view === 'dashboard' && (
              <Dashboard
                recalls={recalls}
                projects={projects}
                facilities={facilities}
              />
            )}

            {view === 'recalls' && (
              <RecallPage recalls={recalls} search={search} />
            )}

            {view === 'construction' && (
              <ConstructionPage
                projects={projects}
                search={search}
              />
            )}

            {view === 'facilities' && (
  <>
    <GeocodingPanel />

    <FacilitiesPage
      facilities={facilities}
      search={search}
      onSelectFacility={setSelectedFacility}
    />
  </>
)}

            {view === 'map' && (
              <FacilityMap
                onOpenFacility={setSelectedFacility}
              />
            )}

            {view === 'route' && (
              <RoutePlanner
                facilities={facilities}
                routeFacilities={routeFacilities}
                onAddFacility={addRouteFacility}
                onRemoveFacility={removeRouteFacility}
                onClearRoute={clearRoute}
                onSelectFacility={setSelectedFacility}
              />
            )}
          </>
        )}
      </main>

      {selectedFacility && (
        <FacilityDrawer
          facility={selectedFacility}
          recalls={recalls}
          projects={projects}
          onClose={() => setSelectedFacility(null)}
          onAddToRoute={addRouteFacility}
          onRemoveFromRoute={removeRouteFacility}
          isInRoute={routeFacilities.some(
            item =>
              String(item.id) === String(selectedFacility.id)
          )}
        />
      )}
    </div>
  )
}