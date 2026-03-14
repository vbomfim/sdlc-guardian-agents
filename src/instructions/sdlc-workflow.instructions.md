# SDLC Workflow Orchestration — Automatic Guardian Pipeline

This instruction enforces the SDLC Guardian pipeline automatically. The default agent MUST follow these rules to ensure no code reaches a PR without passing through the appropriate Guardians.

## Pre-Implementation Gate

**Before any implementation starts, verify a specification exists.**

When the user asks to implement, build, or code something:
1. Check: is there a GitHub issue or PO Guardian ticket for this work?
2. If **yes** → proceed to Developer Guardian
3. If **no** → invoke PO Guardian first to create the specification, then proceed

Do NOT allow implementation without a specification. Say:
> "There's no ticket for this yet. Let me invoke the PO Guardian to spec it out first."

## Post-Implementation Gate — AUTOMATIC

**After the Developer Guardian completes, automatically invoke the review pipeline.**

When the Developer Guardian hands off its report, do NOT just commit. Instead:

1. Present the Developer's handoff report to the user
2. Ask the user to confirm assumptions and answer open questions
3. Then **automatically invoke in parallel** (all three as background tasks):
   - **QA Guardian** — integration, E2E, contract tests
   - **Security Guardian** — OWASP scans + manual review
   - **Code Review Guardian** — linters + design review

```
Developer Guardian completes
  ↓
Default agent: "Implementation done. Running review pipeline..."
  ↓
  ┌──────────────┐  ┌──────────────────┐  ┌───────────────────┐
  │ QA Guardian  │  │ Security Guardian │  │ Code Review Guard. │
  │ (background) │  │ (background)      │  │ (background)       │
  └──────┬───────┘  └────────┬─────────┘  └─────────┬─────────┘
         └──────────────────┼──────────────────────┘
                            ▼
               Default agent: combined results
                            ▼
               "3 Guardians reviewed. Here's the summary.
                Fix these before committing?"
```

4. Present combined results from all three Guardians
5. If critical or high findings exist → recommend fixing before committing
6. If all pass → proceed to commit and PR

## Pre-Merge Gate

**After all Guardian reviews pass and CI checks pass, present results and ask for merge confirmation.**

The Developer Guardian creates the PR and pushes to the ticket branch. The pre-merge gate is NOT about creating the PR — it's about confirming the merge after everything passes:

1. All Guardian reviews (QA, Security, Code Review) completed
2. All remote CI checks pass (build, tests, security scans)
3. No unresolved critical/high findings
4. Present the combined report to the user
5. User confirms: **merge approved**

If any Guardian review is missing or has unresolved findings, say:
> "All CI checks pass, but Security Guardian has 2 high findings unresolved. Address them before merging?"

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
  ├─ No ticket? → PO Guardian (auto)
  ↓
🎯 PO Guardian ticket exists
  ↓
👨‍💻 Developer Guardian implements (TDD)
  ↓ (auto-triggered)
  ├─ 🧪 QA Guardian ──────────┐
  ├─ 🛡️ Security Guardian ────┤ (parallel, background)
  ├─ 📋 Code Review Guardian ─┘
  ↓
  Combined results → fix critical/high → commit
  ↓
  ├─ Deploy? → ⚙️ Platform Guardian + 🚀 Delivery Guardian (auto)
  ↓
  PR / Merge / Deploy
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

## Rules

- **Never skip a gate** — if a Guardian hasn't run, invoke it before proceeding
- **Parallel when possible** — QA, Security, Code Review run simultaneously
- **Sequential when required** — Developer must finish before reviews start
- **Max 3 iterations per Guardian** — then consult or escalate to user
- **Diff-only on re-iteration** — second pass reviews only what changed
- **User decides, not the agent** — present findings, recommend, but let the user choose
- **Track what ran** — when presenting results, show which Guardians completed and which are pending
