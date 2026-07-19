const PRIORITY_POINTS = {
  Critical: 24,
  High: 16,
  Medium: 9,
  Low: 4,
}

function normalize(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
}

function parseDate(value) {
  if (!value) return null

  const date = new Date(value)

  return Number.isNaN(date.getTime())
    ? null
    : date
}

function daysSince(value) {
  const date = parseDate(value)

  if (!date) return null

  const milliseconds =
    Date.now() - date.getTime()

  return Math.max(
    0,
    Math.floor(
      milliseconds / (1000 * 60 * 60 * 24)
    )
  )
}

function eventDate(item) {
  return (
    item.date ||
    item.report_date ||
    item.published_date ||
    item.project_date ||
    item.updated_at ||
    item.created_at
  )
}

function matchesFacility(item, facility) {
  const facilityName = normalize(
    facility.name || facility.firm
  )

  const parentName = normalize(facility.parent)

  const searchable = normalize(
    [
      item.firm,
      item.company,
      item.facility_name,
      item.title,
      item.description,
      item.parent,
    ]
      .filter(Boolean)
      .join(' ')
  )

  if (
    facilityName &&
    (
      searchable.includes(facilityName) ||
      facilityName.includes(searchable)
    )
  ) {
    return true
  }

  return Boolean(
    parentName &&
    searchable.includes(parentName)
  )
}

function addReason(reasons, label, points, detail) {
  if (!points) return

  reasons.push({
    label,
    points,
    detail,
  })
}

export function calculateOpportunity({
  facility = {},
  recalls = [],
  projects = [],
}) {
  const relatedRecalls = recalls.filter(item =>
    matchesFacility(item, facility)
  )

  const relatedProjects = projects.filter(item =>
    matchesFacility(item, facility)
  )

  const reasons = []
  let score = 18

  const priority =
    facility.priority || 'Medium'

  const priorityPoints =
    PRIORITY_POINTS[priority] || 8

  score += priorityPoints

  addReason(
    reasons,
    `${priority} facility priority`,
    priorityPoints,
    'Manual or imported facility priority.'
  )

  const criticalRecalls =
    relatedRecalls.filter(
      item => item.priority === 'Critical'
    )

  const highRecalls =
    relatedRecalls.filter(
      item => item.priority === 'High'
    )

  const recallPoints = Math.min(
    criticalRecalls.length * 18 +
      highRecalls.length * 10 +
      Math.max(
        0,
        relatedRecalls.length -
          criticalRecalls.length -
          highRecalls.length
      ) * 4,
    38
  )

  score += recallPoints

  if (relatedRecalls.length) {
    addReason(
      reasons,
      `${relatedRecalls.length} linked recall${
        relatedRecalls.length === 1 ? '' : 's'
      }`,
      recallPoints,
      criticalRecalls.length
        ? `${criticalRecalls.length} critical recall signal(s).`
        : 'Recent food-safety activity increases urgency.'
    )
  }

  const newestRecall = relatedRecalls
    .map(item => ({
      item,
      days: daysSince(eventDate(item)),
    }))
    .filter(entry => entry.days !== null)
    .sort((a, b) => a.days - b.days)[0]

  if (newestRecall) {
    let recencyPoints = 0

    if (newestRecall.days <= 30) {
      recencyPoints = 14
    } else if (newestRecall.days <= 90) {
      recencyPoints = 10
    } else if (newestRecall.days <= 180) {
      recencyPoints = 6
    }

    score += recencyPoints

    addReason(
      reasons,
      'Recent food-safety activity',
      recencyPoints,
      `${newestRecall.days} days since the latest linked recall.`
    )
  }

  const projectPoints = Math.min(
    relatedProjects.length * 12,
    24
  )

  score += projectPoints

  if (relatedProjects.length) {
    addReason(
      reasons,
      `${relatedProjects.length} growth signal${
        relatedProjects.length === 1 ? '' : 's'
      }`,
      projectPoints,
      'Construction or expansion can create sanitation demand.'
    )
  }

  if (facility.phone) {
    score += 3

    addReason(
      reasons,
      'Plant phone available',
      3,
      'Direct outreach is possible.'
    )
  }

  if (facility.website) {
    score += 2

    addReason(
      reasons,
      'Website available',
      2,
      'Additional account research is available.'
    )
  }

  const contactCount =
    Array.isArray(facility.contacts)
      ? facility.contacts.length
      : 0

  const contactPoints = Math.min(
    contactCount * 3,
    9
  )

  score += contactPoints

  if (contactPoints) {
    addReason(
      reasons,
      `${contactCount} contact${
        contactCount === 1 ? '' : 's'
      } available`,
      contactPoints,
      'Known decision-makers improve outreach readiness.'
    )
  }

  const mapped =
    Number.isFinite(Number(facility.lat)) &&
    Number.isFinite(Number(facility.lng))

  if (mapped) {
    score += 2

    addReason(
      reasons,
      'Mapped facility',
      2,
      'The facility can be used in territory planning.'
    )
  }

  score = Math.max(
    0,
    Math.min(100, Math.round(score))
  )

  reasons.sort((a, b) => b.points - a.points)

  return {
    score,
    label:
      score >= 90
        ? 'Hot opportunity'
        : score >= 75
          ? 'High potential'
          : score >= 55
            ? 'Active prospect'
            : 'Monitor',
    recommendedAction:
      score >= 90
        ? 'Request a plant visit'
        : score >= 75
          ? 'Begin direct outreach'
          : score >= 55
            ? 'Research decision-makers'
            : 'Continue monitoring',
    reasons,
    relatedRecalls,
    relatedProjects,
  }
}

export function rankFacilities({
  facilities = [],
  recalls = [],
  projects = [],
}) {
  return facilities
    .map(facility => ({
      facility,
      opportunity: calculateOpportunity({
        facility,
        recalls,
        projects,
      }),
    }))
    .sort(
      (a, b) =>
        b.opportunity.score -
        a.opportunity.score
    )
}
