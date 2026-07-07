# AeroLex AI Legacy Audit — Sprint 1C

## Scope

This audit separates the public creator-cloud landing from the inherited academic runtime. Sprint 1C changes only public blockers and low-risk maintenance defects; it does not implement or migrate backend infrastructure.

## Public surface

- `/` serves `index.html`, the creator-cloud landing for Axiora/SX3D workflows.
- Main navigation points only to sections inside the landing.
- Footer and visible landing copy contain no academic, PDF, legal, quiz, flashcard, homework or student product language.
- Public metadata describes a prototype cloud layer and does not claim production AI/GPU execution.

## Legacy file and route matrix

| File or surface | Referenced by | Runtime need | Sprint 1C decision |
| --- | --- | --- | --- |
| `auth-email.html` | `GET /auth/email` in `server.js` | Current email/password auth entry | Keep temporarily |
| `complete-profile.html` | `GET /complete-profile` in `server.js` | Username completion after auth | Keep temporarily |
| `verify-success.html` | Email verification handler in `server.js` | Verification completion response | Keep temporarily |
| `student.html` | Mentioned only by historical `AeroLex_Harness.md`; file absent | None in current runtime | Historical reference; update documentation later |
| `quiz.html` | Mentioned only by historical `AeroLex_Harness.md`; file absent | None in current runtime | Historical reference; update documentation later |
| `backups-legacy/` | No runtime references; ignored by Git | None | Keep local only or remove manually after retention review |
| `ai-context/` academic files | Internal historical prompts/memory | Not loaded by public landing; future tooling impact unknown | Keep and migrate deliberately |
| `SUBSCRIPTION_LOGIC.md` | Internal legacy documentation | No public runtime role | Keep pending backend retirement plan |
| `src/chat.js`, `src/ui-components.js`, `src/api.js`, `src/persistence.js` | Inherited app modules | Not loaded by root landing; may support legacy flows | Do not delete without migration |
| Academic endpoints in `server.js` | Direct API routes | Legacy authenticated runtime | Sprint 1D+ candidate; requires consumer and data review |

## Brand-safety classification

- Public visible blocker: none after Sprint 1C.
- Legacy internal: academic strings and endpoints in `server.js`, `src/`, `SUBSCRIPTION_LOGIC.md` and `ai-context/`.
- Safe historical reference: missing `student.html` and `quiz.html` references in `AeroLex_Harness.md`.
- Should remove later: stale academic identity documents and unused runtime modules, only after dependency and deployment verification.

## Duplicate route audit

`server.js` defined `POST /api/user/increment` twice. Express matched the first handler and never reached the second because the first always produced a response. The duplicate was unreachable, misleading and response-incompatible. Sprint 1C removes only the second handler and preserves the original guarded implementation with plan limits.

## Remaining risks and Sprint 1D recommendation

- Auth pages remain visually tied to the previous design system and should be aligned only after auth requirements are confirmed.
- The server still exposes inherited academic endpoints and database columns. Removing them safely requires mapping consumers, production traffic, stored data and rollback behavior.
- `package.json` and internal context documents still describe the inherited product. They are not public landing metadata, but should be updated as part of a repository identity migration.
- Sprint 1D should inventory legacy API consumers and choose compatibility isolation, deprecation, or removal before changing backend routes or schemas.
