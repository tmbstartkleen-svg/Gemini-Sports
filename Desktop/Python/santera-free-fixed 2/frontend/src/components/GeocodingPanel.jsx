import { useRef, useState } from 'react'

export default function GeocodingPanel({
  onFacilitiesUpdated,
}) {
  const [batchSize, setBatchSize] = useState('10')
  const [result, setResult] = useState(null)
  const [running, setRunning] = useState(false)
  const [autoRunning, setAutoRunning] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [error, setError] = useState('')
  const stopRequested = useRef(false)

  async function runBatch(
    limit = batchSize,
    retryFailed = false
  ) {
    const safeLimit = Math.max(
      1,
      Math.min(25, Number(limit) || 10)
    )

    setError('')

    if (retryFailed) {
      setRetrying(true)
    } else {
      setRunning(true)
    }

    try {
      const params = new URLSearchParams({
        limit: String(safeLimit),
      })

      if (retryFailed) {
        params.set('retry_failed', '1')
      }

      const response = await fetch(
        `/api/geocode?${params.toString()}`,
        {
          method: 'POST',
          headers: {
            Accept: 'application/json',
          },
        }
      )

      const responseText = await response.text()
      let data = {}

      if (responseText) {
        try {
          data = JSON.parse(responseText)
        } catch {
          data = {}
        }
      }

      if (!response.ok) {
        throw new Error(
          data.detail ||
            data.error ||
            responseText ||
            `Request failed with status ${response.status}`
        )
      }

      setResult(data)

      if (Number(data.updated_count) > 0) {
        await onFacilitiesUpdated?.()
      }

      return data
    } catch (requestError) {
      console.error(
        'Geocoding request failed:',
        requestError
      )

      setError(
        requestError?.message ||
          'Could not reach the geocoding service.'
      )

      return null
    } finally {
      setRunning(false)
      setRetrying(false)
    }
  }

  async function runAll() {
    stopRequested.current = false
    setAutoRunning(true)
    setError('')

    try {
      while (!stopRequested.current) {
        const data = await runBatch(batchSize)

        if (!data) {
          break
        }

        const pending = Number(
          data.totals?.pending_facilities || 0
        )

        const updated = Number(
          data.updated_count || 0
        )

        const processed = Number(
          data.processed || 0
        )

        if (
          pending === 0 ||
          processed === 0 ||
          updated === 0
        ) {
          if (pending > 0 && updated === 0) {
            setError(
              `${pending} pending facilities could not be geocoded automatically.`
            )
          }

          break
        }

        await new Promise(resolve =>
          setTimeout(resolve, 500)
        )
      }
    } finally {
      setAutoRunning(false)
    }
  }

  function stopAll() {
    stopRequested.current = true
  }

  const totals = result?.totals || {}

  const totalFacilities = Number(
    totals.all_facilities || 0
  )

  const mappedFacilities = Number(
    totals.mapped_facilities || 0
  )

  const pendingFacilities = Number(
    totals.pending_facilities || 0
  )

  const needsReviewFacilities = Number(
    totals.skipped_facilities || 0
  )

  const excludedFacilities = Number(
    totals.failed_facilities || 0
  )

  const mappedPercent =
    totalFacilities > 0
      ? Math.round(
          (mappedFacilities / totalFacilities) * 100
        )
      : 0

  const needsAttention = (
    result?.needs_attention || []
  ).filter(facility => facility.status === 'skipped')

  const controlsDisabled =
    running || autoRunning || retrying

  return (
    <section className="geocoding-panel">
      <div className="geocoding-panel__header">
        <div>
          <p className="geocoding-panel__eyebrow">
            Data Management
          </p>

          <h2>Facility Geocoding</h2>

          <p>
            Add map coordinates to U.S. facilities
            that do not have latitude and longitude.
          </p>
        </div>

        <div className="geocoding-panel__actions">
          <label>
            Batch size

            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={batchSize}
              disabled={controlsDisabled}
              onChange={event => {
                const value =
                  event.target.value.replace(/\D/g, '')

                setBatchSize(value)
              }}
              placeholder="10"
            />
          </label>

          <button
            type="button"
            onClick={() => runBatch(batchSize)}
            disabled={controlsDisabled}
          >
            {running && !autoRunning
              ? 'Processing...'
              : 'Run Batch'}
          </button>

          {!autoRunning ? (
            <button
              type="button"
              onClick={runAll}
              disabled={controlsDisabled}
              className="primary"
            >
              Geocode All
            </button>
          ) : (
            <button
              type="button"
              onClick={stopAll}
              className="danger"
            >
              Stop
            </button>
          )}

          <button
            type="button"
            onClick={() =>
              runBatch(batchSize, true)
            }
            disabled={controlsDisabled}
          >
            {retrying
              ? 'Retrying...'
              : 'Retry Failed'}
          </button>
        </div>
      </div>

      {error && (
        <div className="geocoding-panel__error">
          {error}
        </div>
      )}

      {result ? (
        <>
          <div className="geocoding-stats">
            <Stat
              label="All Facilities"
              value={totalFacilities}
            />

            <Stat
              label="Mapped"
              value={mappedFacilities}
            />

            <Stat
              label="Pending"
              value={pendingFacilities}
            />

            <Stat
              label="Needs Review"
              value={needsReviewFacilities}
            />
          </div>

          <div className="geocoding-progress">
            <div className="geocoding-progress__labels">
              <span>
                Mapping progress — {mappedFacilities} of{' '}
                {totalFacilities}
              </span>

              <strong>{mappedPercent}%</strong>
            </div>

            <div className="geocoding-progress__track">
              <div
                className="geocoding-progress__bar"
                style={{
                  width: `${mappedPercent}%`,
                }}
              />
            </div>
          </div>

          <div className="geocoding-summary">
            <span>
              Processed: {result.processed || 0}
            </span>

            <span>
              Updated: {result.updated_count || 0}
            </span>

            <span>
              Needs review:{' '}
              {result.skipped_count || 0}
            </span>
          </div>

          {excludedFacilities > 0 && (
            <p className="geocoding-excluded-note">
              {excludedFacilities} international or
              unmatched{' '}
              {excludedFacilities === 1
                ? 'facility is'
                : 'facilities are'}{' '}
              excluded from U.S. geocoding.
            </p>
          )}

          <NeedsAttentionTable
            facilities={needsAttention}
          />
        </>
      ) : (
        <p className="geocoding-panel__empty">
          Enter a batch size, then click Run Batch.
        </p>
      )}
    </section>
  )
}

function Stat({ label, value }) {
  return (
    <div className="geocoding-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function NeedsAttentionTable({ facilities }) {
  if (!facilities.length) {
    return (
      <div className="geocoding-attention">
        <h3>Needs Review</h3>

        <p>
          No actionable U.S. facility records need
          attention.
        </p>
      </div>
    )
  }

  return (
    <div className="geocoding-attention">
      <div className="geocoding-attention__header">
        <div>
          <h3>Needs Review</h3>

          <p>
            These U.S. facility records are missing
            usable location information.
          </p>
        </div>

        <strong>{facilities.length}</strong>
      </div>

      <div className="geocoding-attention__table-wrap">
        <table className="geocoding-attention__table">
          <thead>
            <tr>
              <th>Facility</th>
              <th>Address</th>
              <th>Status</th>
              <th>Reason</th>
            </tr>
          </thead>

          <tbody>
            {facilities.map(facility => (
              <tr key={facility.id}>
                <td>{facility.name}</td>

                <td>
                  {formatAddress(facility)}
                </td>

                <td>
                  <span className="geocode-status geocode-status--needs-review">
                    Needs review
                  </span>
                </td>

                <td>{facility.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function formatAddress(facility) {
  const cityState = [
    facility.city,
    facility.state,
  ]
    .filter(Boolean)
    .join(', ')

  return (
    [facility.address, cityState]
      .filter(Boolean)
      .join(' — ') || 'No usable address'
  )
}