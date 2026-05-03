# SDLC Workflow Orchestration — Automatic Guardian Pipeline

This instruction enforces the SDLC Guardian pipeline automatically. The default agent MUST follow these rules to ensure no code reaches a PR without passing through the appropriate Guardians.

## Pre-Implementation Gate

**Before any implementation starts, verify ALL prerequisites exist.**

When the user asks to implement, build, code, or fix something — regardless of work type (feature, bug, defect, refactor, enhancement, hotfix):

### 1. Verify a git repository exists
Check that the project has `git init` and a remote configured. If not, set up the repo first — no implementation without version control.

### 2. Verify a specification exists
Check: is there an issue (GitHub, Azure DevOps, or equivalent) or PO Guardian ticket for this work?
- If **yes** → proceed to step 3
- If **no** → invoke PO Guardian first to create the specification

The PO Guardian will also decide whether the work warrants a **Formal Spec** at `specs/{feature}/spec.md` (Spec Kit-compatible). The PO makes this decision per-request based on complexity — multi-component, cross-Guardian, or architecturally significant work produces a spec; trivial work skips it. Either way, every ticket carries a `Parent Spec:` field capturing the decision.

Do NOT allow implementation without a specification. Say:
> "There's no ticket for this yet. Let me invoke the PO Guardian to spec it out first."

### 3. Present the full specification to the user
After the PO Guardian completes, present the **complete** specification to the user — every section, every component, every acceptance criterion, every open question. Do NOT summarize, abbreviate, or cherry-pick sections. The user must see:
- All components with their responsibilities and interfaces
- All acceptance criteria
- All open questions (and get answers before proceeding)
- Architecture decisions and trade-offs
- What is in scope and what is explicitly out of scope

Wait for the user to confirm, request changes, or answer open questions. Only proceed to the Developer Guardian after the user explicitly approves.

### 4. Relay all Guardian notes to the user
When any Guardian reports notes, warnings, missing tools, assumptions, or open questions, the orchestrator MUST surface them verbatim to the user. Never filter, summarize away, or silently absorb Guardian output. The user is the decision-maker — they need complete information.

### ⛔ No-Bypass Rule — The Orchestrator Must NOT Judge

The orchestrator (default agent) must NEVER skip the PO Guardian based on its own assessment of the user's description. Specifically:

- **A well-described bug is NOT a ticket.** Even if the user provides detailed reproduction steps, stack traces, and root cause analysis, the PO Guardian must still run. The PO Guardian's 18-section questionnaire captures acceptance criteria, quality attributes, security, deployment, accessibility, and scope boundaries that ad-hoc descriptions miss.
- **The orchestrator's job is process enforcement, not process judgment.** It does not decide whether a description is "good enough" to skip a gate. Every gate runs, every time, for every work type.
- **Bugs, defects, and fixes follow the same pipeline as features.** The PO Guardian adapts its questionnaire to the work type — it will ask different questions for a bug than for a new feature — but it always runs.
- **"The user already explained it well" is never a valid reason to skip PO.** The PO Guardian adds structured analysis, edge case discovery, and cross-cutting concern identification that even excellent descriptions lack.

**Anti-patterns (never do these):**
- ❌ "The user described the bug clearly, so I'll go straight to Developer Guardian"
- ❌ "This is a simple fix, no need for a full ticket"
- ❌ "The user already provided acceptance criteria in their message"
- ❌ Treating the user's message body as a substitute for a PO Guardian ticket

**Correct behavior (always do this):**
- ✅ "There's no ticket for this yet. Let me invoke the PO Guardian to spec it out first." — even for well-described bugs, even for "obvious" one-line fixes

## UAT Checkpoint — After Implementation, Before Review Gate

**After the Developer Guardian completes, offer the user a chance to test before the review pipeline runs.**

When the Developer Guardian hands off its report:

1. Present the Developer's handoff report to the user (including the **worktree path**, **branch name**, and any **run/test commands**)
2. Ask the user to confirm assumptions and answer open questions
3. **Offer the UAT checkpoint:**

   > "Implementation is ready for testing. The worktree is at `[path]` on branch `[branch]`.
   > Would you like to manually test before I run the full review pipeline (QA + Security + Code Review)?
   > - **Yes** — I'll wait while you test. Tell me when you're done or if you find issues to fix.
   > - **Skip** — I'll proceed directly to the review gate."

4. **If the user opts in (or if Copilot CLI autopilot is enabled):**
   - Enter the **UAT loop**: the user tests manually against the worktree checkout
   - If the user reports issues, pair-program the fix with Developer Guardian (re-invoke on the same branch/worktree)
   - Repeat until the user says "done" or "looks good"
   - **Iteration cap:** After **3 pair-fix iterations**, recommend proceeding to the review gate. The user can override, but the default is to escalate. This cap applies universally (interactive and autopilot mode) — it prevents infinite fix loops and ensures the review Guardians provide a comprehensive assessment.
   - Then proceed to the Post-Implementation Review Gate

5. **If the user says "skip" (or declines):**
   - Proceed directly to the Post-Implementation Review Gate

**Autopilot behavior:** When Copilot CLI autopilot is enabled, the orchestrator auto-enters the UAT loop without asking. The user can still say "skip" or "done" at any time to move on. The 3-iteration pair-fix cap applies in both interactive and autopilot modes.

**Handoff information — MANDATORY:** The UAT offer MUST include these details so the user can test the exact checkout the agent modified:
- **Worktree path** — the `/tmp/dev-guardian-*` directory (or working directory if no worktree was used)
- **Branch name** — the feature branch created by Developer Guardian
- **Run/test commands** — any build, start, or test commands from the Developer's handoff report

**Worktree cleanup:** The Developer Guardian does NOT remove its worktree — it must stay alive for UAT. The orchestrator (default agent) is responsible for removing the worktree after the review gate completes and the branch is merged or abandoned:
```bash
git worktree remove /tmp/dev-guardian-XXXXXXXX
```

## Post-Implementation Review Gate — AUTOMATIC

**After UAT is complete (or skipped), automatically invoke the review pipeline.**

This gate ALWAYS runs — UAT does not replace it.

1. **Automatically invoke in parallel** (all four as background tasks):
   - **QA Guardian** — integration, E2E, contract tests
   - **Security Guardian** — OWASP scans + manual review
   - **Privacy Guardian** — PII/PHI leak detection + regulatory compliance
   - **Code Review Guardian** — linters + design review

```
Developer Guardian completes
  ↓
Default agent: presents handoff + UAT offer
  ↓
  ┌─────────────────────────────────┐
  │ UAT Checkpoint (optional)       │
  │ User tests → pair-fix if needed │
  │ "done" or "skip" to proceed     │
  └───────────────┬─────────────────┘
                  ↓
  ┌──────────────┐  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────────┐
  │ QA Guardian  │  │ Security Guardian │  │ Privacy Guardian  │  │ Code Review Guard. │
  │ (background) │  │ (background)      │  │ (background)      │  │ (background)       │
  └──────┬───────┘  └────────┬─────────┘  └────────┬─────────┘  └─────────┬─────────┘
         └──────────────────┼──────────────────────┼──────────────────────┘
                            ▼                      ▼
               Default agent: combined results
                            ▼
               "4 Guardians reviewed. Here's the summary.
                Fix these before committing?"
```

2. Present combined results from all four Guardians
3. If critical or high findings exist → recommend fixing before committing
4. If all pass → proceed to commit and PR

## Pre-Merge Gate

**After all Guardian reviews pass and CI checks pass, present results and ask for merge confirmation.**

The Developer Guardian creates the PR and pushes to the ticket branch. The pre-merge gate is NOT about creating the PR — it's about confirming the merge after everything passes:

1. All Guardian reviews (QA, Security, Privacy, Code Review) completed
2. All remote CI checks pass (build, tests, security scans)
3. No unresolved critical/high findings
4. **Spec linkage and drift checks pass** (enforced by the Code Review Guardian's spec-aware review):
   - Every PR carries a `Parent Spec:` field (path or `N/A — [reason]`)
   - When a parent spec exists, no unresolved drift findings against User Scenarios, Requirements, Success Criteria, or System Impact
   - Bug-fix PRs against an area with a parent spec have patched the spec
5. Present the combined report to the user
6. User confirms: **merge approved**

If any Guardian review is missing or has unresolved findings, say:
> "All CI checks pass, but Security Guardian has 2 high findings unresolved. Address them before merging?"

## Post-Merge Archive Gate — AUTOMATIC

**Immediately after a feature ticket merges, dispatch the Operator to archive the shipped work.**

The archive is a curated post-merge digest combining the parent spec, tickets, PR diff, and Guardian session reports into a single human-readable record at `{target_project_dir}/archive/{feature_slug}.md`.

**Trigger conditions:**
- A PR was just merged
- The PR closed at least one feature/bug ticket (`closingIssuesReferences` is non-empty)
- The ticket(s) carry a `Parent Spec:` field — either pointing to a spec file or `N/A — [reason]`

**Orchestrator action:**

```
On merge:
  1. Determine feature_slug from the parent spec path (specs/{feature_slug}/spec.md)
     OR from the dominant ticket title slug if Parent Spec is N/A
  2. Collect merged_pr_numbers (the just-merged PR + any sibling PRs in the
     same feature branch series, if applicable)
  3. Determine target_project_dir (the repo root of the merged PR)
  4. Dispatch the Operator in mode: "background" with this prompt:

     "Operator: produce a Feature Archive.
      feature_slug: {slug}
      merged_pr_numbers: {N1, N2, ...}
      target_project_dir: {abs_path}
      Save the archive to archive/{feature_slug}.md in the target project."

  5. When the Operator completes, present the archive path to the user
     with a short summary (PRs/tickets/Guardian sessions referenced).
     The Operator does NOT commit the archive — the user decides whether
     to add it to the repo.
```

**Skip conditions (do NOT dispatch):**
- The merged PR does not close any tickets (e.g., a docs-only PR with no associated work item)
- All closed tickets have `Parent Spec: N/A — [reason: trivial fix]` AND the PR is small (< 50 lines diff). The archive overhead exceeds value for trivial fixes that nobody will look back at.
- Craig is currently disabled AND the user has not explicitly opted into archiving (rare — Craig being enabled is the default once installed).

**On Operator failure (partial archive):**
- The Operator returns its archive even with missing inputs (no Guardian sessions found, PR view failed, etc.). The orchestrator still presents the archive to the user with the integrity issues flagged, rather than discarding the work.

## Pre-Deployment Gate

**Before deploying to staging or production, verify platform readiness.**

When the user asks to deploy, release, or push to an environment:
1. Check: has Platform Guardian audited the K8s manifests in this change?
2. Check: has Delivery Guardian reviewed the deployment strategy?
3. If **no** → invoke the relevant Guardian(s) before proceeding

## Workflow Summary

```
💡 Idea
  ↓
  ├─ No repo? → git init + create remote first
  ↓
  ├─ No ticket? → PO Guardian (auto, interactive)
  ↓
🎯 PO Guardian creates issue in tracker
  │     └─ For brownfield areas without a parent spec, bootstrap one from existing code
  │     └─ Decide whether to produce a Formal Spec (multi-component / cross-Guardian / architectural?)
  │     └─ For non-trivial work, consult Code Review for architectural impact
  │     └─ Finalize the Spec Kit-compatible spec at specs/{feature}/spec.md
  │     └─ Every ticket carries Parent Spec field (path or N/A — rationale)
  ↓
📋 Orchestrator presents FULL spec to user
  ↓
  ├─ User confirms → proceed
  ├─ User requests changes → PO Guardian revises
  ├─ Open questions → user answers first
  ↓
👨‍💻 Developer Guardian implements (TDD)
  ↓
🧑‍🔬 UAT Checkpoint (optional — user tests + pair-fix loop)
  ↓ (auto-triggered after UAT done/skipped)
  ├─ 🧪 QA Guardian ──────────┐
  ├─ 🛡️ Security Guardian ────┤ (parallel, background)
  ├─ 🔒 Privacy Guardian ─────┤
  ├─ 📋 Code Review Guardian ─┘ (spec drift + Parent Spec linkage)
  ↓
  Combined results → fix critical/high → commit
  ↓
  ├─ Deploy? → ⚙️ Platform Guardian + 🚀 Delivery Guardian (auto)
  ↓
  PR / Merge
  ↓
📚 Operator archives shipped feature (auto on merge)
   → archive/{feature_slug}.md (spec + tickets + PR diff + Guardian verdicts)
  ↓
  Deploy
```

## Iteration & Consultation Pattern

Reviews may require iteration. To prevent infinite loops and leverage diversity of perspective, follow this escalation ladder:

### Iteration Rules

| Pass | What Happens | Scope |
|------|-------------|-------|
| **1st pass** | Guardian reviews with primary model | Full codebase / full diff |
| **2nd pass** | Guardian reviews only what changed since the fix | Diff only — not the whole codebase |
| **3rd pass — Consultation** | Same Guardian, **different model** — fresh perspective on the disputed finding | Disputed findings only |
| **Disagreement** | Both model perspectives presented to user — human decides | — |

### How Consultation Works

When a fix introduces a new finding, or the same finding persists after two attempts:

1. **Do NOT loop with the same model** — it will likely repeat the same feedback
2. **Escalate to consultation** — re-invoke the Guardian with a different model for an independent assessment
3. The consulting model receives: the original finding, the attempted fix, and the new finding
4. If both models agree on the resolution → apply it
5. If models disagree → present both perspectives to the user with reasoning

```
Iteration 1: Code Review (Opus 4.6) → "Extract this into a service class" [SOLID SRP]
  → Developer extracts
Iteration 2: Code Review (Opus 4.6) → "Service class has too many dependencies" [SOLID DIP]
  → CONSULTATION: invoke Code Review (GPT 5.4) on the same code
  → GPT 5.4: "Dependencies are appropriate — each is a port interface. No violation."
  → Present both: "Opus sees a DIP concern, GPT considers it well-designed. Your call."
```

### Severity Gate for Re-Iteration

Not all findings warrant another pass:

| Severity | Action |
|----------|--------|
| 🔴 CRITICAL | Must fix — re-iterate until resolved or consulted |
| 🟠 HIGH | Should fix — one re-iteration, then consult if unresolved |
| 🟡 MEDIUM | Create a ticket for later — do not block or re-iterate |
| 🔵 LOW / ℹ️ INFO | Note in report — never re-iterate |

### Cross-Guardian Disputes

When different Guardians give contradictory feedback:

- Security says "add input validation here" → Code Review says "function is too long"
- **Resolution:** Both are valid. The Developer should add validation AND extract a function. Present both findings — they're complementary, not contradictory.
- If truly contradictory (one says add, other says remove) → consult with a different model, then escalate to user.

## Command Risk Classification

Before executing any command via bash, gh, kubectl, git, or any CLI tool, classify its risk level:

| Risk | Criteria | Examples | Action |
|------|----------|----------|--------|
| **LOW** | Read-only, no side effects | `ls`, `cat`, `grep`, `git log`, `git diff`, `gh issue list`, `gh pr view`, `kubectl get` | Execute normally |
| **MEDIUM** | Writes to local/worktree, reversible | `git commit`, file edits, `npm install`, `git checkout -b`, `gh issue create` | Execute, note in handoff report |
| **HIGH** | Affects remote systems or is irreversible | `gh pr merge`, `git push --force`, `kubectl delete`, `rm -rf`, `gh issue close`, `gh repo delete`, `docker rm`, `DROP TABLE`, `helm uninstall` | **STOP — ask user for explicit approval before executing** |

**HIGH-risk rule:** Show the exact command and explain its impact. Do NOT execute until the user confirms. This applies to ALL Guardians and the orchestrator, regardless of autopilot or yolo mode.

**When in doubt, classify UP** — treat an uncertain command as the higher risk level.

## Anti-Laziness Rule — Verbatim Relay in `<guardian-report>` Blocks

When a Guardian (or sub-agent) completes and you receive its output via `read_agent`, you MUST present it to the user using **mechanical verbatim relay**. This is not a "best effort" rule — it has a specific format:

### Required output format

For every Guardian completion, structure your response to the user as:

````
<guardian-report agent="{agent-name}" model="{model}" duration="{seconds}s">
{the Guardian's final response, copied verbatim, with no edits, no abbreviations,
no "..." truncation, no reordering, no merging of bullet points}
</guardian-report>

**Summary:** {your 2-5 line synthesis — what the user needs to act on}

**Recommended next step:** {one sentence}
````

The verbatim block is **mandatory**. The summary is allowed *alongside* the verbatim, never *instead of* it. If the Guardian's output is genuinely too long for a chat response (>4000 lines), break it into multiple `<guardian-report>` blocks split at section boundaries — but every line must still be present somewhere visible.

### Prohibited patterns

- ❌ "The Guardian found 3 issues — here's a summary" (without showing the report)
- ❌ "Based on the Guardian's findings, you should …" (without quoting the findings)
- ❌ "I've combined the findings from QA and Security into:" (this is paraphrasing)
- ❌ Reordering or filtering findings before presenting them
- ❌ Skipping the verbatim block because "the user already saw a notification"

### Allowed patterns

- ✅ Verbatim Guardian report in `<guardian-report>` block, followed by your summary
- ✅ Multiple Guardians in one response — one block per Guardian, then a combined summary at the end
- ✅ Adding orchestrator-level commentary AFTER the verbatim block (decisions, recommendations, follow-up questions)

This rule applies to all Guardian-to-user and Guardian-to-Guardian communication through the orchestrator. It exists because summary-only relay erodes user trust over time and hides Guardian failures (a Guardian that returns garbage looks the same as one that returns useful findings, if you only show the orchestrator's gloss).

## Canonical Constants

These are the canonical values for the SDLC Guardian system. **All other files reference this section** — when a value here changes, the change propagates by reference, not by find-and-replace across files.

### Models

| Slot | Model |
|---|---|
| **Default Guardian model** (PO, Developer, QA, Security, Privacy, Platform, Delivery, Operator) | `claude-opus-4.7` |
| **Code Review Guardian — primary instance** (dual-model review) | `claude-opus-4.7` |
| **Code Review Guardian — second instance** (dual-model review, independent perspective) | `gpt-5.5` |

When upgrading models:
1. Update **only this section**.
2. Other files reference these values by description ("the Default Guardian model", "the Code Review primary instance"), not by literal string.
3. The `~/.copilot/extensions/sdlc-guardian/uat-state-machine.mjs` file mirrors these strings for runtime context messages — keep it in sync when this section changes.

### Iteration cap

- **Max 3 pair-fix iterations** during the UAT loop before the orchestrator recommends moving to the review gate. Applies in both interactive and autopilot mode.
- **Max 3 review iterations per Guardian** before consultation (different model) is required. See "Iteration & Consultation Pattern" above.

### Severity ladder

| Severity | Symbol | Re-iteration policy |
|---|---|---|
| Critical | 🔴 | Must fix — re-iterate until resolved or consulted |
| High | 🟠 | Should fix — one re-iteration, then consult if unresolved |
| Medium | 🟡 | Create a ticket for later — do not block or re-iterate |
| Low | 🔵 | Note in report — never re-iterate |
| Info | ℹ️ | Note in report — never re-iterate |

## Memory — Two Systems, Two Purposes

This project uses two complementary memory systems. Use the right one for the right purpose; do not mix.

### Side-notes (Guardian self-learning) — RELATED, EVOLVING

Per-Guardian advisory files at `~/.copilot/instructions/{guardian}.notes.md`. Each Guardian reads its own notes at startup. Notes capture **patterns the Guardian has learned to watch for** through repeated review evidence — they evolve as the Guardian sees more of the codebase.

**Use side-notes for:**
- "Pattern X has been flagged N times — pay attention next time"
- Behavioral hints specific to one Guardian's domain (Security: "this codebase tends to log session IDs"; Code Review: "service classes grow past 200 lines here")
- Project-specific conventions that affect how the Guardian reviews

**How notes get written:** a review Guardian proposes via the Improvement Cycle, the user approves, the orchestrator appends. Never written silently.

### `store_memory` (orchestrator-scope facts) — ISOLATED, FACTUAL

Copilot CLI's built-in memory tool. Surfaces back as `<memories>` blocks at session start. Use only for **isolated, evergreen facts** the orchestrator needs across sessions.

**Use `store_memory` for:**
- Build / test / lint commands verified to work (e.g., "Run tests with `node --test src/extensions/sdlc-guardian/uat-state-machine.test.mjs`")
- Architectural facts and naming conventions (e.g., "The Operator is NOT a Guardian — file is `operator.agent.md`, not `operator-guardian.agent.md`")
- Installation paths and structural facts (e.g., "Files install to `~/.copilot/`, not `~/.github/`")
- User-stated preferences likely to apply to future sessions

**Do NOT use `store_memory` for:**
- ❌ Behavioral patterns from reviews — those belong in side-notes
- ❌ Anything specific to one Guardian's review domain — same
- ❌ Outdated facts — re-store with updated content; don't leave stale memories
- ❌ Code that's in flight (it might not merge)
- ❌ Speculation, hypothesis, or unverified claims

### When in doubt

**Skip both.** Memory is for things you'll *definitely* want to know next time. Speculation pollutes both systems.

### The rule of thumb

Ask: *"Is this a CONVENTION/FACT, or a BEHAVIORAL PATTERN from reviews?"*

- Convention / fact → `store_memory`
- Behavioral pattern → propose a side-note via the Improvement Cycle

### Retention

`store_memory` retention is managed by the platform. If a stored fact becomes outdated (e.g., a workflow step renamed, a tool replaced), call `store_memory` again with the corrected fact — the new entry replaces the old in surfacing. Do not maintain a separate amendment log.

Side-notes are managed in plain text — edit the `.notes.md` file directly to remove or update entries.

## Rules

- **Never skip a gate** — if a Guardian hasn't run, invoke it before proceeding
- **Parallel when possible** — QA, Security, Code Review run simultaneously
- **Sequential when required** — Developer must finish before reviews start
- **React to system_notifications IMMEDIATELY** — when a background agent completes, call `read_agent` right away, process results, and trigger the next pipeline step. Do NOT wait for the user to ask.
- **Max 3 iterations per Guardian** — then consult or escalate to user
- **Diff-only on re-iteration** — second pass reviews only what changed
- **User decides, not the agent** — present findings, recommend, but let the user choose
- **Track what ran** — when presenting results, show which Guardians completed and which are pending
- **Always use the Default Guardian model** — see the Canonical Constants section above for the current value. Never use the default model (Haiku) for Guardian work.
