# AeroLex AI Deploy Readiness

This checklist is a deployment gate. Do not publish the real Early Access form until every unchecked environment item is verified on the destination.

## Repository gate

- [x] Working tree was clean before Sprint 2 Phase 2.
- [x] Sprint 2 Phase 2 commit is pushed to `origin/main`.
- [x] `.env` is ignored and not committed.
- [x] Production landing references WebP assets.
- [x] Source PNG files are ignored and not committed.
- [x] `backups-legacy/` is ignored.
- [x] Public landing contains no academic-product copy.
- [x] Build, whitespace check and repository release check pass.

## Destination database gate

- [ ] `DATABASE_URL` is configured in the destination environment.
- [x] `docs/sql/early-access-leads.sql` was reviewed and applied through the Supabase MCP migration tool.
- [ ] The `early_access_leads` table is reachable by the application role.
- [ ] The application role can insert and resolve `ON CONFLICT (email) DO NOTHING`.
- [x] No raw IP address is persisted; `ip_hash` remains unused.

## Destination HTTP gate

- [ ] `POST /api/early-access/leads` accepts a valid lead.
- [ ] Landing submission stores a real lead.
- [ ] A duplicate email returns the same HTTP 200 response without a second row.
- [ ] Invalid email, role and main-pain payloads return HTTP 400.
- [ ] A populated honeypot returns HTTP 200 without inserting.
- [ ] The sixth attempt from one IP within 15 minutes returns HTTP 429.
- [ ] An unavailable database returns a generic HTTP 503 response.
- [ ] Missing-table and unexpected SQL errors return a generic HTTP 500 response.
- [ ] Application logs contain neither complete email addresses nor IP addresses for this endpoint.

## Landing gate

- [ ] All landing WebP assets load successfully in the destination.
- [ ] Early Access loading, success and error states render correctly on desktop and mobile.
- [ ] The form does not promise immediate access, account creation or production GPU execution.

## Runtime notes

- The rate limiter is in-memory and protects only one Node.js instance. Multi-instance deployment requires a shared limiter before scaling horizontally.
- The SMTP transport is now lazy: startup performs no SMTP verification and sends no health-check email. Existing auth email flows still invoke `sendMail()` on demand.
- Applying the SQL is intentionally separate from server startup. A missing table is a blocked deployment, not an automatic migration.

## External Deploy Gate Result — 2026-07-08

Environments inspected: destination Supabase PostgreSQL project and the reactivated Railway production service at `https://aerolex-ai.up.railway.app`.

| Gate | Result | Evidence |
| --- | --- | --- |
| SQL applied | PASS | Migration `create_early_access_leads` is registered in the destination database. |
| `early_access_leads` table verified | PASS | Table exists with eight expected columns, UUID primary key, unique email, allowlist checks, `created_at` default and RLS enabled. |
| Valid public/staging submit | FAIL | Railway returned generic HTTP 500; no row reached Supabase. |
| Duplicate indistinguishable | FAIL | Both attempts returned the same generic HTTP 500, but persistence/deduplication could not execute. |
| Invalid payload | PASS | Invalid email, role and main pain returned HTTP 400. |
| Honeypot | PASS | Returned generic HTTP 200 before persistence. |
| Rate limit | PASS | The sixth counted attempt returned HTTP 429. |
| Application logs omit email/IP | FAIL — NOT VERIFIABLE | Railway application logs are not accessible from this workspace. Database platform logs are not application logs. |
| Landing stores a real lead | FAIL | Supabase `early_access_leads` remained at zero rows after the valid Railway request. |

### Pending risks and unblock conditions

- Correct Railway's `DATABASE_URL` so the Express service uses the verified Supabase PostgreSQL database, then redeploy/restart it. The HTTP 500 with `dbOk` already true indicates a query-time database/schema/permission failure rather than an unavailable web service.
- Confirm that the application role can insert and execute `ON CONFLICT (email) DO NOTHING`.
- Run the documented HTTP smoke-test matrix and inspect application logs before publishing the real form.
- Supabase security advisors report RLS disabled on legacy `public.users` and `public.documents`. This is separate from Early Access and was not changed because enabling RLS without auditing legacy consumers could break them.
- `early_access_leads` intentionally has RLS enabled with no Data API policies; writes are expected only through the trusted Express database connection.

External deploy gate verdict: **BLOCKED — Railway is reachable, but valid lead persistence returns HTTP 500 and no row reaches the destination table. Railway application logs also remain to be reviewed.**
