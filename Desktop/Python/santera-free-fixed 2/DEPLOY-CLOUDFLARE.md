# Deploy Santera on Cloudflare for $0

1. Create a free Cloudflare account.
2. Create a Pages project connected to a GitHub repository containing this folder.
3. Framework preset: None. Build command: leave blank. Output directory: `/`.
4. Create the free D1 database:
   `npx wrangler d1 create santera-db`
5. Copy the returned database ID into `wrangler.jsonc`.
6. Initialize tables:
   `npx wrangler d1 execute santera-db --remote --file=schema.sql`
7. In the Pages project's Settings > Functions > D1 bindings, add binding name `DB` and select `santera-db`.
8. Redeploy.

Verify:
- `/api/fda`
- `/api/usda`
- `/api/construction`
- `/api/facilities`

The construction endpoint uses public RSS search results and does not require an API key. Results are cached for 30 minutes.
