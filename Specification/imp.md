# MASTER PROMPT: HACKATHON GAP CLOSURE & FULL-MARKS DELIVERY PLAN (TARGET 100/100)

## ROLE

Act as a hackathon Grand-Prize judge, principal engineer, demo director, and submission manager for the **Meta Global AI Developer Hackathon (Cerebral Valley)**.

Your mission: close every identified gap in this project and deliver the evidence required to score **maximum marks out of 100** under the official rubric:

| Category | Weight | Points | Current | Target |
|---|---|---|---|---|
| Impact | 30% | 30 | ~19.5 | 28+ |
| Use of Meta AI Tooling | 25% | 25 | ~13.75 | 23+ |
| Technical Depth & Execution | 20% | 20 | ~17 | 19+ |
| Demo | 25% | 25 | ~7.5 | 24+ |
| **Total** | 100% | **100** | **~58** | **95+** |

Track: **Indie Developer**. Problem statement: **#1 Build for Your World**. Deadline: **Wed Nov 4, 9:00 PM EST**.

Stage 1 is pass/fail (fits theme + reasonably used Meta Model API / open weights): currently LIKELY PASS — protect it, do not break it.

---

## DELIVERY CONVENTION (applies to every item below)

Each improvement MUST state:

1. **WHAT** — the exact gap and the points it unlocks.
2. **HOW** — the concrete actions to fix it.
3. **DELIVERED AS** — the artifact and where it lives (file path, URL, video timestamp, platform page).
4. **PROOF** — the evidence a judge can check in under 60 seconds (link, screenshot, command output, test result).
5. **DONE WHEN** — the acceptance check with no ambiguity.

No improvement is complete without its PROOF. Never claim marks without executed evidence.

---

# PHASE 1: DISQUALIFICATION SHIELD (protects all 100 points)

Risk: rules require the demo to highlight ONLY hackathon-built work and to clearly identify new contributions; failure = immediate disqualification at judges' discretion.

## 1.1 Hackathon submission block

- **WHAT:** A judge must see within 10 seconds: track, problem statement, what was built during the event, Meta models used, demo + live links.
- **HOW:** Add a "Hackathon Submission" block at the very top of `README.md` (below the title): track (Indie), statement #1, build window (Oct 27–Nov 4, 2026) with a pointer to git history (`git log --date=short --format='%h %ad %s'`), bullet list of hackathon-built contributions, exact Meta model IDs, demo video URL, live product URL.
- **DELIVERED AS:** `README.md` section + identical summary pasted into the CV platform submission text.
- **PROOF:** Section renders on GitHub; every claimed contribution maps to commits dated Oct 28–Nov 2.
- **DONE WHEN:** A stranger can answer "what did they build in the event?" in under 60 seconds.

## 1.2 Commit-message convention note ("Copy" clarification)

- **WHAT:** Commit messages read "Meta Hackthon System First/Second/.../sixth Copy" and "README.MD". The word "Copy" is the author's daily snapshot-phase label (First Copy = day-1 files snapshot … sixth Copy = sixth-day files snapshot) — NOT copied code. Unexplained, it reads as plagiarism.
- **HOW:** Add a permanent "Commit history & originality" note in `README.md` stating: all commits are dated Oct 28–Nov 2, 2026 (inside the Oct 27–Nov 4 building window); "Copy" = author's phase label for that day's file snapshot; all code is original event work, AI-assisted via coding agents (explicitly allowed and encouraged by the event).
- **DELIVERED AS:** `README.md` subsection + one sentence in the demo video ("every commit, October 28 to November 2, is linked below").
- **PROOF:** `git log` dates visible on GitHub; note text present in README.
- **DONE WHEN:** No judge can reasonably misread "Copy" as copied work.

## 1.3 License & access clarity

- **WHAT:** Rule: "Repositories must be public." Current state: no LICENSE file + README tone says "private and proprietary" — a friction signal, possible trust deduction.
- **HOW (choose one, owner decides):** (a) Add OSI license (`LICENSE`, MIT or Apache-2.0 recommended) for maximum win odds; or (b) keep proprietary ownership AND add an explicit dated "Hackathon evaluation grant" paragraph permitting event judging, demo, and gallery display. Either way, keep the ownership notice; remove the contradiction.
- **DELIVERED AS:** `LICENSE` file and/or README license section.
- **PROOF:** GitHub license badge or quoted grant paragraph; repo visibility = public before submission.
- **DONE WHEN:** A judge can state the access terms without asking a question.

## 1.4 Submission mechanics

- **WHAT:** CV platform submission with representative, contributors, public repo, accessible video. Any broken link = lost Demo points or worse.
- **HOW:** Dry-run by Nov 3: representative named; every contributor listed; repo public; video plays signed-out; live link healthy; X post link submitted for the Viral bonus.
- **DELIVERED AS:** Submitted CV platform entry + this checklist ticked in the results log.
- **PROOF:** Screenshot of submitted entry; signed-out click-through of all three links.
- **DONE WHEN:** All links verified from a signed-out browser and a second device.

---

# PHASE 2: IMPACT — 19.5 → 28/30 (+8.5)

Judges ask: real-world potential? Who benefits, how much? Could people actually use it? Fits the statement?

## 2.1 One sharp hero story (the highest-leverage Impact fix)

- **WHAT:** "Platform for everything" dilutes impact. One concrete whose-world / what-changed story is worth more than 20 features.
- **HOW:** Crown ONE hero workflow and make every artifact repeat it: **"A community organizer speaks a need → Muse Voice transcribes → Muse Spark structures it into a project + support request → a provider responds → money and work stay linked."** Name the beneficiary (e.g. grassroots organizers, campus groups, local NGOs), the time freed (no forms, no tool-hopping), and what is newly possible (voice-to-funded-work in minutes).
- **DELIVERED AS:** README About section rewritten around the hero; demo video opens with it (0:00–0:30); CV submission summary leads with it.
- **PROOF:** The same 3-sentence story appears verbatim in README, video, and submission.
- **DONE WHEN:** Any judge can repeat the story after one viewing.

## 2.2 Evidence of real use

- **WHAT:** "Could this become something people use?" needs proof, not adjectives.
- **HOW:** Seed the live demo with a realistic end-to-end dataset (organizer + provider + project + request + wallet entries) so judges can click the full journey; add 2–3 short "who uses it" personas to the README tied to real routes.
- **DELIVERED AS:** Seeded production data + README personas + internal testing tour results log excerpt.
- **PROOF:** Live product click-through; `npm run db:seed` reproduces the dataset.
- **DONE WHEN:** A judge completes the hero journey on the live link without guidance.

## 2.3 Statement fit, explicit

- **WHAT:** State verbatim that the project answers statement #1 and how (domain + time freed + newly possible).
- **HOW:** One paragraph in README + submission + video narration using the statement's own language.
- **DELIVERED AS:** Text in all three artifacts. **PROOF:** Keyword-visible in each. **DONE WHEN:** Fit is quotable, not implied.

---

# PHASE 3: USE OF META AI TOOLING — 13.75 → 23/25 (+9.25)

Judges ask: creative use? Beyond basic integration? Surprised even us? Name exact models.

## 3.1 Name and show every model call (zero code)

- **WHAT:** Vague "we use Meta AI" scores ~3/10. Exact IDs + visible behavior score.
- **HOW:** Document and narrate: `muse-spark-1.3` (8 tasks: project_analysis, match_explain, parse_document, interpret_action, profile_interpret, summarize_conversation, summarize_decisions, extract_action_items) and `muse-voice-transcribe-1.0` (chat voice, profile assist, call transcription, action instruction). Show the task catalog (`GET /api/ai/tasks`) and one `ai_task_runs` provenance row live in the video.
- **DELIVERED AS:** README AI section (exists — verify IDs), video code/behavior peek (2:00–2:30), submission tech description.
- **PROOF:** Judge sees model IDs on screen and in `lib/muse/endpoints.ts`.
- **DONE WHEN:** No model claim lacks a visible call site.

## 3.2 Frame the verifiable agent (zero code, bonus-eligible)

- **WHAT:** Best Agentic Use-Case ($5K) rewards autonomy + multi-step workflows. The action pipeline already is one: propose (Spark) → validate (server) → human approves → cron executes → notify + audit. It just isn't framed that way.
- **HOW:** Name it "verifiable voice-to-action agent" everywhere; demo the full loop including the approval gate and the audit row; use the event's own Agents 101/102 language (multimodal input, verifiable execution).
- **DELIVERED AS:** Demo chapter + README AI section intro + submission "agentic" paragraph.
- **PROOF:** Video shows voice → draft → approve → executed → notification + `action_attempts` row.
- **DONE WHEN:** A judge can describe the agent loop without prompting.

## 3.3 Add one open-weights capability (stretch, unlocks $10K bonus + tooling points)

- **WHAT:** No Glimmer/Spark-Open usage = ineligible for Best Build on Meta Open Weight Models and capped tooling score.
- **HOW (only after Phases 1, 2, 4 are done):** Serve ONE feature on an eligible open-weights model via partner inference (Baseten: `meta-models/muse-spark-open-1026`; or Modal/Fireworks): recommended = match explanations with visible reasoning. Claim credits first ($150 Meta + partner credits). Keep the change small, flagged, and demo-safe with fallback to Spark.
- **DELIVERED AS:** Working feature on the live product + code path + submission bonus flag.
- **PROOF:** Infrastructure partner can verify the eligible model; video shows the reasoning output.
- **DONE WHEN:** Bonus-eligible and demo-stable, or explicitly CUT by noon Nov 3 (a broken stretch loses more than it gains).

## 3.4 Explicit non-goals (protect points)

- **WHAT:** Judges deduct for implied-but-missing claims, not for honest scope.
- **HOW:** State plainly: Muse Image / Wonder / SAM 3.1 not used; voice = transcription only (`summarize_audio`, `extract_audio` return honest 501s). Already true in code — keep it visible.
- **DELIVERED AS:** README AI limitations (exists — keep). **PROOF:** 501 reproducible live. **DONE WHEN:** No claim exceeds implementation.

---

# PHASE 4: TECHNICAL DEPTH — 17 → 19/20 (+2)

Already elite. Protect it; polish only.

## 4.1 Full green board

- **WHAT:** "Thoughtfully refined" must be visible.
- **HOW:** `npm run lint`, `typecheck`, `test`, `test:e2e` all green on the submission commit; paste the summary into the submission.
- **DELIVERED AS:** Clean CI-equivalent run log. **PROOF:** Pasted output + commit SHA. **DONE WHEN:** Zero red on submission SHA.

## 4.2 Live environment hardened

- **WHAT:** A dead live link destroys Tech + Demo simultaneously.
- **HOW:** Production deploy with ALL keys (Spark, Voice, Ably, SMTP, storage, TURN, Redis, cron), seeded data, external 1-minute cron tick, `overduePending: 0`, test accounts ready, `/api/health` green.
- **DELIVERED AS:** Live URL + health output + cron verification (`curl` with `CRON_SECRET`).
- **PROOF:** Signed-out health check + hero journey click-through recorded.
- **DONE WHEN:** Two people on two networks complete the hero journey.

## 4.3 No-go guardrail

- **WHAT:** Last-minute refactors kill demos.
- **HOW:** Feature freeze Nov 3 evening. Nov 4 = video + submission + X post only. No structural changes after freeze.
- **DELIVERED AS:** Dated freeze note in the results log. **DONE WHEN:** Submission SHA is tested, not fresh.

---

# PHASE 5: DEMO — 7.5 → 24/25 (+16.5, the match-winner)

Judges: working, impressive demo? Holds up live? Video genuinely cool?

## 5.1 Three-minute video (the primary artifact)

- **WHAT:** Required; judged alongside code and live product; must show ONLY hackathon-built work.
- **HOW:** Script — 0:00–0:30 problem + hero (voice-to-funded-work); 0:30–2:00 live hero loop with approval + execution + notification; 2:00–2:30 second workflow (document → extraction → project) + 20-second code peek (task catalog, endpoint, provenance row); 2:30–3:00 models used, "built Oct 28–Nov 2, every commit linked," close on live link. Record on the hardened live env (4.2) with backup local recording. Captions on. No slides-only segments longer than 10 seconds.
- **DELIVERED AS:** Public video URL (accessible signed-out) + link in README + CV submission.
- **PROOF:** Three strangers confirm: cool to watch, clearly live, clearly hackathon-built.
- **DONE WHEN:** Video uploaded, linked in both places, re-watchable without login.

## 5.2 Live-product demo script

- **WHAT:** Final-round judges click the live product. It must survive strangers.
- **HOW:** Scripted 5-click hero path with test accounts published in the submission ("Judge path: login as demo@… / Org voice note → approve action → watch execution → check wallet"). Seed data reset procedure ready.
- **DELIVERED AS:** Judge-path paragraph in submission + README usage section.
- **PROOF:** Two dry-runs by someone who didn't build it. **DONE WHEN:** Zero guidance needed.

## 5.3 Screenshots (supporting, not primary)

- **WHAT:** Gallery + README + X post need stills.
- **HOW:** Capture 5: landing hero, voice→action draft, approval + execution, project workspace with AI assist, wallet trail. Real pixels from the live env only.
- **DELIVERED AS:** `public/demo/*.png` + README gallery + X attachments. **PROOF:** Each still reproducible live. **DONE WHEN:** No mockups, no Figma, no claims beyond pixels.

---

# PHASE 6: BONUS-PRIZE SWEEP (+$45K surface)

| Bonus | Action | Delivered as | Proof | Done when |
|---|---|---|---|---|
| Most Viral $20K | Post demo clip on X with event tags; rally engagement until Nov 8 EOD | X post URL submitted on platform | Link submitted + engagement visible | Posted by Nov 4 night |
| Open Weights $10K | Phase 3.3 | Flagged submission + verifiable deployment | Partner verification passes | Feature live or cut by Nov 3 noon |
| Community $10K | Rally gallery votes; share the gallery link everywhere | Vote count | Announced Nov 16 | Gallery entry polished (stills + copy) |
| Agentic $5K | Phase 3.2 framing | Demo chapter + submission paragraph | Judges can describe the loop | In video + text |
| Creative $5K | SKIP (needs Image/Wonder centrality; out of scope) | — | — | Explicitly not pursued |

---

# PHASE 7: PRE-SUBMISSION HYGIENE

- [ ] Strategy files removed from public tree (`do.md`, personal notes). Keep `internal testing tour.md` (QA craft signals quality).
- [ ] `Specification/verify.md` + spec folder reviewed: no secrets, no contradictory claims (verified: no secrets tracked).
- [ ] `git status` clean-or-intentional; submission SHA recorded; suites green on that SHA.
- [ ] Signed-out verification of repo + video + live link from two devices.
- [ ] Credits claimed (Meta $150 + partner applications) before Nov 4, 9 PM EST.

---

# FINAL SCORING SELF-CHECK (fill before submitting)

| Check | Evidence | Points protected |
|---|---|---|
| New-work delineation visible in <60s | README block + video line + git dates | Stage 1 + all |
| Hero story repeated verbatim ×3 | README / video / submission | Impact 28 |
| Exact model IDs shown live | Video + endpoints.ts + ai_task_runs row | Tooling 23 |
| Agent loop demonstrable | Video chapter + audit row | Tooling + Agentic bonus |
| Green board on submission SHA | Pasted logs | Tech 19 |
| Live env hardened + judge path | Health + 2 dry-runs | Tech + Demo |
| 3-min video public + linked | URL ×2 places | Demo 24 |
| License/access unambiguous | LICENSE or grant paragraph | Trust |
| X post + gallery live | URLs submitted | Bonuses |

**Target total: 95+/100. Ship it.**

---

# SOURCES (evidence inspected this session — no external browsing needed)

Binding workspace evidence already answers every material decision, so no external research was run. Every external name above traces to one of these inspected sources:

- `Specification/verify.md` (read in full): event name, problem statements, building window Oct 27–Nov 4, rules (public repo, new work only, demo of hackathon-built work, anti-projects), rubric weights, prizes and bonus rules/amounts, credit programs, Baseten model ID `meta-models/muse-spark-open-1026`, Agents 101/102 session titles, submission/video requirements.
- `git log` (48 commits, Oct 28–Nov 2, 2026) + `git ls-files` (no secrets tracked) + remote `github.com/Tibrahi/tixconneckt`: new-work delineation, commit-message convention, hygiene state.
- `lib/muse/endpoints.ts` (`muse-spark-1.3`, `muse-voice-transcribe-1.0`), `lib/ai-tasks.ts` (8 supported Spark tasks, 2 honest 501s), `lib/ai.ts`, `app/api/ai/*`, `app/api/actions/interpret`, `lib/action-worker.ts`: model IDs, task catalog, agent loop, provenance.
- Component→API mapping (verified imports): `AiTaskRunner` in `ProjectOverview`, `VoiceRecorder`/`useVoiceRecorder` in chat/actions/profile, `/api/ai/voice/stream` in `use-call-transcription`.
- `package.json`, `vercel.json`, `README.md` (prior audit): stack, cron backstop, suite inventory (34 Vitest files, Playwright smoke).
