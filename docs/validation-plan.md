# AeroLex AI Validation Plan

## Validation window

- Duration: 14 consecutive days from the first published validation post.
- Objective: collect 20 real Early Access leads or hold 3 real conversations with 3D creators before building more product.
- A real lead is a non-test submission from a person who plausibly belongs to a target segment. Remove QA, duplicate, bot and clearly irrelevant entries from the count.
- A real conversation is a two-way exchange that provides a concrete workflow, pain, objection or willingness signal. Likes and one-word reactions do not count.

## Primary hypothesis

“3D creators are interested in AI/GPU workflows connected to Axiora/SX3D for motion, rigging, texture optimization or pipeline automation.”

## Decision metrics

### Success

- 20 real leads within 14 days, or
- 3 real conversations with 3D creators.

Either threshold is enough to continue validation. It is not proof that a production GPU backend should be built immediately.

### Failure signals

- Fewer than 5 real leads after 14 days.
- Zero replies or substantive conversations.
- Leads repeatedly misunderstand the product or expect a chatbot, image generator or finished production service.

If these signals appear, change the message or target segment before changing the product.

## Target segments

- Animators working with dialogue, gestures and keyframes.
- 3D artists handling large textures and scene assets.
- Indie developers with limited technical-art capacity.
- Technical artists responsible for rigs, retargeting and pipeline automation.
- Small studios that cannot maintain dedicated GPU infrastructure.

## Distribution channels

- YouTube devlog: show the workflow, constraints and current prototype honestly.
- Instagram Reels: one pain and one visual transformation per post.
- Relevant Discord servers and creator communities, only where project sharing or feedback requests are allowed.
- X/Twitter: short clips, build notes and direct questions when the audience is relevant.
- Reddit: use cautiously, follow each community's self-promotion rules, ask for feedback and avoid repeated cross-post spam.

## Messages to test

Run each message as a distinct post or clip so its response can be attributed.

1. Audio to motion/keyframes: turn dialogue or sound into an editable motion starting point.
2. Rig workflow acceleration: reduce repetitive rig conversion or retargeting work.
3. Texture optimization: send heavy texture sets and receive lighter production-ready outputs.
4. Local workflow plus cloud compute: keep authoring in Axiora/SX3D while offloading heavy tasks.
5. Axiora/SX3D integration: submit assets, track a task and receive the result in the desktop workflow.

## Operating rules

- Use prototype, workflow preview and planned capability language; do not imply that GPU processing is already generally available.
- Attach a channel/message label to campaign links when practical, but do not add tracking infrastructure during this sprint.
- Reply manually and personally. Ask what tool, asset type and current workaround the creator uses.
- Record only useful product evidence; do not copy private community messages into public documents.
- Review evidence weekly using `docs/lead-review.md`.

## Go/no-go decision after 14 days

- Success threshold reached: continue discovery with the strongest segment and pain; define the smallest testable workflow next.
- Between 5 and 19 leads with useful conversations: refine the winning message and run one more bounded validation cycle.
- Fewer than 5 leads or persistent confusion: change copy or segment and pause backend expansion.
