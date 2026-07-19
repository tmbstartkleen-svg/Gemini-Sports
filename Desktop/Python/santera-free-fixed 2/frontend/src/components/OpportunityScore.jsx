import './OpportunityScore.css'

export default function OpportunityScore({
  opportunity,
  compact = false,
}) {
  if (!opportunity) return null

  return (
    <section
      className={
        compact
          ? 'opportunity-score compact'
          : 'opportunity-score'
      }
    >
      <div
        className="opportunity-score-ring"
        style={{
          '--opportunity-progress':
            `${opportunity.score * 3.6}deg`,
        }}
      >
        <strong>{opportunity.score}</strong>
      </div>

      <div className="opportunity-score-copy">
        <span>Opportunity score</span>
        <strong>{opportunity.label}</strong>

        {!compact && (
          <small>
            {opportunity.recommendedAction}
          </small>
        )}
      </div>
    </section>
  )
}
