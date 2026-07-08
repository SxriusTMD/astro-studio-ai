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

- [x] `DATABASE_URL` is configured and verified in the destination environment.
- [x] `docs/sql/early-access-leads.sql` was reviewed and applied through the Supabase MCP migration tool.
- [x] The `early_access_leads` table is reachable by the application role.
- [x] The application role can insert and resolve `ON CONFLICT (email) DO NOTHING`.
- [x] No raw IP address is persisted; `ip_hash` remains unused.

## Destination HTTP gate

- [x] `POST /api/early-access/leads` accepts a valid lead.
- [x] Landing submission stores a real lead.
- [x] A duplicate email returns the same HTTP 200 response without a second row.
- [x] Invalid email, role and main-pain payloads return HTTP 400.
- [x] A populated honeypot returns HTTP 200 without inserting.
- [x] The sixth attempt from one IP within 15 minutes returns HTTP 429.
- [x] An unavailable database returns a generic HTTP 503 response.
- [x] Missing-table and unexpected SQL errors return a generic HTTP 500 response.
- [x] Application logs contain no complete email, raw IP address or rate-limit hash for this endpoint.

## Landing gate

- [x] All landing WebP assets load successfully in the destination.
- [x] Early Access loading, success and error states render correctly on desktop and mobile.
- [x] The form does not promise immediate access, account creation or production GPU execution.

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
| Valid public/staging submit | PASS | Railway returned HTTP 200 and Supabase stored the synthetic test lead. |
| Duplicate indistinguishable | PASS | The repeated request returned the same HTTP 200 and the database retained one row. |
| Invalid payload | PASS | Invalid email, role and main pain returned HTTP 400. |
| Honeypot | PASS | Returned generic HTTP 200 before persistence. |
| Rate limit | PASS | On Railway, one valid request returned 200, the next four invalid requests returned 400, and the fifth invalid request (sixth total attempt) returned 429. |
| Application logs | PASS | Reviewed after deployment: no complete email, raw IP address or rate-limit hash is logged by the endpoint. |
| Landing stores a real lead | PASS | The Railway endpoint persisted a synthetic lead; the QA row was removed after verification. |

### Residual non-blocking risks

- Supabase security advisors report RLS disabled on legacy `public.users` and `public.documents`. This is separate from Early Access and was not changed because enabling RLS without auditing legacy consumers could break them.
- `early_access_leads` intentionally has RLS enabled with no Data API policies; writes are expected only through the trusted Express database connection.
- The rate limiter remains single-instance only and must be replaced before horizontal scaling.

External deploy gate verdict: **DEPLOY GATE CLOSED.**

## Sprint 2 Phase 2B — Railway Rate Limit Identity

- Root cause: `trust proxy = 1` selected different proxy hops as `req.ip` when Railway's managed proxy chain varied.
- Fix: trust Railway's forwarded chain, prefer Express's first resolved client identity, normalize forwarded/IPv6-mapped values, and hash the transient identity with SHA-256 before using it as the in-memory key.
- Raw IP addresses and hashes are neither persisted nor logged.
- Honeypot and invalid POST payloads now count toward the same limit before early returns.
- The limiter remains in-memory and single-instance only. Horizontal scaling requires a shared Redis/Upstash or PostgreSQL-backed limiter in a future sprint.
- Railway verification: PASS. A valid submit counted as attempt one; attempts two through five returned 400 for invalid payloads and attempt six returned 429. The inserted QA lead was verified and removed.

## Final Railway Deploy Gate Closure

- Railway runtime: PASS.
- Deployed revision: `01262c9` or later.
- Destination `DATABASE_URL`: PASS.
- Supabase insert and duplicate deduplication: PASS.
- Invalid payload and honeypot behavior: PASS.
- Railway sixth-request rate limit: PASS (HTTP 429).
- Logs reviewed: PASS; no complete email, raw IP address or rate-limit hash.
- SMTP startup connection: PASS; disabled by default and not observed.

Final verdict: **DEPLOY GATE CLOSED.**
