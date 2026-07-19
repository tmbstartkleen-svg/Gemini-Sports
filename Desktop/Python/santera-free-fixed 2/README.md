# Santera v0.2 — Free Food Facility Intelligence

Santera is a Cloudflare Pages application for contract-sanitation prospecting.

## Included

- Live FDA food enforcement/recall proxy
- Live USDA FSIS recall proxy
- March 1, 2026 recall cutoff in the interface
- Priority-first and newest-first sorting
- Nationwide construction-intelligence discovery from public news RSS searches
- New plant, expansion, groundbreaking, and opening signals
- One-click conversion of recall or construction intelligence into a facility record
- Shared facility, contact, and timeline-note database with Cloudflare D1
- Device-storage fallback
- Territory map and visit route optimizer
- PWA support for iPhone and MacBook

## Important construction-data note

The construction feed discovers public announcements nationwide through multiple focused public-news searches, including searches aimed at food-industry and economic-development publications. It is a prospecting discovery layer, not a licensed construction database. Every lead must be verified at its linked source before outreach.

## Deploy

See `DEPLOY-CLOUDFLARE.md`.

## v0.3 automatic database ingestion

Santera now calls `/api/sync` when **Refresh Intelligence** is used and on initial app startup. The sync:

- Imports FDA food enforcement recalls beginning March 1, 2026.
- Imports USDA FSIS recall and public-health-alert records beginning March 1, 2026 when dates are available.
- Creates or updates facility leads from recall firms.
- Deduplicates facilities by normalized firm name, city, and state.
- Stores recall history in `recall_events`.
- Stores nationwide construction announcements in `construction_projects`.
- Records each import in `sync_runs`.
- Skips repeat imports when a successful sync completed in the previous 15 minutes.

After replacing an older version, rerun both schema commands:

```bash
npx wrangler d1 execute santera-db --local --file=./schema.sql
npx wrangler d1 execute santera-db --remote --file=./schema.sql
```

Test locally:

```text
http://localhost:8788/api/sync?force=1
http://localhost:8788/api/recalls
http://localhost:8788/api/projects
http://localhost:8788/api/facilities
```
