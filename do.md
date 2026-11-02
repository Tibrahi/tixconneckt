# DO — Hackathon verdict & win plan (TIXCONNECKT)

> Meta Global AI Developer Hackathon (Cerebral Valley). Deadline **Wed Nov 4, 9:00 PM EST** (~2 days left).
> Track: **Indie Developer**. Problem statement: **#1 Build for Your World**.
> ⚠️ DELETE THIS FILE (and any strategy notes) before making the repo public.

## Verdict (judge view)

- **Stage 1 (pass/fail): LIKELY PASS** — real Meta Model API usage (Spark + Voice), fits the theme. Entire git history (Oct 28–Nov 2) sits inside the building window (Oct 27–Nov 4): your "new work only" story is strong IF you narrate it clearly. Vague "Copy" commit messages + no delineation = disqualification risk at judges' discretion. Fix with a submission block (A1).
- **Not an anti-project.** Nothing medical/political/RAG-cliché. Good.

| Category (weight) | Now | Winnable | Why |
|---|---|---|---|
| Impact 30% | 6.5 | 8.0 | Real domain, but "platform for everything" is diffuse. Needs one sharp hero story. |
| Meta AI Tooling 25% | 5.5 | 7.0–7.5 | Spark + Voice are real and well-built, but 2 of 6 model families, no open weights, shallow agentic loop. |
| Technical Depth 20% | 8.5 | 8.5 | Elite: 360 files, 100+ routes, 60+ tables, authZ matrix, tests, fallbacks. Don't touch. |
| Demo 25% | 3.0 | 8.0+ | No video, no screenshots, live env unverified. Biggest lever. |
| **Weighted** | **~5.8** | **~7.9 (top-5 competitive)** | |

Bonus prizes: Agentic $5K (winnable on framing), Open Weights $10K (needs a build), Viral $20K (needs an X post), Community $10K (needs gallery push), Creative $5K (skip — needs Image/Wonder centrality).

## REMOVE (before public)

- R1. `do.md` + any win-strategy notes. Judges will read your repo.
- R2. Nothing else. Keep `Specification/` (shows process), keep tests, keep history (proves dates). Do NOT rewrite git history.
- R3. Remove/soften the "intended to remain private and proprietary" signal clash: the event rule is "repositories must be public." Keep ownership, but ADD an explicit event grant (see A2). Decide: permissive LICENSE (max win odds) vs. evaluation-grant paragraph (keeps proprietary intent).

## ADD (ranked)

- A1. **Submission block at top of README** (30 min): track, problem statement #1, "100% built Oct 27–Nov 4 (see git history)", Meta models used, demo video link, live link, what-is-new list. This alone defuses disqualification risk.
- A2. **License decision** (15 min): add `LICENSE` (MIT/Apache-2.0 recommended for the event) OR add a "Hackathon evaluation grant" paragraph. Missing license + "proprietary" tone = friction.
- A3. **3-minute demo video** (half day): ONLY hackathon-built features, live product, show code briefly. Script: 0:00 problem → 0:30 hero workflow live → 2:00 second workflow + code peek → 2:40 "built with Muse Spark + Voice on Meta Model API."
- A4. **Live deployment verified** (1–2 hrs): seeded DB, ALL keys set (Spark, Voice, Ably, SMTP, storage, TURN, cron), external 1-min cron tick, `overduePending: 0`, test accounts ready. Judges without keys see "pending" everywhere — unacceptable for the live round.
- A5. **Hero workflow = voice→action agent** (framing, 0 code): "Speak → transcribed (Muse Voice) → interpreted (Muse Spark) → human approves → cron executes → notified + audited." Pitch it as a **verifiable agent** (matches the Agents 102 session judges just watched).
- A6. **X post with demo clip** (30 min, before Nov 8 EOD): compete for Most Viral $20K. Submit post link on the platform.
- A7. **CV platform submission dry-run** (1 hr, by Nov 3): representative named, all contributors listed, repo public, video link accessible signed-out.
- A8 (stretch). **One open-weights feature** (rest of time): e.g. match explanations via Muse Spark Open on Baseten/Modal with reasoning shown → unlocks $10K bonus + tooling points. Only if A1–A7 done. Claim $150 Meta credits + partner credits first.

## CHANGE

- C1. Reframe README/AI narrative around the hero agent loop (propose→validate→approve→execute→audit), not "AI sprinkled on 10 pages."
- C2. Make degraded states impossible in the demo env (A4) — pending states are good engineering but terrible demo.
- C3. Submission answers: name exact Meta models (`muse-spark-1.3`, `muse-voice-transcribe-1.0`, endpoints, what each does). Vague "we use Meta AI" scores 3/10 on tooling.
- C4. If time: rename nothing, refactor nothing. Freeze features Nov 3 evening; Nov 4 is video + submission + X only.

## 2-day plan

- **Today (Nov 2):** A1, A2, A4 (deploy+seed+keys+cron), start A8 credits.
- **Nov 3:** A5 script, A3 record/edit video, A8 build-or-cut decision by noon, A7 dry-run.
- **Nov 4 (by 9 PM EST):** R1 delete, final video upload, submit on CV platform, A6 X post. No code after noon.

## Submission checklist

Repo public · video accessible signed-out · live link healthy · all contributors listed · representative named · new-work delineation visible · no secrets tracked (verified: none) · no strategy files · X link submitted · credits claimed.
