# Sprint 1B — Landing P0 Visual + Performance QA

## P0 fixes

- Performance: converted all five primary landing PNG assets to WebP at quality 80 using the locally available Pillow 12.2.0 runtime. No dependency was added.
- Before/after credibility: every comparator now renders an explicit `.before-img` layer with the requested RAW filter and a sharp `.after-img` layer clipped by `--position`.
- Slider behavior: each comparison now uses the full `0–100` range, initializes `--split` from its input value, and applies complementary clips to the before and after layers. At 0% the processed preview is complete; at 50% the split is centered; at 100% the raw preview is complete.
- Copy safety: comparison copy identifies the visuals as `workflow preview`, `processed preview`, or `simulated optimization preview`.

## Asset performance

| Asset | PNG bytes | WebP bytes | Reduction |
| --- | ---: | ---: | ---: |
| hero-rig | 1,593,356 | 37,396 | 97.7% |
| audiopose | 1,529,882 | 49,000 | 96.8% |
| rigflip | 1,547,643 | 40,686 | 97.4% |
| textureshrink | 2,534,764 | 185,524 | 92.7% |
| viberender | 1,896,731 | 104,882 | 94.5% |
| **Total** | **9,102,376** | **417,488** | **95.4%** |

All five WebP files exist in `assets/landing/` before the HTML references were changed. Original PNG files remain as safe source assets and were not deleted.

## Responsive and loading

- The hero/LCP image is eager and marked `fetchpriority="high"`.
- All below-the-fold tool and comparison images use `loading="lazy"`.
- Explicit source dimensions are present on all five primary image usages.
- Range controls retain full-width mobile behavior and use `touch-action: pan-y`.
- Existing `prefers-reduced-motion` handling remains intact; no animation was added.

## Mockup boundary

- GPU jobs, progress, credits, generated files, IK solving, optimization and processed results remain clearly presented as prototype/workflow previews.
- No backend, storage, authentication, real GPU worker or model integration was added.

## Legacy audit — no deletion

- `auth-email.html` is referenced by `server.js` route `/auth/email`.
- `complete-profile.html` is referenced by `server.js` route `/complete-profile`.
- `verify-success.html` is referenced by the email verification handler in `server.js`.
- Recommendation: do not delete these files until the legacy auth routes and handlers are intentionally retired in a separate sprint.

## Brand safety

No prohibited academic, document, legal, quiz, homework, or study wording appears in visible `index.html` copy.

## Validation

- `npm run build`: passed.
- Required landing content check: passed.
- Forbidden wording scan: passed.
- WebP existence and HTML reference check: passed.
- `git diff --check`: passed.
- Browser-level desktop/mobile visual inspection: still pending because the in-app browser control surface is unavailable in this session.

## Remaining risk

- The implementation is technically validated, but the slider's rendered clipping and touch behavior still need one manual desktop/mobile browser pass before commit.
- Original PNG sources remain in the repository; they are no longer downloaded by the landing but still occupy repository/storage space.

final result: passed

## Sprint 1B Final QA Closure

- Build: PASS.
- git diff --check: PASS.
- Desktop QA: PASS.
- Mobile QA: EMULATED PASS.
- WebP conversion: PASS.
- Before/After slider: PASS.
- Full range 0/50/100: PASS.
- Brand safety: PASS.
- Legacy cleanup: deferred to Sprint 1C.

### P1 notes

- Architecture headline copy can be refined later.
- Tools tabs can be improved on mobile later.
- Hero console density can be refined later if needed.

Final verdict: READY TO COMMIT.

## Sprint 1C — Public Landing Readiness

- Root landing creator-cloud copy and navigation: PASS.
- Public metadata: updated title, prototype-safe description and basic Open Graph fields.
- Architecture P1 copy: updated to clarify that heavy compute moves to the cloud.
- Mobile tools tabs: retained the existing design with safer horizontal overflow and scroll snapping.
- Brand safety scan of `index.html`, `assets/landing/landing.css` and `assets/landing/landing.js`: PASS.
- Legacy auth HTML: retained because all three files are referenced by active Express auth routes/handlers.
- Duplicate `POST /api/user/increment`: resolved by removing the second unreachable handler; the original guarded handler remains unchanged.
- Academic API/runtime internals: deferred. They are not linked from the public landing and require a dedicated migration sprint rather than deletion during public-surface cleanup.
- Remaining mockups: GPU jobs, output files, processing states, credits and early-access submission.

Sprint 1C verdict: READY TO COMMIT.

## Sprint 2 Phase 1 — Early Access Capture

- Added public `POST /api/early-access/leads` with strict email, role and main-pain validation.
- Added a honeypot and a bounded in-memory rate limit of five attempts per IP per 15 minutes.
- Added `docs/sql/early-access-leads.sql`; it must be applied before production deployment.
- No automatic table migration runs during server startup.
- PostgreSQL uses the existing `pg.Pool`; Supabase is not used by this flow.
- No emails are sent and no account is created.
- IP addresses are used only as ephemeral in-memory rate keys and are not persisted or logged.
- The rate limiter is suitable for a single server instance only.
- GPU jobs, outputs, processing states, credits and models remain product mockups.
- Validation performed: build, whitespace, release check, invalid payloads, honeypot, rate limit and safe unavailable-DB response.
- Database insert and duplicate integration require the SQL table and a configured test PostgreSQL instance.

## Sprint 2 Phase 2 — Production Readiness Gate

- SMTP startup audit: the legacy server performed both a real SMTP verification connection and a real health-check email on every startup.
- SMTP startup fix: removed automatic `transporter.verify()` and the startup `sendMail()` health check. Existing email routes still call the unchanged lazy `sendMail()` function when explicitly used.
- Early-access endpoint safety: no Supabase, email delivery, raw-IP persistence, sensitive logging, duplicate disclosure or SQL detail disclosure.
- SQL safety: manual `CREATE TABLE IF NOT EXISTS`, unique normalized email, allowlist checks and server-generated UUID documented.
- Deployment checklist: `docs/deploy-readiness.md`.
- Manual smoke-test matrix: `docs/testing/early-access-smoke-tests.md`.
- External gates still required before production: destination `DATABASE_URL`, manual SQL application and destination-environment HTTP/log verification.

## Sprint 2 Phase 2 — External Deploy Gate Closure Attempt

- Environments inspected: destination Supabase PostgreSQL project and `https://aerolex-ai.up.railway.app`.
- SQL applied: PASS (`create_early_access_leads`).
- Table verified: PASS; expected schema, constraints, UUID primary key, unique email, timestamp default and RLS are present.
- Railway availability: PASS; the root URL returned HTTP 200.
- Valid public/staging submit: FAIL; the endpoint returned generic HTTP 500.
- Duplicate response: FAIL; it was indistinguishable but also returned HTTP 500, so persistence/deduplication was not validated.
- Invalid payload response: PASS; invalid email, role and main pain returned HTTP 400.
- Honeypot behavior: PASS; it returned generic HTTP 200 before persistence.
- Rate limit behavior: PASS; the sixth counted attempt returned HTTP 429.
- Application logs without email/IP: FAIL — NOT VERIFIABLE without Railway log access.
- Landing stores a real lead: FAIL; Supabase contained zero rows after the valid Railway request.
- Early Access table policy: RLS is enabled with no public Data API policies; the intended writer is the trusted Express database connection.
- Separate legacy risk: Supabase reports RLS disabled on `public.users` and `public.documents`. No policy changes were made because legacy consumers require an audit first.

Final verdict: BLOCKED — correct Railway's destination `DATABASE_URL`/database permissions, restart the service, then repeat valid, duplicate, insertion and application-log checks.
