# AeroLex AI — 30-Second Validation Scripts

These scripts present AeroLex AI as a prototype and invite feedback rather than promising production access.

## 1. Cloud jobs from a local 3D workflow

- **Hook:** “What if your 3D editor could send heavy AI jobs to the cloud?”
- **Visual:** Start in Axiora/SX3D, select `character_scene.glb`, choose AudioPose, then show the job moving through the AeroLex operator console.
- **Narration:** “The idea is simple: keep scene work local, send a focused task to AeroLex, and receive an editable result back. I’m validating the workflow before building the GPU backend.”
- **CTA:** “Which task would you offload first? Join Early Access and tell me.”

## 2. Motion and rig workflow

- **Hook:** “I’m building AI tools for 3D creators, starting with motion and rig workflows.”
- **Visual:** Cut from an audio waveform to motion keyframes, then from a source hand rig to a retargeted preview.
- **Narration:** “AudioPose explores audio-to-motion starting points. RigFlip explores rig conversion and retargeting assistance. They are workflow prototypes, not finished production models.”
- **CTA:** “If animation or retargeting slows you down, join the validation list.”

## 3. A job system, not a chatbot

- **Hook:** “This is not a chatbot. It’s a cloud job system for 3D assets.”
- **Visual:** Show an asset card, selected task, GPU-job status, progress bar and returned output file.
- **Narration:** “AeroLex is designed as a control layer: submit a scene, texture or motion input; run one defined workflow; receive a usable asset back in Axiora/SX3D.”
- **CTA:** “Tell me the exact asset task you would trust this system with.”

## 4. Local workflow, cloud compute

- **Hook:** “Local workflow, cloud compute, result back into Axiora.”
- **Visual:** Animate the architecture path: Axiora/SX3D Desktop → AeroLex API → GPU Worker → Result back to Axiora.
- **Narration:** “The desktop remains where you author and review. AeroLex would coordinate heavier processing without turning your workflow into another disconnected web editor.”
- **CTA:** “Would this fit your pipeline? Join Early Access or reply with what would block you.”

## 5. Validate before building

- **Hook:** “I’m testing whether creators actually want this before building the GPU backend.”
- **Visual:** Show the four workflow previews, then the Early Access form and a simple counter reading `Goal: 20 creator leads`.
- **Narration:** “The current landing demonstrates AudioPose, RigFlip, TextureShrink and VibeRender as prototypes. The next decision comes from creator feedback—not another month of assumptions.”
- **CTA:** “Pick your role and biggest pipeline pain. I’ll use the responses to decide what gets tested first.”

## 6. The first real browser demo

- **Hook:** “I’m not showing fake GPU jobs. Here is the first real AeroLex browser demo: texture compression.”
- **Visual:** Select a local PNG texture, show the original and optimized previews, then reveal the before/after file sizes and download button.
- **Narration:** “TextureShrink Lite converts and compresses the image locally with browser Canvas APIs. The file never leaves this device. It is a prototype utility for quick visual validation—not the final GPU pipeline.”
- **CTA:** “Try it with one of your textures and tell me whether the visual tradeoff is useful.”

## 7. Public TextureShrink Lite demo

- **Hook:** “I stopped myself from showing fake GPU demos. This is the first real AeroLex micro-demo.”
- **Visual:** Texture upload, local compression, before/after previews, measured size reduction and WebP download.
- **Narration:** “TextureShrink Lite runs in the browser and shows the real output. Your file stays on this device. It is a small prototype utility—not AI, not a cloud GPU job and not the final pipeline.”
- **CTA:** “If texture optimization is part of your 3D workflow, join early access and tell me what hurts most.”
