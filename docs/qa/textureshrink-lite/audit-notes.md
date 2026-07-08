# TextureShrink Lite QA Evidence

Audit date: 2026-07-08

Target: local AeroLex landing, `#textureshrink-lite`

Capture: Playwright Chromium, desktop 1440 × 1100 and mobile 390 × 844

## Flow steps

1. **Initial desktop state — PASS**

   Evidence: `01-initial-desktop.png`

   The local-only privacy statement, accepted formats, 25 MB limit and disabled download are visible before selection. Empty previews and metrics are unambiguous.

2. **PNG conversion — PASS**

   Evidence: `02-png-processed.png`

   A 2.42 MB PNG produced a 179.0 KB WebP at 1642 × 958, reported as 92.8% smaller. Both previews preserve aspect ratio and the download becomes available.

3. **JPG conversion — PASS**

   Evidence: `03-jpg-processed.png`

   A 388.4 KB JPG produced a 186.5 KB WebP at 1642 × 958, reported as 52.0% smaller. Metrics remain readable and correctly formatted.

4. **Invalid file — PASS AFTER FIX**

   Evidence: `04-invalid-file.png`

   A text file returns “Choose a PNG, JPG or WebP image.” Previous previews and metrics are cleared and download is disabled.

5. **Oversized file — PASS AFTER FIX**

   Evidence: `05-oversized-file.png`

   A file larger than 25 MB returns the documented limit message. Previous output is cleared and download remains disabled.

6. **Mobile processed state — PASS**

   Evidence: `06-mobile-processed.png`

   Controls, previews and metrics stack without horizontal overflow at 390 px. Images use `object-fit: contain` and are not visibly distorted.

## Additional functional checks

- WebP input: PASS; 181.2 KB became 172.3 KB and reported 4.9% smaller.
- Download: PASS; suggested filename ended in `.webp` and the downloaded file had valid `RIFF`/`WEBP` signatures.
- Large dimensions: PASS; a 5000 × 3000 PNG was capped proportionally to 4096 × 2458 WebP.
- Repeated replacement: PASS; five alternating PNG/WebP selections completed without runtime errors. Forced-GC heap changed from 99,294,836 to 73,086,407 bytes, so no growth was evident in this run.
- Network privacy: PASS; no non-GET request occurred during selection, conversion, preview or download. The demo code contains no fetch/upload path; the separate Early Access form retains its existing API request.
- Runtime errors: none observed.

## Product truth check

Required copy present:

- “Local browser demo”
- “your texture does not leave this device”
- “Prototype utility”
- “not the final GPU pipeline”

Forbidden claims absent from the demo:

- AI optimized
- GPU processed
- production pipeline
- Axiora-integrated
- cloud-rendered

## Bug found and corrected

Before the fix, selecting an invalid or oversized file after a successful conversion left the previous previews and metrics visible. The download button was disabled, but the stale output made the error state misleading. `resetOutput()` now revokes object URLs, hides previews, clears metrics and disables download before validating every new selection.

## Accessibility and evidence limits

- The status uses `role="status"` and `aria-live="polite"`; the native file input remains associated with its visible label.
- Disabled and error states are visually distinct in the captured themes.
- Keyboard-only navigation and screen-reader announcements were not exhaustively audited; screenshots cannot establish full accessibility compliance.
- Memory behavior was sampled in one Chromium run and is not a formal long-duration leak proof.
