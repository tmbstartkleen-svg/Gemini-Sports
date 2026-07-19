const titles = {
  dashboard: 'Intelligence Overview',
  recalls: 'Recall Intelligence',
  construction: 'Construction Intelligence',
  facilities: 'Facility Database',
  map: 'Territory Map',
  route: 'Route Planner',
}

export default function Topbar({
  view,
  search,
  setSearch,
  syncing,
  onRefresh,
}) {
  return (
    <header className="topbar">
      <div>
        <p className="eyebrow">
          FOOD MANUFACTURING PROSPECTING
        </p>

        <h1>{titles[view] || 'Santera'}</h1>
      </div>

      <div className="top-actions">
        <input
          value={search}
          onChange={event => setSearch(event.target.value)}
          placeholder="Search recalls, facilities, projects..."
        />

        <button
          className="primary-button"
          onClick={onRefresh}
          disabled={syncing}
        >
          {syncing
            ? 'Synchronizing…'
            : 'Refresh intelligence'}
        </button>
      </div>
    </header>
  )
}
