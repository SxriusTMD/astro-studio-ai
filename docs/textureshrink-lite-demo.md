# TextureShrink Lite Public Demo

## What it really does

TextureShrink Lite accepts one local PNG, JPG or WebP image, decodes it in the browser, draws it to Canvas and exports a WebP Blob. It shows original and output previews, file sizes, percentage size change and output dimensions, then lets the user download the WebP.

The file stays on the device. The demo does not upload to Railway, write to Supabase or call an AeroLex processing endpoint.

## What it does not do yet

- It is not the final TextureShrink GPU pipeline.
- It does not use AI, GPU workers or cloud rendering.
- It is not integrated into Axiora/SX3D.
- It does not process texture sets, material graphs, mip chains or production formats beyond PNG/JPG/WebP input and WebP output.
- It does not preserve every source metadata field or offer production compression controls.

## How to test it

1. Open the landing and scroll to TextureShrink Lite below Tools.
2. Select a PNG, JPG or WebP no larger than 25 MB.
3. Wait for the local completion status.
4. Compare both previews and verify the original/output metrics.
5. Download the optimized WebP and open it locally.
6. Replace the source with another file and confirm the previous result is cleared.
7. Try a non-image and a file larger than 25 MB; both must show an error with download disabled.

## Known limitations

- Maximum input file size: 25 MB.
- Maximum output edge: 4096 px; larger images are proportionally resized.
- WebP encoding uses browser Canvas support and a small fixed quality fallback sequence.
- Some already-compressed images may become larger; the UI reports this honestly.
- Animated images are not a supported workflow.
- Color profiles and metadata may differ after browser decoding/encoding.
- One file at a time; no batch operation.

## 30-second video script

- **Hook:** “I stopped myself from showing fake GPU demos. This is the first real AeroLex micro-demo.”
- **Visual:** Upload a texture, show local processing, compare before/after, reveal the size reduction and download the WebP.
- **Narration:** “TextureShrink Lite runs entirely in your browser. It converts a local texture to WebP, shows the real file-size change and gives you the output. No upload, no AI claim and no fake GPU job. It is a prototype utility—not the final pipeline.”
- **CTA:** “If texture optimization is part of your 3D workflow, join early access and tell me what hurts most.”

## Checklist before publishing

- [ ] Use a texture you are allowed to publish.
- [ ] Keep the local-browser privacy statement visible in the recording.
- [ ] Show the “Prototype utility” and “Not the final GPU pipeline” copy.
- [ ] Record a complete upload → metrics → download flow without cuts that imply cloud processing.
- [ ] Confirm the displayed reduction matches the selected source.
- [ ] Do not call the output AI-optimized, GPU-processed or production-ready.
- [ ] Verify the public deployment loads on desktop and mobile.
- [ ] Verify the downloaded WebP opens before posting.
- [ ] End with the Early Access CTA, not a promise of immediate product access.
