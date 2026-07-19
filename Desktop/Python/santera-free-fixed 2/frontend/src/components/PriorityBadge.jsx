export default function PriorityBadge({
  priority = 'Medium',
  score,
}) {
  return (
    <span className={`priority-badge ${priority}`}>
      {score ?? priority}
    </span>
  )
}
