const navigation = [
  ['dashboard', 'Overview'],
  ['recalls', 'Recall Intelligence'],
  ['construction', 'Construction'],
  ['facilities', 'Facilities'],
  ['map', 'Territory Map'],
  ['route', 'Route Planner'],
]

export default function Sidebar({ view, setView }) {
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
